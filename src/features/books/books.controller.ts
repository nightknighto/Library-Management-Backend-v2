import { anyOf, createHandler, createHandlerFactory, HttpError, not } from '../../core/index.ts';
import {
    authenticateJwt,
    canEditBook,
    createJwtAuthHandler,
    hasRegisteredUser,
    hasWriteAccessHeader,
    isLibraryStaff,
    isSystemReservedBook,
    type JwtAuthContext,
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
                        if (!existingUser) {
                            throw new HttpError.Forbidden('Registered user only', {
                                headers: { 'x-error-code': 'REGISTERED_USER_ONLY' },
                            });
                        }
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
            headers: {
                location: `/books/${req.body.isbn}`,
                'cache-control': 'no-store',
            },
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
            // could be inline function
            authorize: {
                afterValidation: [
                    async ({ auth }) => {
                        const existingUser = await UserRepository.getUser(auth.email);
                        if (!existingUser) throw new HttpError.Forbidden('Registered user only', {
                            cookies: [{ action: 'clear', name: 'session' }],
                            headers: { 'x-error-code': 'REGISTERED_USER_ONLY' },
                        });
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

// =============================================================================
// `.extend()` — factory-extends-factory examples (books proving ground)
//
// `createJwtAuthHandler` is a SecuredFactory<JwtAuthContext, 'protected'>: it
// baselines JWT authentication but no baseline authorization. `.extend()`
// layers `authorize` buckets on top, producing a new first-class factory whose
// every handler runs the baseline authenticate AND the extended policy. The
// authenticator is transitively locked (a child can never swap it), and access
// may move between protected/optional but never widen to public.
// =============================================================================

// ---------------------------------------------------------------------------
// Example 1: baseline a repeated policy into a factory.
// `deleteBook` above hand-repeats [hasRegisteredUser, isLibraryStaff] as its
// beforeValidation bucket. Any staff-only endpoint must redeclare them. Extend
// the JWT factory once and every derived handler inherits the staff baseline.
// ---------------------------------------------------------------------------
const libraryStaffFactory = createJwtAuthHandler.extend({
    security: {
        // After this, every libraryStaffFactory handler authenticates via JWT
        // (inherited, locked) AND passes hasRegisteredUser + isLibraryStaff
        // before validation runs.
        authorize: { beforeValidation: [hasRegisteredUser, isLibraryStaff] },
    },
});

// A staff-only delete that additionally blocks system-reserved books. The
// factory supplies the staff baseline; the call site supplies only what's
// specific to this endpoint.
const deleteBookV2 = libraryStaffFactory(
    BookDTOs.DeleteBookContract,
    {
        security: {
            authorize: { afterValidation: [not<JwtAuthContext>(isSystemReservedBook)] },
        },
    },
    async ({ req, auth }) => {
        const { isbn } = req.params;
        await BookService.deleteBook(isbn, auth.email);
        return { data: undefined };
    },
);
void deleteBookV2;

// ---------------------------------------------------------------------------
// Example 2: chained extension — policies accumulate across layers.
// Each .extend concatenates its authorize buckets after the parent's, so a
// chain is a baseline stack: jwt → +staff → +registered. The terminal factory's
// handlers run all of them, in order.
// ---------------------------------------------------------------------------
const staffAndRegisteredFactory = libraryStaffFactory
    // hasRegisteredUser is already in the parent's bucket; re-declaring it runs
    // it again (no dedup) — harmless here, illustrative of the additive model.
    .extend({
        security: {
            authorize: { beforeValidation: [hasRegisteredUser] },
        },
    });
void staffAndRegisteredFactory;

// ---------------------------------------------------------------------------
// Example 3: public-factory upgrade.
// A public factory has no authenticator. `.extend()` upgrades it to a secured
// one by supplying the "first setter" authenticator; after that, descendants
// are locked. Useful when a public baseline should gain a pipeline without
// being rebuilt from createHandlerFactory.
// ---------------------------------------------------------------------------
const publicFactory = createHandlerFactory({ access: 'public' });
const jwtFromPublic = publicFactory.extend({
    access: 'protected',
    security: {
        authenticate: authenticateJwt,
    },
});
void jwtFromPublic;

// ---------------------------------------------------------------------------
// Example 4: access transition (protected → optional).
// A protected factory can move to optional without losing its pipeline: same
// authenticate, same authorize baseline. Note the `optional` semantics: when a
// guest (no/invalid token) hits the endpoint, authentication returns null and
// the authorize buckets are SKIPPED for that request — so the inherited staff
// baseline does not enforce anything for guests, it only applies to callers who
// present a valid token. `auth` is `JwtAuthContext | undefined` in the handler.
// ---------------------------------------------------------------------------
const optionalStaffFactory = libraryStaffFactory.extend({ access: 'optional' });
const _optionalStaffExample = optionalStaffFactory(
    BookDTOs.GetBookContract,
    async ({ req, auth }) => {
        // auth is JwtAuthContext | undefined under optional access.
        void auth;
        const { isbn } = req.params;
        const { fields } = req.query;
        const book = await BookService.getBookByISBN(isbn, fields);
        return { data: book };
    },
);
void _optionalStaffExample;
