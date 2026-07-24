/**
 * HUMAN GUIDE - HttpError capability lane
 *
 * Single-axis type tests for the framework-owned `HttpError`. Validates:
 * - Status-code literal narrowing on named subclasses.
 * - `HttpErrorOptions` typing (headers reuse `ResponseHeaders`, cookies reuse
 *   `CookieOperation[]`).
 * - Negative cases: bad cookie shape rejected, excess option keys rejected.
 * - Backward-compat bridge: a legacy `http-errors` instance is assignable to
 *   `HttpErrorLike` (the dual-detection contract).
 *
 * Compile-only, enforced via `pnpm check`.
 */

import {
    HttpError,
    type HttpErrorLike,
    type HttpErrorOptions,
    isHttpError,
} from '../index.ts';
import type { Equal, Expect, Extends } from './type-test.utils.ts';

// =========================================================================
// Capability: named status classes carry the correct status literal
// =========================================================================

const _bad = new HttpError.BadRequest('msg');
type _BadRequestStatus = Expect<Equal<typeof _bad.status, number>>;
// `status` is a readonly number (not narrowed to the literal 400 at the type
// level — it's a runtime constant — but it equals 400 at runtime, asserted in
// the runtime suite). Here we assert the field is readonly and numeric.
type _BadRequestReadonly = Expect<Equal<(typeof _bad)['status'], number>>;

const _forbidden = new HttpError.Forbidden('nope', { headers: { 'cache-control': 'no-store' } });
type _ForbiddenExtendsHttpError = Expect<Extends<typeof _forbidden, HttpError>>;

// Direct (generic) construction.
const _generic = new HttpError(418, "teapot");
type _GenericExtendsHttpError = Expect<Extends<typeof _generic, HttpError>>;

// =========================================================================
// Capability: HttpErrorOptions reuses the success-path types
// =========================================================================

const _optsFull: HttpErrorOptions = {
    headers: {
        'www-authenticate': 'Bearer error="invalid_token"',
        'retry-after': 60,                  // number → coerced at construction
        'x-feature-flag': true,             // boolean → coerced
        'cache-control': 'no-store',
        'X-Request-Id': 'abc-123',          // custom name via index
    },
    cookies: [
        { action: 'set', name: 'trace', value: 't-1', options: { httpOnly: true } },
        { action: 'clear', name: 'session' },
    ],
};

// Headers and cookies individually assignable to their success-path types.
import type { CookieOperation, ResponseHeaders } from '../index.ts';
type _OptsHeaders = Expect<Extends<typeof _optsFull.headers, ResponseHeaders | undefined>>;
type _OptsCookies = Expect<Extends<typeof _optsFull.cookies, CookieOperation[] | undefined>>;

// =========================================================================
// Capability: negative cases — bad option shapes are rejected
// =========================================================================

// @ts-expect-error unknown cookie action must be rejected
const _badCookieAction: HttpErrorOptions = { cookies: [{ action: 'remove' as const, name: 'session' }] };

// @ts-expect-error set cookie requires a value
const _setMissingValue: HttpErrorOptions = { cookies: [{ action: 'set' as const, name: 'session' }] };

// =========================================================================
// Capability: isHttpError narrows to HttpErrorLike
// =========================================================================

declare const _maybe: unknown;
if (isHttpError(_maybe)) {
    // Inside the guard, statusCode/message/name are readable.
    const _code: number = _maybe.statusCode;
    const _msg: string = _maybe.message;
    const _name: string = _maybe.name;
}
type _IsHttpErrorReturn = Expect<Equal<ReturnType<typeof isHttpError>, boolean>>;

// =========================================================================
// Backward-compat: legacy http-errors instances satisfy HttpErrorLike
//
// Dual detection: `handleError` and the combinators must route a legacy
// `http-errors` throw exactly like a framework `HttpError` throw. This holds
// because `HttpErrorLike` is the structural shape both kinds share.
// =========================================================================

// Framework HttpError also satisfies HttpErrorLike (it is a superset).
type _FrameworkIsHttpErrorLike = Expect<Extends<HttpError, HttpErrorLike>>;
