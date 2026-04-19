# CreateHandler Inference Policy

## Purpose
This document defines mandatory rules for compile-only TypeScript inference tests that protect framework contracts around createHandler, createContract, request validation, and security orchestration.

These tests prevent silent inference regressions as framework capabilities expand across workstreams.

## Scope
This policy applies whenever changes touch any of the following:
- src/core/create-handler.core.ts
- src/core/security.core.ts
- src/core/types.core.ts
- src/core/create-contract.core.ts
- src/core/validate-contract-request.core.ts
- src/shared/schemas/create-request-schema.ts

## Rules File Location
AI instruction and rules documents belong under docs/rules.

The file docs/create-handler-security-guide.md is a usage guide and reference manual, not a rules file.

## Enforcement Model
- Type-inference tests are compile-only and run via pnpm check because they live under src/core/__type-tests__.
- Do not depend on Jest or runtime execution for these tests.
- If pnpm check fails due to inference tests, the framework change is not done.

## Test Lanes
Inference tests are organized into four lanes.

### 1. Capability Lane
Covers each feature axis in isolation.

Required axes:
- Request typing and response typing from createHandler callbacks
- Pagination result requirements for paginated and non-paginated contracts
- Authentication typing across public, optional, and protected access modes
- Authorization callback typing, including validateBeforeAuthorization: true
- Error mapper typing (unauthenticated, unauthorized)
- Factory typing behavior for createHandlerFactory
- Contract inference via createContract
- Request envelope and promotion typing via request schema and validation utilities

### 2. Interaction Lane
Covers high-risk combinations of features using pairwise coverage.

Minimum dimensions:
- Access mode
- Authorization timing (before or after validation)
- Auth schema usage
- Authorizer mode (single or array/composed)
- Pagination mode
- Error mapper usage

### 3. Invariant Lane
Locks previously shipped inference guarantees that should remain stable.

Examples:
- HandlerRequest body/query/params stay strongly typed and do not degrade to any
- Protected handler auth context is required
- Optional handler auth context stays optional
- After-authorization request typing remains aligned with validated request payloads

### 4. Historical Regression Lane
Preserves past bug fixes and fragile scenarios.

Examples:
- Typed authorize request when validateBeforeAuthorization: true
- Pagination metadata requirement for paginated contracts
- Contract response still includes the error envelope variant

## Workstream Contribution Rules
For any workstream extending createHandler or related framework typing:
- Add at least one capability-lane test for the new behavior.
- Add at least one interaction-lane test combining new behavior with existing behavior.
- Add or update one invariant or regression assertion to protect backward compatibility.

## Authentication Callback Annotation Rule
When `security.authenticate` includes a callback parameter, that parameter must be explicitly annotated.

Required pattern:
- `authenticate: async (req: Request) => { ... }`
- or `authenticate: async (_req: Request) => { ... }`

If request access is not needed, prefer a parameterless callback:
- `authenticate: async () => ({ ... })`

Do not rely on unannotated parameter forms such as `authenticate: async (req) => { ... }` in inference-sensitive call sites, because TypeScript may widen auth context to `unknown`.

For background, rationale, and source references, see:
- [create-handler-auth-inference-limitations.md](create-handler-auth-inference-limitations.md)

## Negative Assertion Rules
- Use // @ts-expect-error only on the exact line that should fail.
- Keep each negative assertion focused on a single failure mode.
- Do not use broad casts (as any, as unknown as) that bypass intended type safety.

## Baseline Change Control
Inference baseline updates are allowed only when type behavior changes intentionally.

When this happens:
- Document the change reason in the PR notes.
- Update impacted invariant and regression tests explicitly.
- Identify whether the change is non-breaking or breaking for framework consumers.
- If breaking, call it out clearly and request approval before finalizing.

## Suggested Matrix Cadence
Use pairwise combinations to avoid combinatorial explosion while preserving coverage quality.

Recommended minimum per PR touching createHandler internals:
- 1 capability test for the changed axis
- 1 interaction test crossing with an existing axis
- 1 invariant or regression assertion ensuring old behavior still holds

## Agent Checklist
Before marking work complete, future agents must confirm:
- Added or updated relevant files in src/core/__type-tests__
- pnpm check passes
- No inference baseline was weakened unintentionally
- AGENTS rules were followed
- Any intentional inference contract change is documented
