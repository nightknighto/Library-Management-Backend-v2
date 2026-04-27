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

- access:
  - public: no auth required
  - optional: auth is optional, handler can receive auth if present
  - protected: auth is required
- security.authenticate:
  - Function that builds auth context from request
- security.authSchema:
  - Optional Zod schema to validate parsed auth context
- security.authorize:
  - One policy or list of policies
- security.validateBeforeAuthorization:
  - false (default): authorization runs before request validation
  - true: authorization runs after request validation
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
  async (req, auth) => {
    const limit = auth ? req.query.limit : Math.min(req.query.limit, 5);
    return { data: [], pagination: { totalCount: 0, page: 1, limit } };
  },
  {
    access: "optional",
    security: {
      authenticate: authenticateJwt,
    },
  },
);
```

### 4.3 protected

```ts
const createBook = createHandler(
  CreateBookContract,
  async (req, auth) => {
    return { statusCode: 201, data: "created" };
  },
  {
    access: "protected",
    security: {
      authenticate: authenticateJwt,
      authSchema: JwtAuthSchema,
      authorize: isStaff,
    },
  },
);
```

## 5. Authorization Timing

## 5.1 before (default)

If validateBeforeAuthorization is omitted, default is false (authorization runs before validation).

```ts
const beforeMode = createHandler(
  UpdateBookContract,
  async (req, auth) => ({ data: req.body }),
  {
    access: "protected",
    security: {
      authenticate: authenticateJwt,
      // validateBeforeAuthorization omitted -> false
      authorize: async ({ auth, req }) => {
        // req here is pre-validation request shape
        return auth.role === "staff" && Boolean(req.headers["x-write-access"]);
      },
    },
  },
);
```

## 5.2 after (validated request in policies)

When timing is after, authorization runs after contract validation.

```ts
const afterMode = createHandler(
  CreateBookContract,
  async (req, auth) => ({ statusCode: 201, data: "created" }),
  {
    access: "protected",
    security: {
      authenticate: authenticateJwt,
      validateBeforeAuthorization: true,
      authorize: async ({ auth, req }) => {
        // req is validated contract request
        const title = req.body.title;
        return auth.role === "staff" && title.length > 0;
      },
    },
  },
);
```

## 6. Policy Combinators

- allOf: all policies must pass
- anyOf: at least one policy must pass
- not: invert policy

```ts
const policy = allOf<JwtAuthContext>([
  anyOf([isStaff, hasWriteHeader]),
  not(async ({ req }) => req.headers["x-blocked"] === "true"),
]);
```

## 6.1 Important mixed-policy pattern

If you mix:
- broad reusable policies typed with plain Request
- inline policy that needs contract-typed req in after mode

use the second generic argument on allOf or anyOf.

```ts
const createBookPolicy = allOf<
  JwtAuthContext,
  AfterAuthorizationRequest<typeof CreateBookContract>
>([
  isStaff,
  async ({ req }) => {
    // contract-typed because we pinned TRequest explicitly
    return req.body.title.length > 0;
  },
]);

const createBook2 = createHandler(
  CreateBookContract,
  async (req, auth) => ({ statusCode: 201, data: "created" }),
  {
    access: "protected",
    security: {
      authenticate: authenticateJwt,
      validateBeforeAuthorization: true,
      authorize: createBookPolicy,
    },
  },
);
```

You can do the same with anyOf and not:

```ts
const canUpdate = anyOf<
  JwtAuthContext,
  AfterAuthorizationRequest<typeof UpdateBookContract>
>([
  isStaff,
  async ({ req }) => req.body.title !== undefined,
]);

const notReservedIsbn = not<
  JwtAuthContext,
  AfterAuthorizationRequest<typeof UpdateBookContract>
>(
  async ({ req }) => req.params.isbn.startsWith("SYS-")
);
```

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
  async (req, auth) => ({ data: undefined }),
  {
    security: {
      // inherits authenticate and authSchema
      authorize: allOf([isStaff]),
    },
  },
);
```

You can still override access or timing per endpoint:

```ts
const getBookOptional = createJwtAuthHandler(
  GetBookContract,
  async (req, auth) => ({ data: { isbn: req.params.isbn, title: "x", author: "y", shelf: "A1", total_quantity: 1 } }),
  {
    access: "optional",
    security: {
      validateBeforeAuthorization: true,
      authorize: async ({ req }) => req.params.isbn.length > 0,
    },
  },
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
  async (req) => ({ data: [] }),
  {
    access: "public",
    security: {  // ❌ TypeError: public handlers must not accept security options
      authenticate: authenticateJwt,
    },
  },
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
  async (req, auth) => {
    // auth is undefined for unauthenticated users
    // auth has context for authenticated users
    const limit = auth ? 100 : 10;
    return { data: [], limit };
  },
  {
    access: "optional",  // ✅ Correct: use optional for conditional auth
    security: {
      authenticate: authenticateJwt,
    },
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
  async (req, auth) => ({ data: "ok" }),
  {
    access: "protected",
    security: {
      authenticate: authenticateJwt,
      authorize: isStaff,
    },
    errors: {
      unauthenticated: () => new createHttpError.Unauthorized("Please login first"),
      unauthorized: () => new createHttpError.Forbidden("Staff role is required"),
    },
  },
);
```

## 10. Practical Guidance

- Use before when policy only needs headers/auth and should run early.
- Use after when policy depends on validated body/query/params.
- Prefer reusable policy constants for shared logic.
- When combining broad and narrow policies in after mode, pin request type using the second generic argument.
- Keep authSchema enabled for safer auth context guarantees.

## 11. Quick Cheatsheet

- Default mode: validateBeforeAuthorization = false
- Enable validated request in policies: security.validateBeforeAuthorization = true
- Typed post-validation request helper: AfterAuthorizationRequest<typeof YourContract>
- Compose policies:
  - allOf([...])
  - anyOf([...])
  - not(policy)
- Force request typing in mixed arrays:
  - allOf<AuthContext, AfterAuthorizationRequest<typeof Contract>>([...])
