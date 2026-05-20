# JSDoc Coverage Rule (Core/Framework)

## Scope
- Applies to framework surfaces only: src/core and framework integration layers in src/shared and src/lib.
- Does not apply to feature modules unless explicitly requested.

## Rule (Strict)
- Any edit to a framework API must include complete JSDoc coverage for:
  - Exported functions, factories, utilities, and user-facing types
  - Options objects and every property in those objects
  - Nested option objects (sub-properties)
  - Return values, defaults, side effects, and mode-dependent behavior
- Update or replace any existing JSDoc that is incorrect, incomplete, or ambiguous.
- Include at least one @example block for each user-facing function/utility/type unless an existing example already covers the behavior you changed.

## Verification Checklist
- Hover check: options properties and nested sub-properties show accurate JSDoc hints in IntelliSense.
- Behavior notes match runtime logic (defaults, validation rules, and access mode effects).
- No new or edited framework API ships with missing or shallow JSDoc.
