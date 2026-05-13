# Runtime Test Requirements

## Purpose
Runtime tests are mandatory for any new or changed runtime behavior. This rule exists to prevent regressions in framework behavior and feature integrations.

## Scope
- Core framework changes (src/core, shared auth/handler primitives) must add or update runtime tests in tests/core.

## Required Coverage
For every new runtime behavior:
- Success path validation (response envelope, status codes, pagination, cookies when relevant).
- Failure paths for request validation and response validation.
- Authentication and authorization behavior when applicable (including optional vs protected access).
- Edge cases that could regress (for example: pagination metadata, response schemas, error mapping).

## Tooling
- Use Jest for runtime tests.
- Prefer supertest with a minimal Express harness for integration coverage.

## Exceptions
If runtime tests are not feasible for a change:
- Get explicit approval before skipping tests.
- Document the gap and rationale in the PR or task summary.
