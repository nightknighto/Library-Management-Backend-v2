# createHandler Authentication Inference: Problem, Findings, and Decision

## Read this first

If you only read one section, read this one.

In this codebase, auth typing for `createHandler` is expected to flow from `security.authenticate` into:

- the handler `auth` parameter,
- authorization callbacks,
- and related security typing.

The surprising behavior is this:

- `authenticate: async () => ({ ... })` often infers correctly.
- `authenticate: async (req) => ({ ... })` can degrade auth to `unknown` if `req` is unannotated.

After a long investigation, the final decision is:

- When `authenticate` has a parameter, explicitly annotate it (`req: Request` or `_req: Request`).
- If request access is not needed, use a parameterless callback.

This is not a stylistic preference. It is a targeted mitigation for a known TypeScript inference limitation in this API shape.

> Historical note: this investigation originated before the signature update to
> `createHandler(contract, options, handler)` (or `createHandler(contract, handler)` when no options are needed).

## The actual problem in our framework

During the original investigation, `createHandler` used a handler-first shape:

```ts
createHandler(contract, handler, options)
```

For optional/protected access modes, `auth` should be inferred from:

```ts
options.security.authenticate
```

In real code and type tests, we observed the following failure mode:

```ts
security: {
  authenticate: async (_req) => ({ userId: "u-2", role: "member" as const }),
}
```

The callback above can cause `auth` to degrade to `unknown` downstream unless `_req` is explicitly typed.

What fixed it consistently:

```ts
security: {
  authenticate: async (_req: Request) => ({ userId: "u-2", role: "member" as const }),
}
```

## Why this happens

This behavior comes from TypeScript inference mechanics, not from runtime behavior and not from a logic bug in authentication flow.

In plain terms:

1. TypeScript uses heuristic inference passes, not full global unification for all generic/callback combinations.
2. Unannotated callback parameters make a function context-sensitive.
3. In handler-first APIs, the compiler may need generic information from later arguments (`options`) to type earlier contexts (`handler` and peer callbacks).
4. When context-sensitive callbacks are deferred, generic slots can be fixed too early and fall back to `unknown`.
5. The compiler usually does not fully rewind and re-typecheck everything under a new generic binding.

That is why a tiny syntax change (`async () => ...` vs `async (req) => ...`) can flip inference outcomes.

## What we tried (and why it was not enough)

We did not jump to a policy quickly. We tested many alternatives in this repository.

### Attempt group A: Overload and signature redesign

Tried:

- Overload reordering.
- Specialized overload families per access mode and authorization timing.
- Explicit extraction from options types via conditional helpers.

Outcome:

- Some narrow improvements.
- No consistently reliable result across optional/protected, before/after authorization, and existing call-site ergonomics.

### Attempt group B: Internal inference tricks

Tried:

- `NoInfer` variants.
- tuple/rest patterns,
- intersection constraints,
- helper-free generic indirection,
- callback parameter widening experiments.

Outcome:

- Either still fragile,
- or required undesirable API complexity,
- or shifted pain into different edge cases.

### Attempt group C: Helper-based stabilization

A temporary helper-based approach worked technically, but exposed extra ceremony at call sites and was removed from the final public surface when we settled on the explicit annotation rule.

## Why an internal invisible fix is not feasible under current constraints

To be acceptable, an "internal-only" fix would need to satisfy all of these at once:

1. Keep the old API shape exactly as it was during investigation (`createHandler(contract, handler, options)`).
2. Require no helper wrappers at call sites.
3. Require no explicit generic arguments at call sites.
4. Preserve strong auth inference for parameterful unannotated `authenticate` callbacks.
5. Remain stable across all relevant security modes and callback combinations.

Based on local experiments plus TypeScript issue history, we do not currently have a solution that satisfies all five simultaneously.

## Why explicit parameter annotation works

Explicitly annotating `req` removes the ambiguous contextual typing step for that callback parameter.

When you write:

```ts
authenticate: async (req: Request) => ({ ... })
```

the compiler has a concrete parameter type up front, instead of trying to derive it from a deferred context. That reduces the inference cycle complexity enough for auth context to propagate reliably.

## Policy for this repository

### Required when callback has a parameter

```ts
authenticate: async (req: Request) => ({ ... })
// or
authenticate: async (_req: Request) => ({ ... })
```

### Preferred when request is not needed

```ts
authenticate: async () => ({ ... })
```

### Avoid in inference-sensitive call sites

```ts
authenticate: async (req) => ({ ... })
```

## Concrete maintenance workflow

When you touch handler/security typing and see `auth` become `unknown`:

1. Inspect `security.authenticate` callback parameter first.
2. If callback parameter exists, annotate it as `Request`.
3. Re-run `pnpm check`.
4. Add or update a compile-only type test under `src/core/__type-tests__/` so the fix is locked.

## Evidence and reference links (original web links)

These sources were directly relevant to the behavior we saw.

### TypeScript GitHub issues

- Argument order and architecture constraints in inference:
  https://github.com/microsoft/TypeScript/issues/17237
- Generic inference degrading to `unknown` with context-sensitive callback params:
  https://github.com/microsoft/TypeScript/issues/43371
- `NoInfer` and overload/contextual typing limitations:
  https://github.com/microsoft/TypeScript/issues/57873
- Callback/generic inference pitfalls and related outcomes:
  https://github.com/microsoft/TypeScript/issues/31146
- Async inference edge context (related background):
  https://github.com/microsoft/TypeScript/issues/29979

### Stack Overflow threads

- Overloaded method inference limits and required refactor direction:
  https://stackoverflow.com/questions/78345930/how-to-infer-type-of-overloaded-method-in-generic-function
- Context-sensitive callback parameter causing unknown inference:
  https://stackoverflow.com/questions/69829717/typescript-inferring-not-working-when-arguments-are-passed
- Why missing generic inference falls back to `unknown` and hacky alternatives:
  https://stackoverflow.com/questions/79688606/how-do-i-prevent-return-type-inference-to-unknown-in-a-generic-function-without

### TypeScript docs

- Type inference and contextual typing:
  https://www.typescriptlang.org/docs/handbook/type-inference.html
- `NoInfer` utility notes:
  https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-4.html#the-noinfer-utility-type
- Conditional-type inference and overload caveat:
  https://www.typescriptlang.org/docs/handbook/2/conditional-types.html#inferring-within-conditional-types

## Decision record

We are standardizing on explicit request parameter annotation for parameterful `authenticate` callbacks.

This decision is based on:

- repeated local reproduction,
- broad experiment coverage,
- and alignment with known TypeScript inference limitations documented by the TS team and community.

This gives us the most predictable result with the least long-term complexity.
