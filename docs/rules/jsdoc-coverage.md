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

## Content Quality: Behavior, Not Rationale
JSDoc is written for the API consumer reading an IntelliSense tooltip — not for a maintainer reading source. Two hard rules govern content:

1. **Behavior only.** JSDoc must cover what the API does, how to call it, its inputs, outputs, and observable outcomes/contracts. The first sentence must state what the API is or does.
2. **No internal rationale.** Inference mechanics, trade-off analysis, "by design" justifications, implementation notes, and cross-references to rules docs do NOT belong in JSDoc. Move them to a `//` comment adjacent to the code or to a `docs/rules/` spec.

**Decisive test:** if a user cannot act on a sentence from a tooltip, it does not belong in JSDoc.

### Examples of what to strip from JSDoc
- *"TAuthContext is inferred from the callback's return type with no backward flow into a handler signature"* — inference mechanics. Move to a `//` comment.
- *"Parameterless by design: the message is mechanism-specific, so it does not depend on the request"* — design rationale. Move to a `//` comment.
- *"Extensible so future options can be added without a signature change"* — implementation note. Remove.
- *"@see docs/rules/..."* — internal cross-reference. Remove; rules docs are not consumer-facing.

### Examples of behavior-focused JSDoc
- *Builds an Authenticator from your authentication callback.* — what it does, first sentence.
- *Resolve `null` → no credentials present. For `protected` handlers the request is rejected.* — observable outcome.
- *Throw an `HttpError` → authentication failure. The thrown status and message become the response.* — contract.

## Verification Checklist
- Hover check: options properties and nested sub-properties show accurate JSDoc hints in IntelliSense.
- Behavior notes match runtime logic (defaults, validation rules, and access mode effects).
- No internal rationale in JSDoc (inference mechanics, design justifications, implementation notes, or rules-doc cross-references) — apply the "can a user act on this from a tooltip?" test to every sentence.
- No new or edited framework API ships with missing or shallow JSDoc.
