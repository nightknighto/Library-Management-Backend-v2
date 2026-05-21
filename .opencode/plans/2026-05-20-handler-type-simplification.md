# Handler Type Simplification Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace positional handler parameters with a single context object, and replace computed conditional types with explicit interfaces, to fix IntelliSense and reduce type complexity from ~500 to ~150-200 lines.

**Architecture:** Two orthogonal simplifications applied together: (1) unify handler arity by replacing `(req)` / `(req, auth)` with `({ req })` / `({ req, auth })`, eliminating 9 handler executor types in favor of 1; (2) replace ~14 conditional helper types with ~8 explicit, flat interfaces for options, so IntelliSense sees `access: 'public' | 'optional' | 'protected'` and JSDoc appears consistently.

**Tech Stack:** TypeScript 5.2+, Zod 4, Express 5, Vitest

---

## Type Count Impact

| Category | Before | After |
|----------|--------|-------|
| Handler executor types | 9 (`PublicHandlerExecutor`, `ProtectedHandlerExecutor`, `OptionalHandlerExecutor`, `Any*` variants, `ExactHandler`, `NoExtraTopLevelKeys`) | 2 (`HandlerContext`, `HandlerFn`) + `NoExtraTopLevelKeys` kept |
| Options helper types | ~14 (`HandlerOptionsForMode`, `SecurityForMode`, `SecurityField`, `RequireAuthenticate`, `RequiresAuthenticate`, `OptionalSecurity`, `BaseHandlerOptions`, `SecurityBefore`, `SecurityAfter`, `ValidateFlag`, `OptionalFalse`, `OptionalTrue`, `PublicNoSecurityOptions`, `HandlerOptionsByAuthorizationMode`) | 0 (replaced by explicit interfaces) |
| Explicit option interfaces | 0 | ~8 (see Phase 1) |
| Factory helper types | ~12 (`ConfiguredHandlerFactory` with 6 call sigs, `HandlerFactoryBeforeOptionsArg`, `HandlerFactoryAfterOptionsArg`, `RequireOptionsForBefore`, `RequireOptionsForAfter`, `WithRequiredAccess`, `OptionsArg`, `FactorySecurityWithRequiredAuthenticate`, `PublicFactoryDefaults`, `AccessOnlyFactoryDefaults`, `HandlerFactoryArgsWithHandlerLast`) | ~4 (simplified factory return types) |
| Conditional nesting depth | 10 levels | 1 level (only `HandlerContext`) |
| createHandler overloads | 7 | 6 |

---

## Phase 1: Define New Types

**Files:**
- Modify: `src/core/create-handler.core.ts` (add new types in Section 1, keep old ones temporarily)

### Step 1: Add `HandlerContext` type

Add after the `ContractRequestEnvelope` type (line 53):

```typescript
/**
 * Context object passed to all handler functions.
 *
 * The shape varies by access mode:
 * - `public`: `{ req }` only
 * - `protected`: `{ req, auth }` where auth is always present
 * - `optional`: `{ req, auth? }` where auth may be undefined
 *
 * @typeParam TContract - Contract type (provides request typing)
 * @typeParam TAuth - Auth context type from security.authenticate
 * @typeParam TAccess - Access mode determining which fields are present
 *
 * @example
 * // Public handler
 * createHandler(contract, async ({ req }) => ({ data: { id: req.params.id } }));
 *
 * @example
 * // Protected handler
 * createHandler(contract, { access: 'protected', security: { ... } }, async ({ req, auth }) => {
 *   return { data: { userId: auth.userId } };
 * });
 */
export type HandlerContext<
    TContract extends AnyContract,
    TAuth,
    TAccess extends AccessMode,
> = TAccess extends 'public'
    ? { req: HandlerRequest<TContract> }
    : TAccess extends 'protected'
      ? { req: HandlerRequest<TContract>; auth: TAuth }
      : TAccess extends 'optional'
        ? { req: HandlerRequest<TContract>; auth?: TAuth }
        : never;
```

### Step 2: Add `HandlerFn` type

```typescript
/**
 * Unified handler function type for all access modes.
 *
 * Single context-object parameter replaces positional (req) and (req, auth) signatures.
 * TypeScript enforces the correct context shape based on the access mode selected
 * in the handler options.
 *
 * Excess top-level keys in the return value are rejected at compile time.
 *
 * @typeParam TContract - Contract providing request and response typing
 * @typeParam TAuth - Auth context type
 * @typeParam TAccess - Access mode
 * @typeParam TResult - Handler return shape (must extend ContractHandlerSuccessResult)
 */
type HandlerFn<
    TContract extends AnyContract,
    TAuth,
    TAccess extends AccessMode,
    TResult extends ContractHandlerSuccessResult<TContract>,
> = (
    ctx: HandlerContext<TContract, TAuth, TAccess>,
) => Promise<NoExtraTopLevelKeys<ContractHandlerSuccessResult<TContract>, TResult>>;
```

### Step 3: Add explicit security config interfaces

Add a new Section 2a before the existing Section 2:

```typescript
// =========================================================================
// SECTION 2a: EXPLICIT SECURITY & OPTION INTERFACES
// =========================================================================

/**
 * Security config when authorization runs BEFORE request validation.
 *
 * The `authorize` callback receives a plain Express `Request`.
 */
interface BeforeValidationSecurity<TAuth> {
    /** Authentication callback. Required for protected/optional access. */
    authenticate: Authenticator<TAuth>;
    /**
     * Authorization policies evaluated before validation.
     * Receives a plain Express Request (unvalidated body/query/params).
     */
    authorize?: Authorizer<TAuth, Request> | Array<Authorizer<TAuth, Request>>;
    /** Zod schema to validate auth context. Failures trigger 401. */
    authSchema?: ZodType<TAuth>;
    /** Set to false (or omit) to authorize before validation. */
    validateBeforeAuthorization?: false;
}

/**
 * Security config when authorization runs AFTER request validation.
 *
 * The `authorize` callback receives a typed request with validated body/query/params.
 */
interface AfterValidationSecurity<TAuth, TReq = Request> {
    /** Authentication callback. Required for protected/optional access. */
    authenticate: Authenticator<TAuth>;
    /**
     * Authorization policies evaluated after validation.
     * Receives a typed request with validated body/query/params.
     */
    authorize?: Authorizer<TAuth, TReq> | Array<Authorizer<TAuth, TReq>>;
    /** Zod schema to validate auth context. Failures trigger 401. */
    authSchema?: ZodType<TAuth>;
    /** Must be true. Authorize runs after request validation. */
    validateBeforeAuthorization: true;
}

/**
 * Security config when authenticate is inherited from factory defaults.
 * authorize runs BEFORE validation.
 */
interface InheritedBeforeSecurity<TAuth> extends Omit<BeforeValidationSecurity<TAuth>, 'authenticate'> {}

/**
 * Security config when authenticate is inherited from factory defaults.
 * authorize runs AFTER validation.
 */
interface InheritedAfterSecurity<TAuth, TReq = Request> extends Omit<AfterValidationSecurity<TAuth, TReq>, 'authenticate'> {}
```

### Step 4: Add explicit handler option interfaces

```typescript
/** Options for public handlers. No security allowed. */
interface PublicHandlerOpts {
    /** Access mode. Default: 'public'. */
    access?: 'public';
}

/** Options for protected handlers with authorization before validation. */
interface ProtectedBeforeOpts<TAuth> {
    /** Access mode: authentication required. */
    access: 'protected';
    /** Security configuration. `authenticate` is required. `authorize` receives plain Request. */
    security: BeforeValidationSecurity<TAuth>;
    /** Custom error responses for auth failures. */
    errors?: HandlerErrorMappers;
}

/** Options for protected handlers with authorization after validation. */
interface ProtectedAfterOpts<TAuth, TContract extends AnyContract> {
    /** Access mode: authentication required. */
    access: 'protected';
    /** Security configuration. `authorize` receives typed request. */
    security: AfterValidationSecurity<TAuth, AfterAuthorizationRequest<TContract>>;
    /** Custom error responses for auth failures. */
    errors?: HandlerErrorMappers;
}

/** Options for optional handlers with authorization before validation. */
interface OptionalBeforeOpts<TAuth> {
    /** Access mode: authentication may run, auth context optional in handler. */
    access: 'optional';
    /** Security configuration. `authenticate` is required. `authorize` receives plain Request. */
    security: BeforeValidationSecurity<TAuth>;
    /** Custom error responses for auth failures. */
    errors?: HandlerErrorMappers;
}

/** Options for optional handlers with authorization after validation. */
interface OptionalAfterOpts<TAuth, TContract extends AnyContract> {
    /** Access mode: authentication may run, auth context optional in handler. */
    access: 'optional';
    /** Security configuration. `authorize` receives typed request. */
    security: AfterValidationSecurity<TAuth, AfterAuthorizationRequest<TContract>>;
    /** Custom error responses for auth failures. */
    errors?: HandlerErrorMappers;
}
```

### Step 5: Verify new types compile

Run: `pnpm check`
Expected: PASS (new types are defined but not yet used; old types still in place)

### Step 6: Commit

```
feat(core): define new explicit handler and option types
```

---

## Phase 2: Rewrite createHandler

**Files:**
- Modify: `src/core/create-handler.core.ts`

### Step 7: Replace createHandler overloads

Remove all 7 existing overloads (lines 763-838). Replace with 6 new overloads:

```typescript
export function createHandler<
    TContract extends AnyContract,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(contract: TContract, handler: HandlerFn<TContract, never, 'public', TResult>): RequestHandler;

export function createHandler<
    TContract extends AnyContract,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    options: PublicHandlerOpts,
    handler: HandlerFn<TContract, never, 'public', TResult>,
): RequestHandler;

export function createHandler<
    TContract extends AnyContract,
    TAuth,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    options: ProtectedBeforeOpts<TAuth>,
    handler: HandlerFn<TContract, TAuth, 'protected', TResult>,
): RequestHandler;

export function createHandler<
    TContract extends AnyContract,
    TAuth,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    options: ProtectedAfterOpts<TAuth, TContract>,
    handler: HandlerFn<TContract, TAuth, 'protected', TResult>,
): RequestHandler;

export function createHandler<
    TContract extends AnyContract,
    TAuth,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    options: OptionalBeforeOpts<TAuth>,
    handler: HandlerFn<TContract, TAuth, 'optional', TResult>,
): RequestHandler;

export function createHandler<
    TContract extends AnyContract,
    TAuth,
    TResult extends ContractHandlerSuccessResult<TContract>,
>(
    contract: TContract,
    options: OptionalAfterOpts<TAuth, TContract>,
    handler: HandlerFn<TContract, TAuth, 'optional', TResult>,
): RequestHandler;
```

### Step 8: Update implementation signature

Replace the implementation signature (old lines 839-854) with:

```typescript
export function createHandler<TContract extends AnyContract, TAuth>(
    contract: TContract,
    arg2:
        | HandlerFn<TContract, TAuth, AccessMode, ContractHandlerSuccessResult<TContract>>
        | PublicHandlerOpts
        | ProtectedBeforeOpts<TAuth>
        | ProtectedAfterOpts<TAuth, TContract>
        | OptionalBeforeOpts<TAuth>
        | OptionalAfterOpts<TAuth, TContract>,
    arg3?: HandlerFn<TContract, TAuth, AccessMode, ContractHandlerSuccessResult<TContract>>,
): RequestHandler {
    const { handler, options } = resolveHandlerArgs<
        PublicHandlerOpts | ProtectedBeforeOpts<TAuth> | ProtectedAfterOpts<TAuth, TContract> | OptionalBeforeOpts<TAuth> | OptionalAfterOpts<TAuth, TContract>,
        HandlerFn<TContract, TAuth, AccessMode, ContractHandlerSuccessResult<TContract>>
    >(arg2, arg3, 'createHandler requires a handler function as the last argument.');

    return createHandlerRuntime(contract, handler, options as HandlerOptions<AccessMode, TAuth, Request>);
}
```

### Step 9: Update `executeHandlerByAccess`

Replace the runtime dispatch function:

```typescript
async function executeHandlerByAccess<TContract extends AnyContract, TAuth>(
    access: AccessMode,
    handler: (ctx: HandlerContext<TContract, TAuth, AccessMode>) => Promise<ContractHandlerSuccessResult<TContract>>,
    req: HandlerRequest<TContract>,
    auth: TAuth | undefined,
): Promise<ContractHandlerSuccessResult<TContract>> {
    if (access === 'public') {
        return handler({ req } as HandlerContext<TContract, TAuth, AccessMode>);
    }
    return handler({ req, auth } as HandlerContext<TContract, TAuth, AccessMode>);
}
```

### Step 10: Update `createHandlerRuntime`

Update the handler call inside the runtime to use context object:

In the runtime function, find `const result = await executeHandlerByAccess(...)` and ensure `handler` is typed as the context-based handler. The rest of the runtime (validation, response building, cookies, error handling) stays the same.

### Step 11: Verify compile

Run: `pnpm check`
Expected: FAIL (type tests and consumers use old `(req)` / `(req, auth)` signatures). This is expected. We fix in Phase 3+.

### Step 12: Commit

```
refactor(core): rewrite createHandler with context parameter and explicit overloads
```

---

## Phase 3: Rewrite createHandlerFactory

**Files:**
- Modify: `src/core/create-handler.core.ts`

### Step 13: Define simplified factory types

Replace all existing factory helper types (from line ~175 to ~495) and `ConfiguredHandlerFactory` with:

```typescript
/**
 * Per-handler options when factory provides `authenticate`.
 * `authenticate` is omitted (inherited from factory defaults).
 */
type FactoryProtectedBeforeOpts<TAuth> = {
    access?: 'protected';
    security?: InheritedBeforeSecurity<TAuth>;
    errors?: HandlerErrorMappers;
};

type FactoryProtectedAfterOpts<TAuth, TContract extends AnyContract> = {
    access?: 'protected';
    security?: InheritedAfterSecurity<TAuth, AfterAuthorizationRequest<TContract>>;
    errors?: HandlerErrorMappers;
};

type FactoryOptionalBeforeOpts<TAuth> = {
    access: 'optional';
    security?: InheritedBeforeSecurity<TAuth>;
    errors?: HandlerErrorMappers;
};

type FactoryOptionalAfterOpts<TAuth, TContract extends AnyContract> = {
    access: 'optional';
    security?: InheritedAfterSecurity<TAuth, AfterAuthorizationRequest<TContract>>;
    errors?: HandlerErrorMappers;
};

type FactoryPublicOverrideOpts = {
    access: 'public';
};

/**
 * Handler factory return type when authenticate is provided in defaults.
 */
interface AuthenticatedFactory<
    TAuth,
    TDefaultAccess extends Exclude<AccessMode, 'public'>,
> {
    <TContract extends AnyContract, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: TContract,
        handler: HandlerFn<TContract, TAuth, TDefaultAccess, TResult>,
    ): RequestHandler;

    <TContract extends AnyContract, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: TContract,
        options: FactoryProtectedBeforeOpts<TAuth>,
        handler: HandlerFn<TContract, TAuth, 'protected', TResult>,
    ): RequestHandler;

    <TContract extends AnyContract, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: TContract,
        options: FactoryProtectedAfterOpts<TAuth, TContract>,
        handler: HandlerFn<TContract, TAuth, 'protected', TResult>,
    ): RequestHandler;

    <TContract extends AnyContract, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: TContract,
        options: FactoryOptionalBeforeOpts<TAuth>,
        handler: HandlerFn<TContract, TAuth, 'optional', TResult>,
    ): RequestHandler;

    <TContract extends AnyContract, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: TContract,
        options: FactoryOptionalAfterOpts<TAuth, TContract>,
        handler: HandlerFn<TContract, TAuth, 'optional', TResult>,
    ): RequestHandler;

    <TContract extends AnyContract, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: TContract,
        options: FactoryPublicOverrideOpts,
        handler: HandlerFn<TContract, never, 'public', TResult>,
    ): RequestHandler;
}

/**
 * Handler factory return type for public-only factory.
 */
interface PublicFactory {
    <TContract extends AnyContract, TResult extends ContractHandlerSuccessResult<TContract>>(
        contract: TContract,
        handler: HandlerFn<TContract, never, 'public', TResult>,
    ): RequestHandler;
}
```

### Step 14: Rewrite createHandlerFactory overloads

Replace the 11 factory overloads with:

```typescript
export function createHandlerFactory<TAuth>(
    defaults: HandlerFactoryDefaults<TAuth> & {
        access: 'protected';
        security: { authenticate: Authenticator<TAuth, Request> };
    },
): AuthenticatedFactory<TAuth, 'protected'>;

export function createHandlerFactory<TAuth>(
    defaults: HandlerFactoryDefaults<TAuth> & {
        access: 'optional';
        security: { authenticate: Authenticator<TAuth, Request> };
    },
): AuthenticatedFactory<TAuth, 'optional'>;

export function createHandlerFactory<TAuth>(
    defaults: HandlerFactoryDefaults<TAuth> & { access: 'public' },
): PublicFactory;

export function createHandlerFactory<TAuth>(
    defaults?: HandlerFactoryDefaults<TAuth>,
): PublicFactory;
```

Keep the implementation body mostly the same (runtime logic doesn't change), but update the `createConfiguredHandler` inner function to pass context-based handler to `createHandlerRuntime`.

### Step 15: Commit

```
refactor(core): simplify createHandlerFactory with explicit types
```

---

## Phase 4: Update Type Tests

**Files:**
- Modify: `src/core/__type-tests__/create-handler.capabilities.type-test.ts`
- Modify: `src/core/__type-tests__/create-handler.interactions.type-test.ts`
- Modify: `src/core/__type-tests__/create-handler.invariants.type-test.ts`
- Modify: `src/core/__type-tests__/create-handler.regressions.type-test.ts`

### Step 16: Mechanical handler signature transformation

Apply these transformations to ALL handler callbacks in ALL type-test files:

| Old | New |
|-----|-----|
| `async (req) =>` | `async ({ req }) =>` |
| `async (_req) =>` | `async ({ req }) =>` |
| `async (req, auth) =>` | `async ({ req, auth }) =>` |
| `async (_req, auth) =>` | `async ({ req, auth }) =>` |
| `async (_req, _auth) =>` | `async ({ req, auth: _auth }) =>` |
| `async (_req: unknown) =>` | `async ({ req: _req }: unknown) =>` or `async (_) =>` |
| `async (_req: unknown, _auth: ...) =>` | `async ({ req: _req, auth: _auth }: ...) =>` or similar |

For handlers that use `req` body/query/params, verify the access works:
```typescript
// Old:
createHandler(contract, async (req) => {
    type _body = Expect<Equal<typeof req.body, { title: string }>>;
    return { data: { updated: true } };
});

// New:
createHandler(contract, async ({ req }) => {
    type _body = Expect<Equal<typeof req.body, { title: string }>>;
    return { data: { updated: true } };
});
```

### Step 17: Update negative assertions

For `@ts-expect-error` tests that check handler arity (e.g., "public handlers don't receive auth"), update:

```typescript
// Old:
// @ts-expect-error public handlers do not receive auth parameter
createHandler(UpdateBookContract, async (_req, _auth) => ({ data: { updated: true } }));

// New:
// @ts-expect-error public handlers do not receive auth parameter
createHandler(UpdateBookContract, async ({ req, auth }) => ({ data: { updated: true } }));
```

The error still fires because `HandlerContext<C, never, 'public'>` is `{ req }` -- no `auth` property.

For negative assertions on factory handlers using wrong auth, same pattern:

```typescript
// Old:
// @ts-expect-error protected handlers require explicit access override for public-default factory
publicFactory(UpdateBookContract, async (_req: unknown, _auth: AuthContext) => {
    return { data: { updated: true } };
});

// New:
// @ts-expect-error protected handlers require explicit access override for public-default factory
publicFactory(UpdateBookContract, async ({ req, auth }) => {
    return { data: { updated: true } };
});
```

### Step 18: Verify all type tests pass

Run: `pnpm check`
Expected: PASS. Every `@ts-expect-error` still triggers, every `Expect`/`ExpectFalse` still holds.

If any `@ts-expect-error` no longer triggers, the simplification weakened an inference guarantee. Investigate and fix before proceeding.

### Step 19: Commit

```
test: update type tests for context-parameter handler signature
```

---

## Phase 5: Update Runtime Tests

**Files:**
- Modify: `tests/core/create-handler.runtime.test.ts`
- Modify: `tests/core/create-handler-factory.runtime.test.ts`
- Modify: `tests/core/security.runtime.test.ts` (if it references handler signatures)

### Step 20: Transform handler callbacks in runtime tests

Same mechanical transformation as Phase 4, Step 16. Examples:

```typescript
// Old:
const handler = createHandler(contract, async () => ({
    data: { message: 'ok' },
}));

// New (no change needed - no parameters used):
const handler = createHandler(contract, async () => ({
    data: { message: 'ok' },
}));

// Old:
const handler = createHandler(contract, async (req) => ({ data: { ok: true } }));

// New:
const handler = createHandler(contract, async ({ req }) => ({ data: { ok: true } }));
```

Note: handlers that don't use any parameter can keep `async () =>` since destructuring zero properties is valid.

### Step 21: Run runtime tests

Run: `pnpm test`
Expected: ALL PASS. Runtime behavior is identical; only the JS calling convention inside the framework changed.

### Step 22: Commit

```
test: update runtime tests for context-parameter handler signature
```

---

## Phase 6: Update Feature Consumers

**Files:**
- Modify: `src/features/books/books.controller.ts`
- Modify: `src/features/borrows/borrows.controller.ts`
- Modify: `src/features/users/users.controller.ts`
- Modify: `src/shared/auth-stuff.ts` (if handler signatures in factory usage changed)

### Step 23: Transform all handler callbacks

Apply the same mechanical transformation to all consumers. Key examples:

**books.controller.ts:**
```typescript
// Old:
async (req, auth) => {
    await BookService.createBook(auth.email, req.body);
    return { statusCode: 201, data: 'Book created successfully' };
}

// New:
async ({ req, auth }) => {
    await BookService.createBook(auth.email, req.body);
    return { statusCode: 201, data: 'Book created successfully' };
}
```

**borrows.controller.ts:**
```typescript
// Old:
async (req, auth) => {
    const { isbn } = req.params;
    const user_email = auth.email;
    ...
}

// New:
async ({ req, auth }) => {
    const { isbn } = req.params;
    const user_email = auth.email;
    ...
}
```

**users.controller.ts:**
```typescript
// Old:
async (req) => {
    const { email, name } = req.body;
    ...
}

// New:
async ({ req }) => {
    const { email, name } = req.body;
    ...
}
```

### Step 24: Verify compile

Run: `pnpm check`
Expected: PASS

### Step 25: Commit

```
refactor: update all feature handlers to use context parameter
```

---

## Phase 7: Clean Up Old Types

**Files:**
- Modify: `src/core/create-handler.core.ts`
- Modify: `src/core/index.ts`

### Step 26: Remove old type definitions

Delete these types from `create-handler.core.ts` (they are no longer referenced):

**Old handler executor types (Section 1):**
- `PublicHandlerExecutor`
- `ProtectedHandlerExecutor`
- `OptionalHandlerExecutor`
- `AnyPublicHandlerExecutor`
- `AnyProtectedHandlerExecutor`
- `AnyOptionalHandlerExecutor`
- `AnyHandlerExecutor`
- `ExactHandler`

**Old options helper types (Section 2):**
- `PublicNoSecurityOptions`
- `ValidateFlag`
- `SecurityBefore`
- `SecurityAfter`
- `OptionalFalse`
- `OptionalTrue`
- `SecurityForMode`
- `RequiresAuthenticate`
- `OptionalSecurity`
- `RequireAuthenticate`
- `SecurityField`
- `BaseHandlerOptions`
- `HandlerOptionsForMode`
- `HandlerOptionsByAuthorizationMode`

**Old factory types (Sections 2-3):**
- `WithRequiredAccess`
- `RequireOptionsForBefore`
- `RequireOptionsForAfter`
- `OptionsArg`
- `HandlerFactoryBeforeOptionsArg`
- `HandlerFactoryAfterOptionsArg`
- `ConfiguredHandlerFactory` (replaced by `AuthenticatedFactory` / `PublicFactory`)
- `FactorySecurityWithRequiredAuthenticate`
- `PublicFactoryDefaults`
- `AccessOnlyFactoryDefaults`
- `HandlerFactoryArgsWithHandlerLast` (can keep if still useful for resolveHandlerArgs)

Keep `HandlerFactoryDefaults` if still used by factory implementation.

### Step 27: Update index.ts exports

Add new exports:
```typescript
export type { HandlerContext } from './create-handler.core.ts';
```

Remove any exports of deleted types.

`HandlerRequest` and `AfterAuthorizationRequest` stay exported (still used in `authorize` callbacks).

### Step 28: Final verification

Run: `pnpm check`
Expected: PASS

Run: `pnpm test`
Expected: ALL PASS

### Step 29: Commit

```
chore(core): remove old conditional type helpers, clean up exports
```

---

## Key Design Decisions

### Why context object instead of positional params?

1. **Unifies handler arity** - one function shape instead of three, eliminating 9 type aliases
2. **IntelliSense on destructuring** - `({ req, auth })` shows available properties
3. **No underscore convention** - `({ req })` instead of `(req, _auth)` when auth unused
4. **Consistent** - every handler has the same calling convention

### Why explicit interfaces instead of computed conditionals?

1. **IntelliSense** - TypeScript resolves literal types directly (sees `access: 'protected'`)
2. **JSDoc** - every property has documentation on the declaration (not lost through `Omit`/conditionals)
3. **Debuggability** - hover shows the actual type, not a 10-deep conditional chain
4. **Maintainability** - adding a new option variant means adding a new interface, not threading through 14 helper types

### What we preserve

- All inference capabilities (verified by existing type tests)
- `validateBeforeAuthorization` controlling authorizer request type
- Pagination requirement enforcement
- No-extra-key checking on handler results
- Factory defaults merging
- Public access rejecting security options

### What we sacrifice

- Some DRY-ness (Before/After option interfaces share structure but are separate types)
- Factory: per-handler options shape is no longer computed from defaults (it is always "authenticate inherited" or "authenticate required")
