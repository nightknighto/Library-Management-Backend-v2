import createHttpError from 'http-errors';
import { anyOf, createHandler, not } from '../../core/index.ts';
import {
    authenticateJwt,
    canEditBook,
    createJwtAuthHandler,
    hasRegisteredUser,
    hasWriteAccessHeader,
    isLibraryStaff,
    isSystemReservedBook,
    type JwtAuthContext,
    JwtAuthSchema,
} from '../../shared/auth-stuff.ts';
import { UserRepository } from '../users/users.repository.ts';
import * as BookDTOs from './books.schemas.ts';
import { BookService } from './books.service.ts';

const createBook = createJwtAuthHandler(
    BookDTOs.CreateBookContract,
    {
        security: {
            // Example 1: bucket array + anyOf.
            // The afterValidation bucket AND-composes its elements (no allOf needed
            // at the top level). anyOf remains essential for the OR branch.
            // Must be a registered user, and either staff email OR internal header override.
            authorize: {
                afterValidation: [
                    hasRegisteredUser,
                    async ({ auth }) => {
                        const existingUser = await UserRepository.getUser(auth.email);
                        if (!existingUser) throw new createHttpError.Forbidden('Registered user only');
                        return true;
                    },
                    anyOf<JwtAuthContext>([isLibraryStaff, hasWriteAccessHeader, async () => true]),
                ],
            },
        },
    },
    async ({ req, auth }) => {
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
            authorize: {
                afterValidation: [
                    async ({ auth }) => {
                        const existingUser = await UserRepository.getUser(auth.email);
                        if (!existingUser) throw new createHttpError.Forbidden('Registered user only');
                        return true;
                    },
                ],
            },
        },
    },
    async ({ req, auth }) => {
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

const getBookByIsbn = createJwtAuthHandler(
    BookDTOs.GetBookContract,
    {
        access: 'optional',
    },
    async ({ req, auth }) => {
        const { isbn } = req.params;
        const { fields } = req.query;
        const book = await BookService.getBookByISBN(isbn, fields);

        return { data: book };
    },
);

const updateBook = createJwtAuthHandler(
    BookDTOs.UpdateBookContract,
    {
        access: 'protected',

        // Example 2: essential allOf via reusable composite.
        // canEditBook = anyOf([isLibraryStaff, allOf([hasRegisteredUser, editsOwnAuthorName])]).
        // allOf is essential here: the AND group (registered + own-name) is one branch
        // of an anyOf, which a bare bucket array cannot express. The composite is
        // imported as a single Authorizer value and dropped straight into the bucket.
        security: {
            authorize: {
                beforeValidation: [canEditBook],
            },
        },
    },
    async ({ req, auth }) => {
        const { isbn } = req.params;
        const updatedBook = await BookService.updateBook(isbn, auth.email, req.body);

        return { data: updatedBook };
    },
);

const deleteBook = createJwtAuthHandler(
    BookDTOs.DeleteBookContract,
    {
        // Mixed-phase authorization: fail-fast identity checks run before
        // validation (no typed request needed), while the system-reserved-book
        // check runs after validation against the typed params. Semantically
        // equivalent to allOf([hasRegisteredUser, isLibraryStaff, not(isSystemReservedBook)]).
        security: {
            authorize: {
                beforeValidation: [hasRegisteredUser, isLibraryStaff],
                afterValidation: [not<JwtAuthContext>(isSystemReservedBook)],
            },
        },
    },
    async ({ req, auth }) => {
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
    deleteBook,
};

createHandler(BookDTOs.UpdateBookContract,
    {
        access: 'optional',
        security: {
            authenticate: authenticateJwt
        }
    },
    async ({ req, auth }) => ({ data: { isbn: 'x', title: 'x', author: 'x', shelf: 'x', total_quantity: 1 } })
)

// createHandler(BookDTOs.UpdateBookContract,
//     {
//         access: 'public',
//     },
//     ({ req }) => {
//         return {
//             data: 1 as any
//         }
//     }

// )
