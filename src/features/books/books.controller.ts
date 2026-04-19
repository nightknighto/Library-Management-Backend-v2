import { BookRepository } from './books.repository.ts';
import * as BookDTOs from './books.schemas.ts';
import createHttpError from 'http-errors';
import {
    type AfterAuthorizationRequest,
    allOf,
    anyOf,
    createHandler,
    not,
} from '../../core/create-handler.core.ts';
import { UserRepository } from '../users/users.repository.ts';
import { type JwtAuthContext, authenticateJwt, JwtAuthSchema, hasRegisteredUser, isLibraryStaff, hasWriteAccessHeader, editsOwnAuthorName, isSystemReservedBook, createJwtAuthHandler, deleteBookPolicy } from '../auth-stuff.ts';

const createBook = createJwtAuthHandler(BookDTOs.CreateBookContract,
    async (req, auth) => {
        const _requestedBy = auth.email;
        const book = await BookRepository.createBook(auth.email, req.body);
        if (!book) {
            throw new createHttpError.BadRequest('Book with this ISBN already exists');
        }

        return {
            statusCode: 201,
            data: 'Book created successfully',
        };
    },
    {
        security: {
            // Example 1: allOf + anyOf
            // Must be a registered user, and either staff email OR internal header override.
            authorize: allOf<
                JwtAuthContext,
                AfterAuthorizationRequest<typeof BookDTOs.CreateBookContract>
            >([
                hasRegisteredUser,
                async ({ auth, req }) => {
                    const existingUser = await UserRepository.getUser(auth.email);
                    return Boolean(existingUser);
                },
                anyOf([
                    isLibraryStaff,
                    hasWriteAccessHeader,
                    async ({ auth, req }) => {
                        return false
                    },
                ]),
            ]),
            validateBeforeAuthorization: true,
        },
    },
);

// Example 4: optional mode
// Guests can read books, but if token is present it must belong to a real user.
const getAllBooks = createHandler(
    BookDTOs.ListBooksContract,
    async (req, auth) => {
        const { title, author, isbn, page, limit } = req.query;
        const effectiveLimit = auth ? limit : Math.min(limit, 5);

        const books = await BookRepository.getAllBooks({
            title: title,
            author: author,
            isbn: isbn,
            page: page,
            limit: effectiveLimit,
        });

        const totalCount = await BookRepository.countBooks({ title, author: author, isbn });

        return {
            data: books,
            pagination: {
                totalCount,
                page,
                limit: effectiveLimit,
            },
        };
    },
    {
        access: 'protected',

        security: {
            authenticate: authenticateJwt,
            // authSchema: JwtAuthSchema,
            // could be inline function
            authorize: async ({ auth, req }) => {
                const existingUser = await UserRepository.getUser(auth.email);
                return Boolean(existingUser);
            },
            validateBeforeAuthorization: true,
        },
        errors: {
            unauthorized: () => new createHttpError.Forbidden('Invalid authenticated user'),
        },
    },
);

const getBookByIsbn = createJwtAuthHandler(BookDTOs.GetBookContract,
    async (req, auth) => {
        const { isbn } = req.params;
        const { fields } = req.query;
        const book = await BookRepository.getBookByIsbn(isbn);
        if (!book) {
            // return res.status(404).json({ success: false, error: 'Book not found' });
            throw new createHttpError.NotFound('Book not found');
        }

        if (fields.length > 0) {
            const selectedFields = fields.reduce((acc, field) => {
                acc[field] = book[field];
                return acc;
            }, {} as Record<keyof typeof book, any>);

            return { data: selectedFields };
        }


        return { data: book };
    },
    {
        access: 'optional',
    }
)

const updateBook = createJwtAuthHandler(
    BookDTOs.UpdateBookContract,
    async (req, auth) => {
        const _requestedBy = auth.email;
        const { isbn } = req.params;
        const updatedBook = await BookRepository.updateBook(isbn, auth.email, req.body);
        if (!updatedBook) {
            throw new createHttpError.NotFound('Book not found');
        }

        return { data: updatedBook };
    },
    {
        access: 'protected',

        // Example 2: anyOf
        // Either staff users can edit, or users can edit when payload "author" matches their email handle.
        security: {
            authorize: anyOf<JwtAuthContext>([
                isLibraryStaff,
                editsOwnAuthorName,
            ])
        },
    },
);

// // Example 3: allOf + not
// // Delete allowed only for staff, and system-reserved books cannot be deleted.
// const deleteBookPolicyLocal = allOf<JwtAuthContext>([
//     hasRegisteredUser,
//     isLibraryStaff,
//     not<JwtAuthContext>(isSystemReservedBook),
// ]);

const deleteBook = createJwtAuthHandler(
    BookDTOs.DeleteBookContract,
    async (req, auth) => {
        const _requestedBy = auth.email;
        const { isbn } = req.params;
        const book = await BookRepository.deleteBook(isbn, auth.email);
        if (!book) {
            throw new createHttpError.NotFound('Book not found');
        }

        return { data: undefined };
    },
    {
        security: {
            authorize: deleteBookPolicy,
        },
    },
);

export const BookController = {
    createBook,
    getAllBooks,
    getBookByIsbn,
    updateBook,
    deleteBook
};
