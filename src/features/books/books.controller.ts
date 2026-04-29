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
import z from 'zod';
import { BookService } from './books.service.ts';

const createBook = createJwtAuthHandler(BookDTOs.CreateBookContract,
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
                        return true
                    },
                ]),
            ]),
            validateBeforeAuthorization: true,
        },
    },
    async (req, auth) => {
        await BookService.createBook(auth.email, req.body);
        return {
            statusCode: 201,
            data: 'Book created successfully',
        };
    },
);

// Example 4: optional mode
// Guests can read books, but if token is present it must belong to a real user.
const getAllBooks = createHandler(
    BookDTOs.ListBooksContract,
    {
        access: 'protected',

        security: {
            authenticate: authenticateJwt,
            authSchema: JwtAuthSchema,
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
    async (req, auth) => {
        const { title, author, isbn, page, limit } = req.query;
        const effectiveLimit = auth ? limit : Math.min(limit, 5);

        const { books, totalCount } = await BookService.getAllBooks({
            title: title,
            author: author,
            isbn: isbn,
            page: page,
            limit: effectiveLimit,
        });

        return {
            data: books,
            pagination: {
                totalCount,
                page,
                limit: effectiveLimit,
            },
        };
    },
);

const getBookByIsbn = createJwtAuthHandler(BookDTOs.GetBookContract,
    {
        access: 'optional',
    },
    async (req, auth) => {
        const { isbn } = req.params;
        const { fields } = req.query;
        const book = await BookService.getBookByISBN(isbn, fields);

        return { data: book };
    },
)

const updateBook = createJwtAuthHandler(
    BookDTOs.UpdateBookContract,
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
    async (req, auth) => {
        const { isbn } = req.params;
        const updatedBook = await BookService.updateBook(isbn, auth.email, req.body);

        return { data: updatedBook };
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
    {
        security: {
            authorize: deleteBookPolicy,
        },
    },
    async (req, auth) => {
        const { isbn } = req.params;
        await BookService.deleteBook(isbn, auth.email);

        return { data: undefined };
    },
);

export const BookController = {
    createBook,
    getAllBooks,
    getBookByIsbn,
    updateBook,
    deleteBook
};
