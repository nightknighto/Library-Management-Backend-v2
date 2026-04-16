# Framework-First Agent Instructions

## Product Intent
This repository is primarily an Express framework project.
The goal is to build reusable utilities and core primitives that speed up development across projects.
Treat feature modules as integration surfaces for framework behavior, not as the primary product.

## Core Priorities
Apply all of these together on every relevant task:
- Developer experience (DX)
- Strong TypeScript typing, inference, and IntelliSense
- Clean integrations across contracts, handlers, security, and error handling
- Abstraction of repeated implementation steps into reusable framework utilities

Do not treat these as tradeoffs by default. If a tradeoff is required, explain it and ask first.

## Scope Preference
Strong default focus:
- Core framework surfaces (especially src/core)
- Shared integration surfaces that support framework behavior (for example src/shared and src/lib when relevant)

Feature folders are mainly integration and validation surfaces, not the primary product.

## Framework Ownership Map
- src/core: source of truth for framework primitives (contracts, handler creation, security orchestration, error handling, response shaping).
- src/shared and src/lib: integration layers that support framework behavior across features.
- src/features/books: primary proving ground for framework changes.
- Other src/features/* modules: secondary consumers that may intentionally lag behind framework evolution.

## Feature and Test-App Guardrails
- Use the books feature as the primary proving ground for framework updates unless asked otherwise.
- Do not automatically update unrelated features just because they are not aligned with the latest framework internals.
- A stale feature module is not automatically a bug.
- If framework edits introduce small breakages in other features, apply minimal targeted fixes automatically; do not do broad modernization.
- Before expanding framework-driven edits into other features, ask for confirmation.

## Contract and Handler Direction
- Preserve and strengthen the Contract model for full request and response validation.
- Preserve and improve Handler abstractions that automate repetitive endpoint steps.
- Keep strong type propagation from contracts to handler execution.
- Prefer reusable framework-level helpers over ad-hoc feature-level fixes.

## Contract and Response Invariants
- Keep Contract as the single validation boundary for request and response.
- Keep response schemas as full response envelopes (success and error shapes), not only data payloads.
- Preserve paginated contract behavior and handler inference based on contract pagination metadata.
- Do not bypass contract validation unless explicitly required and documented in the task.

## Type System and Inference Standards
- Prioritize call-site inference and IntelliSense quality for framework APIs.
- Avoid adding any, broad unknown casts, or type assertions that mask real typing issues.
- Prefer overloads and explicit generic constraints when they improve inference and API ergonomics.
- When improving factories, preserve strong type propagation from contract -> validated request -> handler result.

## IntelliSense-First Documentation Standards
- Treat IntelliSense as the primary documentation channel for reusable framework APIs.
- Every reusable exported framework function, utility, factory, and consumer-facing type must include complete JSDoc.
- JSDoc for reusable APIs must describe what the API does, important usage notes, caveats, and when to use each supported mode/variant.
- Include one or more @example blocks that cover common and relevant advanced usage so users can apply the API without opening source files or external docs.
- Document not only the top-level function/type, but also everything users interact with: parameters, option-object properties, nested properties, return values, generic type parameters, and exported type members.
- If an API has overloads or mode-dependent behavior, document the behavior and selection criteria for each variant.
- Do not ship reusable framework APIs with missing or shallow JSDoc on user-facing surfaces.

## Change Strategy
- Keep edits targeted to the requested scope.
- Do not introduce backward-compatibility work unless explicitly requested.
- Avoid broad refactors in app/demo features solely to mirror new framework internals.

## Execution Workflow
1. Identify the framework primitive or integration seam that should absorb the change.
2. Implement at framework level first (typically src/core, then src/shared/src/lib when needed).
3. Validate behavior through the books feature unless the user asks for another proving ground.
4. If small breakages appear in other features, apply minimal targeted fixes only.
5. Ask for confirmation before broadening scope to additional feature modernization.

## Validation Focus
After framework changes, default validation scope is:
- Core surfaces that were changed
- Directly touched files
- Books feature as the integration proving ground

Default checks:
- Run pnpm check for type safety.
- Run targeted tests related to touched areas; run full suite only when requested.

## AI Rules Location
- Store AI instruction and rules documents under [docs/rules](docs/rules/).
- Treat [docs/create-handler-security-guide.md](docs/create-handler-security-guide.md) as a usage guide, not a rules file.

## Inference Test Governance (Mandatory)
- Compile-only inference tests live in `src/core/__type-tests__` and are enforced through `pnpm check`.
- Any change to handler, contract, security, or request-validation typing surfaces must update or extend relevant inference tests.
- Every workstream that extends `createHandler` behavior must add one capability test, one interaction test, and one backward-compat assertion in invariant/regression suites.
- Treat inference invariants as framework contracts. Do not weaken or remove them unless an intentional breaking change is approved and documented.
- Use narrowly scoped `// @ts-expect-error` lines for negative compile assertions.
- Follow the detailed policy document at [docs/rules/create-handler-inference-policy.md](docs/rules/create-handler-inference-policy.md) when adding or updating type-inference tests.

## Ask-First Triggers
Ask for confirmation before:
- Expanding edits to unrelated feature modules.
- Changing public API/contract response shapes in ways that affect multiple consumers.
- Introducing broad refactors that are not required for the requested outcome.
- Performing infrastructure-level changes (tooling, dependency strategy, migration strategy) beyond task scope.

## Definition of Done
- Framework-level abstraction is improved or extended for reuse.
- Type inference remains strong end-to-end across contract and handler usage.
- Reusable API IntelliSense is comprehensive: symbols and all user-facing inputs/properties/types include JSDoc with usage notes and examples.
- Books proving-ground behavior is validated for the change.
- Unrelated features are left untouched except minimal breakage fixes.
- Final report clearly states what was validated and what was intentionally not validated.

## Decision Rule
If a task can be solved either by patching a specific feature or by improving reusable framework code, prefer the framework-level solution unless the user explicitly asks for a local feature-only change.
