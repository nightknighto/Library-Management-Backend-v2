/**
 * @file http-error.core.ts
 *
 * Framework-owned HTTP error type. Replaces the `http-errors` dependency for
 * the framework surface: a self-contained, fully-typed `HttpError` that also
 * carries declarative response {@link ResponseHeaders} and {@link CookieOperation}
 * side-effects to apply on the error response.
 *
 * Why own it: `http-errors` is almost entirely a constructor-generation machine
 * whose output (per-status classes) we regenerate here as static, tree-shakeable
 * classes. The framework only ever needed one runtime thing from it (error
 * detection) and one type (the error shape); both are owned here now. Legacy
 * `http-errors` instances thrown by unmigrated code are still detected via the
 * structural fallback in {@link isHttpError}.
 *
 * Error side-effects (headers/cookies) are a throw-carrier: the error source
 * (authenticator, authorizer, handler, or service) decorates the error it
 * throws, and {@link handleHttpError} applies them at the single error
 * chokepoint. They are applied headers-first, then cookies, matching the
 * success path.
 *
 * Status classes attach as static fields on `HttpError` (e.g.
 * `HttpError.Forbidden`) rather than via a `namespace`, which is banned by the
 * `erasableSyntaxOnly` tsconfig. Named class expressions keep each instance's
 * `.name` correct (e.g. `'Forbidden'`) for logging, with no per-class bookkeeping.
 */

import type { CookieOperation, ResponseHeaders } from './types.core.ts';

// ============================================================================
// SECTION 1: HEADER COERCION
// ============================================================================

/**
 * Coerces a {@link ResponseHeaders} map to the plain `Record<string, string>`
 * shape stored on an {@link HttpError}.
 *
 * Mirrors the success-path coercion in `createHandler`: numbers and booleans
 * become strings, and multi-value arrays join into a single comma-separated
 * value (the way Express serializes a `string[]` passed to `res.set`). Coercing
 * at construction time means `error.headers` already holds the final strings.
 *
 * @internal
 */
function coerceHeaderValues(headers: ResponseHeaders): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(headers)) {
        if (value === undefined) continue;
        out[name] = Array.isArray(value) ? value.join(', ') : String(value);
    }
    return out;
}

// ============================================================================
// SECTION 2: OPTIONS
// ============================================================================

/**
 * Optional side-effects attached to an {@link HttpError}, applied to the error
 * response by {@link handleHttpError}.
 *
 * Both fields reuse the success-path types so a single mental model covers
 * success and error responses.
 */
export interface HttpErrorOptions {
    /**
     * Response headers to set on the error response. Standard HTTP header names
     * (e.g. `www-authenticate`, `retry-after`, `cache-control`) autocomplete;
     * arbitrary custom names are accepted via the string index. Values may be
     * `string`, `number`, `boolean`, or `string[]` — coerced to strings at
     * construction (arrays become comma-separated).
     *
     * @example
     * { headers: { 'www-authenticate': 'Bearer error="invalid_token"' } }
     */
    headers?: ResponseHeaders;
    /**
     * Cookie operations to apply on the error response, after headers. Same
     * `set`/`clear` discriminated shape as the success-path `cookies` field.
     *
     * @example
     * { cookies: [{ action: 'clear', name: 'session' }] }
     */
    cookies?: CookieOperation[];
}

// ============================================================================
// SECTION 3: BASE ERROR CLASS
// ============================================================================

/**
 * A framework HTTP error that becomes an HTTP response, optionally carrying
 * response headers and cookies to apply on that response.
 *
 * The base class is instantiable with an explicit status code. For readability,
 * prefer the named status classes under `HttpError` — e.g.
 * `new HttpError.Forbidden('msg')` over `new HttpError(403, 'msg')`.
 *
 * Throw one from anywhere the framework routes errors — an authenticator, an
 * authorizer, a handler, or a service. Its `statusCode` and `message` become
 * the response, and any `headers`/`cookies` from the options are applied first.
 *
 * The status must be an integer in the 400–599 range; anything else throws a
 * `RangeError` at construction (a clear developer error, never a silent 500).
 *
 * @example
 * // Direct (generic status):
 * throw new HttpError(422, 'Unprocessable entity', {
 *   headers: { 'retry-after': 60 },
 *   cookies: [{ action: 'clear', name: 'session' }],
 * });
 *
 * @example
 * // Named status shortcut (preferred for known codes):
 * throw new HttpError.Unauthorized('Token expired', {
 *   headers: { 'www-authenticate': 'Bearer error="invalid_token"' },
 * });
 */
export class HttpError extends Error {
    /** HTTP status code (alias of {@link statusCode}). */
    readonly status: number;
    /** HTTP status code. */
    readonly statusCode: number;
    /**
     * Whether the error details are safe to expose to the client. `true` for
     * 4xx, `false` for 5xx — preserving the `http-errors` convention for any
     * consumer that reads it.
     */
    readonly expose: boolean;
    /**
     * Response headers to apply on the error response (already coerced to
     * strings at construction). Applied before cookies.
     */
    readonly headers?: Record<string, string>;
    /**
     * Cookie operations to apply on the error response, after headers. Same
     * `set`/`clear` shape as the success-path `cookies`.
     */
    readonly cookies?: CookieOperation[];

    /**
     * @param status - HTTP status code (integer in 400–599).
     * @param message - Error message used as the response error body.
     * @param options - Optional response headers and cookies.
     */
    constructor(status: number, message: string, options?: HttpErrorOptions) {
        if (!Number.isInteger(status) || status < 400 || status > 599) {
            throw new RangeError(
                `HttpError: status must be an integer in 400–599, got ${status}.`,
            );
        }
        super(message);
        // `this.constructor` is the concrete subclass (e.g. the Forbidden class
        // expression) when one is instantiated, so the instance `.name` tracks
        // the status class. For direct `new HttpError(...)` it is 'HttpError'.
        this.name = this.constructor.name;
        this.status = status;
        this.statusCode = status;
        this.expose = status < 500;
        if (options?.headers) {
            this.headers = coerceHeaderValues(options.headers);
        }
        if (options?.cookies) {
            this.cookies = options.cookies;
        }
        // Clean the stack by removing the HttpError frame (V8/Node). Guarded for
        // environments without captureStackTrace.
        Error.captureStackTrace?.(this, this.constructor);
    }

    // -------------------------------------------------------------------------
    // Named status classes (400–451 client errors).
    // -------------------------------------------------------------------------
    // One per standard HTTP status, attached as a static field so they appear
    // under `HttpError.` autocomplete. Each defaults its message to the standard
    // reason phrase when omitted. Named class expressions keep `.name` correct.

    /** 400 Bad Request. */
    static readonly BadRequest = class BadRequest extends HttpError {
        /** @param message - Defaults to "Bad Request". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(400, message ?? 'Bad Request', options);
        }
    };
    /** 401 Unauthorized. */
    static readonly Unauthorized = class Unauthorized extends HttpError {
        /** @param message - Defaults to "Unauthorized". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(401, message ?? 'Unauthorized', options);
        }
    };
    /** 402 Payment Required. */
    static readonly PaymentRequired = class PaymentRequired extends HttpError {
        /** @param message - Defaults to "Payment Required". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(402, message ?? 'Payment Required', options);
        }
    };
    /** 403 Forbidden. */
    static readonly Forbidden = class Forbidden extends HttpError {
        /** @param message - Defaults to "Forbidden". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(403, message ?? 'Forbidden', options);
        }
    };
    /** 404 Not Found. */
    static readonly NotFound = class NotFound extends HttpError {
        /** @param message - Defaults to "Not Found". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(404, message ?? 'Not Found', options);
        }
    };
    /** 405 Method Not Allowed. */
    static readonly MethodNotAllowed = class MethodNotAllowed extends HttpError {
        /** @param message - Defaults to "Method Not Allowed". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(405, message ?? 'Method Not Allowed', options);
        }
    };
    /** 406 Not Acceptable. */
    static readonly NotAcceptable = class NotAcceptable extends HttpError {
        /** @param message - Defaults to "Not Acceptable". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(406, message ?? 'Not Acceptable', options);
        }
    };
    /** 407 Proxy Authentication Required. */
    static readonly ProxyAuthenticationRequired = class ProxyAuthenticationRequired extends HttpError {
        /** @param message - Defaults to "Proxy Authentication Required". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(407, message ?? 'Proxy Authentication Required', options);
        }
    };
    /** 408 Request Timeout. */
    static readonly RequestTimeout = class RequestTimeout extends HttpError {
        /** @param message - Defaults to "Request Timeout". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(408, message ?? 'Request Timeout', options);
        }
    };
    /** 409 Conflict. */
    static readonly Conflict = class Conflict extends HttpError {
        /** @param message - Defaults to "Conflict". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(409, message ?? 'Conflict', options);
        }
    };
    /** 410 Gone. */
    static readonly Gone = class Gone extends HttpError {
        /** @param message - Defaults to "Gone". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(410, message ?? 'Gone', options);
        }
    };
    /** 411 Length Required. */
    static readonly LengthRequired = class LengthRequired extends HttpError {
        /** @param message - Defaults to "Length Required". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(411, message ?? 'Length Required', options);
        }
    };
    /** 412 Precondition Failed. */
    static readonly PreconditionFailed = class PreconditionFailed extends HttpError {
        /** @param message - Defaults to "Precondition Failed". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(412, message ?? 'Precondition Failed', options);
        }
    };
    /** 413 Payload Too Large. */
    static readonly PayloadTooLarge = class PayloadTooLarge extends HttpError {
        /** @param message - Defaults to "Payload Too Large". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(413, message ?? 'Payload Too Large', options);
        }
    };
    /** 414 URI Too Long. */
    static readonly URITooLong = class URITooLong extends HttpError {
        /** @param message - Defaults to "URI Too Long". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(414, message ?? 'URI Too Long', options);
        }
    };
    /** 415 Unsupported Media Type. */
    static readonly UnsupportedMediaType = class UnsupportedMediaType extends HttpError {
        /** @param message - Defaults to "Unsupported Media Type". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(415, message ?? 'Unsupported Media Type', options);
        }
    };
    /** 416 Range Not Satisfiable. */
    static readonly RangeNotSatisfiable = class RangeNotSatisfiable extends HttpError {
        /** @param message - Defaults to "Range Not Satisfiable". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(416, message ?? 'Range Not Satisfiable', options);
        }
    };
    /** 417 Expectation Failed. */
    static readonly ExpectationFailed = class ExpectationFailed extends HttpError {
        /** @param message - Defaults to "Expectation Failed". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(417, message ?? 'Expectation Failed', options);
        }
    };
    /** 418 I'm a Teapot. */
    static readonly ImATeapot = class ImATeapot extends HttpError {
        /** @param message - Defaults to "I'm a Teapot". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(418, message ?? "I'm a Teapot", options);
        }
    };
    /** 421 Misdirected Request. */
    static readonly MisdirectedRequest = class MisdirectedRequest extends HttpError {
        /** @param message - Defaults to "Misdirected Request". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(421, message ?? 'Misdirected Request', options);
        }
    };
    /** 422 Unprocessable Entity. */
    static readonly UnprocessableEntity = class UnprocessableEntity extends HttpError {
        /** @param message - Defaults to "Unprocessable Entity". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(422, message ?? 'Unprocessable Entity', options);
        }
    };
    /** 423 Locked. */
    static readonly Locked = class Locked extends HttpError {
        /** @param message - Defaults to "Locked". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(423, message ?? 'Locked', options);
        }
    };
    /** 424 Failed Dependency. */
    static readonly FailedDependency = class FailedDependency extends HttpError {
        /** @param message - Defaults to "Failed Dependency". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(424, message ?? 'Failed Dependency', options);
        }
    };
    /** 425 Too Early. */
    static readonly TooEarly = class TooEarly extends HttpError {
        /** @param message - Defaults to "Too Early". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(425, message ?? 'Too Early', options);
        }
    };
    /** 426 Upgrade Required. */
    static readonly UpgradeRequired = class UpgradeRequired extends HttpError {
        /** @param message - Defaults to "Upgrade Required". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(426, message ?? 'Upgrade Required', options);
        }
    };
    /** 428 Precondition Required. */
    static readonly PreconditionRequired = class PreconditionRequired extends HttpError {
        /** @param message - Defaults to "Precondition Required". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(428, message ?? 'Precondition Required', options);
        }
    };
    /** 429 Too Many Requests. */
    static readonly TooManyRequests = class TooManyRequests extends HttpError {
        /** @param message - Defaults to "Too Many Requests". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(429, message ?? 'Too Many Requests', options);
        }
    };
    /** 431 Request Header Fields Too Large. */
    static readonly RequestHeaderFieldsTooLarge = class RequestHeaderFieldsTooLarge extends HttpError {
        /** @param message - Defaults to "Request Header Fields Too Large". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(431, message ?? 'Request Header Fields Too Large', options);
        }
    };
    /** 451 Unavailable For Legal Reasons. */
    static readonly UnavailableForLegalReasons = class UnavailableForLegalReasons extends HttpError {
        /** @param message - Defaults to "Unavailable For Legal Reasons". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(451, message ?? 'Unavailable For Legal Reasons', options);
        }
    };

    // -------------------------------------------------------------------------
    // Named status classes (500–511 server errors).
    // -------------------------------------------------------------------------

    /** 500 Internal Server Error. */
    static readonly InternalServerError = class InternalServerError extends HttpError {
        /** @param message - Defaults to "Internal Server Error". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(500, message ?? 'Internal Server Error', options);
        }
    };
    /** 501 Not Implemented. */
    static readonly NotImplemented = class NotImplemented extends HttpError {
        /** @param message - Defaults to "Not Implemented". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(501, message ?? 'Not Implemented', options);
        }
    };
    /** 502 Bad Gateway. */
    static readonly BadGateway = class BadGateway extends HttpError {
        /** @param message - Defaults to "Bad Gateway". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(502, message ?? 'Bad Gateway', options);
        }
    };
    /** 503 Service Unavailable. */
    static readonly ServiceUnavailable = class ServiceUnavailable extends HttpError {
        /** @param message - Defaults to "Service Unavailable". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(503, message ?? 'Service Unavailable', options);
        }
    };
    /** 504 Gateway Timeout. */
    static readonly GatewayTimeout = class GatewayTimeout extends HttpError {
        /** @param message - Defaults to "Gateway Timeout". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(504, message ?? 'Gateway Timeout', options);
        }
    };
    /** 505 HTTP Version Not Supported. */
    static readonly HTTPVersionNotSupported = class HTTPVersionNotSupported extends HttpError {
        /** @param message - Defaults to "HTTP Version Not Supported". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(505, message ?? 'HTTP Version Not Supported', options);
        }
    };
    /** 506 Variant Also Negotiates. */
    static readonly VariantAlsoNegotiates = class VariantAlsoNegotiates extends HttpError {
        /** @param message - Defaults to "Variant Also Negotiates". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(506, message ?? 'Variant Also Negotiates', options);
        }
    };
    /** 507 Insufficient Storage. */
    static readonly InsufficientStorage = class InsufficientStorage extends HttpError {
        /** @param message - Defaults to "Insufficient Storage". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(507, message ?? 'Insufficient Storage', options);
        }
    };
    /** 508 Loop Detected. */
    static readonly LoopDetected = class LoopDetected extends HttpError {
        /** @param message - Defaults to "Loop Detected". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(508, message ?? 'Loop Detected', options);
        }
    };
    /** 509 Bandwidth Limit Exceeded. */
    static readonly BandwidthLimitExceeded = class BandwidthLimitExceeded extends HttpError {
        /** @param message - Defaults to "Bandwidth Limit Exceeded". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(509, message ?? 'Bandwidth Limit Exceeded', options);
        }
    };
    /** 510 Not Extended. */
    static readonly NotExtended = class NotExtended extends HttpError {
        /** @param message - Defaults to "Not Extended". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(510, message ?? 'Not Extended', options);
        }
    };
    /** 511 Network Authentication Required. */
    static readonly NetworkAuthenticationRequired = class NetworkAuthenticationRequired extends HttpError {
        /** @param message - Defaults to "Network Authentication Required". @param options - Response headers/cookies. */
        constructor(message?: string, options?: HttpErrorOptions) {
            super(511, message ?? 'Network Authentication Required', options);
        }
    };
}

// ============================================================================
// SECTION 4: DETECTION
// ============================================================================

/**
 * Structural shape satisfied by both the framework {@link HttpError} and legacy
 * `http-errors` instances. Lets consumers read status/message/headers/cookies
 * uniformly regardless of which kind of HTTP error was thrown.
 */
export interface HttpErrorLike {
    /** Error class name (e.g. `'Forbidden'`), used for logging/error codes. */
    readonly name: string;
    /** HTTP status code. */
    readonly statusCode: number;
    /** HTTP status code (alias). */
    readonly status: number;
    /** Error message used as the response body. */
    readonly message: string;
    /** Client-safety flag (`true` for 4xx). */
    readonly expose: boolean;
    /** Response headers to apply on the error response, if any. */
    readonly headers?: Record<string, string>;
    /** Cookie operations to apply on the error response, if any. */
    readonly cookies?: CookieOperation[];
}

/**
 * Type guard for any HTTP-shaped error — the framework's own {@link HttpError}
 * or a legacy `http-errors` instance.
 *
 * Used by the error handler and the policy combinators (`anyOf`/`not`) to tell
 * an HTTP denial (status + message, optionally swallowable) apart from an
 * unexpected error. The structural fallback (`expose`/`statusCode`/`status`)
 * matches exactly the fields `http-errors` always sets, so it recognizes
 * unmigrated code's throws without depending on the `http-errors` package.
 *
 * @param error - Any caught value.
 * @returns `true` when `error` is an HTTP-shaped error.
 *
 * @example
 * try {
 *   await authorize(params);
 * } catch (error) {
 *   if (isHttpError(error)) {
 *     // error.statusCode, error.message, error.headers?, error.cookies?
 *   }
 * }
 */
export function isHttpError(error: unknown): error is HttpErrorLike {
    if (error instanceof HttpError) return true;
    if (error === null || typeof error !== 'object') return false;
    const e = error as HttpErrorLike;
    return (
        typeof e.statusCode === 'number' &&
        typeof e.status === 'number' &&
        e.status === e.statusCode &&
        typeof e.expose === 'boolean'
    );
}
