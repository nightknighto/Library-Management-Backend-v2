# createHandler Security Guide

This guide documents the full security API around createHandler and createHandlerFactory.

It covers:
- Access modes (public, optional, protected)
- Authentication and authorization options
- before vs after authorization timing
- Typed policies with allOf, anyOf, and not
- Factory defaults and per-handler overrides
- The explicit second generic pattern for policy combinators

## 1. Core Concepts

Security is configured through handler options:

- Signature forms:
  - `createHandler(contract, handler)` when no options are needed
  - `createHandler(contract, options, handler)` when options are provided

- access:
  - public: no auth required
  - optional: auth is optional, handler can receive auth if present
  - protected: auth is required
- security.authenticate:
  - Function that builds auth context from request
- security.authSchema:
  - Optional Zod schema to validate parsed auth context
- security.authorize:
  - Nested timing buckets: `beforeValidation` and/or `afterValidation`
  - Each bucket is an array of policies (logical-AND, short-circuit on first failure)
  - `beforeValidation` policies receive the raw request (fail-fast)
  - `afterValidation` policies receive the validated request (typed body/query/params)
  - A handler may use either bucket, both, or neither — there is no global before/after toggle
- errors.unauthenticated / errors.unauthorized:
  - Optional custom error mappers

## 2. Imports You Will Use

```ts
import createHttpError from "http-errors";
import { z } from "zod";

import {
  createHandler,
  createHandlerFactory,
  allOf,
  anyOf,
  not,
  type HandlerRequest,
  type AfterAuthorizationRequest,
} from "../src/core/create-handler.core.ts";
import type {
  Authenticator,
  Authorizer,
} from "../src/core/types.core.ts";
```

## 3. Auth Context Setup

```ts
type JwtAuthContext = {
  email: string;
  role: "member" | "staff";
};

const JwtAuthSchema = z.object({
  email: z.string().email(),
  role: z.enum(["member", "staff"]),
});

const authenticateJwt: Authenticator<JwtAuthContext> = async (req) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return null;
  }

  // decode token and return context
  return { email: "a@library.local", role: "staff" };
};

const isStaff: Authorizer<JwtAuthContext> = ({ auth }) => auth.role === "staff";
const hasWriteHeader: Authorizer<JwtAuthContext> = ({ req }) => req.headers["x-write-access"] === "enabled";
```

## 4. Basic Handler Patterns

### 4.1 public

```ts
const listBooks = createHandler(ListBooksContract, async (req) => {
  return { data: [] };
});
```

### 4.2 optional

```ts
const listBooksOptional = createHandler(
  ListBooksContract,
  {
    access: "optional",
    security: {
      authenticate: authenticateJwt,
    },
  },
  async (req, auth) => {
    const limit = auth ? req.query.limit : Math.min(req.query.limit, 5);
    return { data: [], pagination: { totalCount: 0, page: 1, limit } };
  },
);
```

### 4.3 protected

```ts
const createBook = createHandler(
  CreateBookContract,
  {
    access: "protected",
    security: {
      authenticate: authenticateJwt,
      authSchema: JwtAuthSchema,
      authorize: { beforeValidation: [isStaff] },
    },
  },
  async (req, auth) => {
    return { statusCode: 201, data: "created" };
  },
);
```

## 5. Authorization Timing

Authorization is expressed as two independent buckets under `security.authorize`.
Each bucket is an array of policies evaluated with logical-AND semantics.

## 5.1 beforeValidation (fail-fast on raw request)

Policies in `beforeValidation` run against the plain Express `Request` before
contract validation. Use this bucket for cheap checks that do not need typed
body/query/params (e.g. role, scope, or header checks). A denial here skips
request validation entirely.

```ts
const beforeMode = createHandler(
  UpdateBookContract,
  {
    access: "protected",
    security: {
      authenticate: authenticateJwt,
      authorize: {
        beforeValidation: [
          async ({ auth, req }) => {
            // req here is the raw, unvalidated request
            return auth.role === "staff" && Boolean(req.headers["x-write-access"]);
          },
        ],
      },
    },
  },
  async ({ req }) => ({ data: req.body }),
);
```

## 5.2 afterValidation (typed request in policies)

Policies in `afterValidation` run after contract validation and receive the
validated request with typed body/query/params.

```ts
const afterMode = createHandler(
  CreateBookContract,
  {
    access: "protected",
    security: {
      authenticate: authenticateJwt,
      authorize: {
        afterValidation: [
          async ({ auth, req }) => {
            // req is the validated contract request
            const title = req.body.title;
            return auth.role === "staff" && title.length > 0;
          },
        ],
      },
    },
  },
  async ({ req }) => ({ statusCode: 201, data: "created" }),
);
```

## 5.3 Mixed-phase (both buckets in one handler)

A handler may use both buckets. `beforeValidation` runs first (fail-fast); if it
passes, the request is validated, then `afterValidation` runs against the typed
request. Bucket membership is enforced by TypeScript: a policy written against
the validated request type cannot be placed in `beforeValidation` (compile
error), while a policy written against a plain `Request` fits either bucket.

```ts
const deleteBook = createHandler(
  DeleteBookContract,
  {
    access: "protected",
    security: {
      authenticate: authenticateJwt,
      authorize: {
        beforeValidation: [isStaff],                            // raw request
        afterValidation: [async ({ req }) => !req.params.isbn.startsWith("SYS-")], // typed
      },
    },
  },
  async ({ req }) => ({ data: undefined }),
);
```

## 6. Policy Combinators

Three combinators build composite policies:

- `allOf`: AND — all policies must pass
- `anyOf`: OR — at least one policy must pass
- `not`: invert a policy

**When you do NOT need `allOf`:** an `authorize` bucket already AND-composes its
array. For top-level policies, write them directly as bucket elements:

```ts
authorize: {
  beforeValidation: [isStaff, hasWriteHeader], // AND, no allOf needed
}
```

**When `allOf` is essential:** when AND must be nested inside an `anyOf` or
`not`, or when you want a reusable composite as a single policy value. A bucket
array cannot express "(A and B) or C" — that requires `allOf` to form the AND
branch:

```ts
// staff OR (registered user who isn't blocked)
const policy = anyOf<JwtAuthContext>([
  isStaff,
  allOf<JwtAuthContext>([
    hasRegisteredUser,
    not(async ({ req }) => req.headers["x-blocked"] === "true"),
  ]),
]);
```

## 6.1 Reusable composite policies

Composites are ordinary `Authorizer` values — export them and drop them straight
into any bucket. This is the other reason `allOf` stays relevant: it produces a
single value you can reuse across handlers and pass to other combinators
(something a bare policy array cannot do).

```ts
// shared policy: staff may edit; otherwise must be registered AND own the author name
export const canEditBook: Authorizer<JwtAuthContext> = anyOf<JwtAuthContext>([
  isStaff,
  allOf<JwtAuthContext>([hasRegisteredUser, editsOwnAuthorName]),
]);

createHandler(UpdateBookContract, {
  access: "protected",
  security: {
    authenticate: authenticateJwt,
    authorize: { beforeValidation: [canEditBook] },
  },
}, async ({ req }) => ({ data: req.body }));
```

If a composite runs in `afterValidation` and mixes broad (plain `Request`)
policies with ones that need the typed request, pin the request type with the
combinator's second generic so inline policies get typed body/query/params:

```ts
const createBookPolicy = allOf<
  JwtAuthContext,
  AfterAuthorizationRequest<typeof CreateBookContract>
>([
  isStaff,
  async ({ req }) => req.body.title.length > 0, // contract-typed via the pinned generic
]);
```

The same second-generic pinning works on `anyOf` and `not`.

## 7. Factory Pattern

Use createHandlerFactory to share defaults.

```ts
const createJwtAuthHandler = createHandlerFactory<JwtAuthContext>({
  access: "protected",
  security: {
    authenticate: authenticateJwt,
    authSchema: JwtAuthSchema,
  },
  errors: {
    unauthenticated: () => new createHttpError.Unauthorized("Authentication required"),
    unauthorized: () => new createHttpError.Forbidden("Authorization denied"),
  },
});
```

Then use the factory per endpoint:

```ts
const deleteBook = createJwtAuthHandler(
  DeleteBookContract,
  {
    security: {
      // inherits authenticate and authSchema
      authorize: { beforeValidation: [allOf([isStaff])] },
    },
  },
  async (req, auth) => ({ data: undefined }),
);
```

You can still override access or add per-handler buckets:

```ts
const getBookOptional = createJwtAuthHandler(
  GetBookContract,
  {
    access: "optional",
    security: {
      authorize: {
        afterValidation: [async ({ req }) => req.params.isbn.length > 0],
      },
    },
  },
  async ({ req }) => ({ data: { isbn: req.params.isbn, title: "x", author: "y", shelf: "A1", total_quantity: 1 } }),
);
```

## 8. Public Access Security Constraints

### Important: public handlers cannot have security configuration

When you declare an endpoint as `access: "public"`, the framework enforces a strict constraint: **no security object is allowed**, either in direct handler creation or factory defaults.

This is enforced both at **compile time** (TypeScript will reject the code) and at **runtime** (an error is thrown).

**Why?** Public handlers skip the entire authentication/authorization pipeline. Accepting security configuration would be misleading—the security options would be silently ignored, creating a dangerous false sense of security.

#### ❌ INCORRECT: Public handlers cannot accept security

```ts
// This will not compile
const listBooks = createHandler(
  ListBooksContract,
  {
    access: "public",
    security: {  // ❌ TypeError: public handlers must not accept security options
      authenticate: authenticateJwt,
    },
  },
  async (req) => ({ data: [] }),
);

// This will also not compile
const publicFactory = createHandlerFactory({
  access: "public",
  security: {  // ❌ TypeError: public factory must not accept security options
    authenticate: authenticateJwt,
  },
});
```

#### ✅ CORRECT: Use optional for conditional auth

If you need to optionally authenticate users (like "guests can read, but if logged in must be valid"):

```ts
const listBooks = createHandler(
  ListBooksContract,
  {
    access: "optional",  // ✅ Correct: use optional for conditional auth
    security: {
      authenticate: authenticateJwt,
    },
  },
  async (req, auth) => {
    // auth is undefined for unauthenticated users
    // auth has context for authenticated users
    const limit = auth ? 100 : 10;
    return { data: [], limit };
  },
);
```

### Access Mode Summary

| Mode | Auth Required | Handler Receives Auth | Security Config | Use Case |
|------|---------------|-----------------------|-----------------|----------|
| `public` | No | No (`req` only) | ❌ Forbidden | Open endpoints (read public data) |
| `optional` | No | Yes (`req`, `auth?`) | ✅ Required | Conditional auth (treat guests differently) |
| `protected` | Yes | Yes (`req`, `auth`) | ✅ Required | Guarded endpoints (create/update/delete) |

## 9. Error Customization

```ts
const handler = createHandler(
  SomeContract,
  {
    access: "protected",
    security: {
      authenticate: authenticateJwt,
      authorize: { beforeValidation: [isStaff] },
    },
    errors: {
      unauthenticated: () => new createHttpError.Unauthorized("Please login first"),
      unauthorized: () => new createHttpError.Forbidden("Staff role is required"),
    },
  },
  async (req, auth) => ({ data: "ok" }),
);
```

## 10. Practical Guidance

- Use `beforeValidation` when a policy only needs headers/auth and should run early (fail-fast).
- Use `afterValidation` when a policy depends on validated body/query/params.
- A handler can use both buckets; `beforeValidation` denial skips validation entirely.
- Prefer reusable policy constants for shared logic.
- When combining broad and narrow policies in `afterValidation`, pin request type using the second generic argument.
- Keep authSchema enabled for safer auth context guarantees.

## 11. Quick Cheatsheet

- before-validation bucket: `security.authorize.beforeValidation = [...]` (raw request)
- after-validation bucket: `security.authorize.afterValidation = [...]` (typed request)
- Top-level AND: just list policies in the bucket array (no `allOf` needed)
- Combinators (for nesting/reusable composites):
  - allOf([...]) — AND inside an anyOf/not, or as a reusable policy value
  - anyOf([...]) — OR
  - not(policy) — invert
- Typed post-validation request helper: AfterAuthorizationRequest<typeof YourContract>
- Force request typing in mixed composites:
  - allOf<AuthContext, AfterAuthorizationRequest<typeof Contract>>([...])
