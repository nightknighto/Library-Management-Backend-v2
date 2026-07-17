# Spec: Framework Changelog

**Date:** 2026-07-17
**Status:** Design — approved, pending implementation
**Surfaces:** `CHANGELOG.md` (new), `AGENTS.md` (rule addition)

## Problem

Framework API changes ship at a pace that outstrips memory. Past evolutions —
the authenticator error-model redesign, before/after validation buckets,
factory `.extend()`, the throw-based authorizer model — become hard to recall
accurately months later. The downstream production app using this framework
lags behind, so there is no reliable way to look at a snapshot and understand
"what did the framework look like then, and what has changed since?"

Nothing in the repo records *what shipped when*. `docs/specs/` captures design
*intent* (some specs are even deferred and never shipped). Git log captures
*actions* but is unscoped, unstructured, and ~60% of history predates the
conventional-commit convention. There is no bridge between the two.

## Goal

A scannable, dated record of framework-surface evolution — terse enough to skim
at a glance, detailed enough to recall what was done without opening specs.
Pure documentation. No versioning ceremony.

## Locked decisions

| Decision | Resolution |
|---|---|
| Anchor model | Date-based. No semver, no `package.json` bumps, no git tags, no release tooling. |
| File structure | Single `CHANGELOG.md` at repo root. |
| Entry shape | Form 2D: `###` headline (subject only, NO commit hash — see "Why no commit hashes") + blockquote (the problem/reason — present by default; optionally the decision rationale when alternatives were weighed) + bullets (the what). |
| Entry granularity | One entry per commit that touches `src/core`. No consolidation, no judgment calls. |
| Traceability | By subject + date heading, not commit hash. `git log --grep="<subject>"` reaches the commit. (See "Why no commit hashes".) |
| Coverage scope | `src/core` only. `src/shared`, `src/lib`, `src/utils`, `src/features` are consumers, never appear in the changelog — not even as bullets/examples. |
| Backfill | All framework commits from `fce63c3` (pagination) forward to HEAD, plus a baseline API snapshot anchored to `f28332e`. |
| Authoring | A defined completion step in `AGENTS.md`. Agent writes the entry as part of finishing the work; no per-entry approval gate. |

## File: `CHANGELOG.md`

### Top-level layout

```md
# Changelog

<one-paragraph preamble: scope statement + "newest at top">

---

## YYYY-MM-DD

### <Entry title>[ · BREAKING]

[> <problem/reason the change solves — present by default; optionally the
>  decision rationale when alternatives were weighed>]

- <bullet: API delta, new/removed export, signature/behavior change, migration note>

### <next entry>...

---

## Baseline — framework state as of `f28332e` (pre-changelog)

<structured API snapshot of the pre-changelog framework>
```

Date headings are `## YYYY-MM-DD`, descending (newest at top). Within a date,
entries are `###`, ordered newest-first (matching commit order). The Baseline
section sits at the bottom as the chronological starting point.

### Entry shape (Form 2D) — detailed

Every entry is built from these elements:

- **Headline:** `### <Title>`
  - Title is a short noun phrase naming the change (e.g., "Factory `.extend()` —
    factory-extends-factory", "Throw-based authorizer error model").
  - Append `· BREAKING` when the change breaks downstream consumers (removed
    exports, changed signatures, altered runtime contracts).
  - **No commit hash in the headline.** A commit's hash is unknowable until that
    commit exists, and amending to fold the entry into the feature commit would
    change the hash anyway (chicken-and-egg). Entries are anchored by subject +
    the `## YYYY-MM-DD` date heading above them; traceability to a commit is via
    `git log --grep="<subject>"`. The backfilled entries were originally written
    with hashes and later stripped to keep the file on one uniform reference
    scheme — see "Why no commit hashes" below.
- **Blockquote (default-on):** the **problem, reason, or motivation** behind the
  change — the thing that, when forgotten, this paragraph reminds you of.
  - Present **by default**, because nearly every change you request is solving a
    stated problem. If there was a problem worth solving, there is a blockquote.
  - State the problem/reason plainly: what was wrong, what was missing, what
    friction or limitation triggered the change.
  - When alternatives were weighed and a hard decision was made between the
    implemented path and rejected ones, add a sentence (or two) capturing the
    **decision rationale** — why this path over the others.
  - Omit **only** when there genuinely is no problem statement — pure mechanical
    refactors with no motivation beyond code hygiene. Rare.
- **Bullets:** the *what* — API deltas. Each bullet is one fact:
  - New/removed exports and types.
  - Signature or runtime-contract changes.
  - For BREAKING changes: a migration note (what the consumer must change).
  - When a `docs/specs/*.md` exists for the change, link it in the relevant bullet.
  - When work is deferred, a `**Deferred:**` bullet names the deferral spec.

The deliberate asymmetry: the *why* (problem/reason) lives in the blockquote
(present by default, so you can recall the motivation months later); the *what*
(API deltas) lives in the bullets. Headlines alone give a 5-second scan; bullets
give recall without opening specs; the blockquote restores the reason you forgot.

### Example entry (typical — problem + decision rationale)

```md
### Factory `.extend()` — factory-extends-factory

> To layer an `authorize` policy onto a shared factory, you had to author a
> fresh plain factory and re-declare the parent's `authenticate` baseline —
> the parent's security contract was lost on every reuse. Extension lets a
> derived factory layer on top while preserving it.
>
> Authenticate was made transitively locked (first setter wins) rather than
> overridable, so a child can't silently swap auth on a secured parent. A
> public factory can still be upgraded by supplying the first authenticator.

- `.extend()` method on both `SecuredFactory` and `PublicFactory`.
- `authorize` buckets concat additively (factory-first, no dedup).
- `authenticate` transitively locked — first-setter wins.
- Child `access` moves protected↔optional or public→{protected,optional};
  never widens to `public` (would erase the parent's security baseline).
- Flatten-on-extend: merges via `mergeHandlerSecurityDefaults`, delegates to
  `createHandlerFactory`, so chains of any depth work and `.extend` re-attaches.
  Spec: `docs/specs/2026-07-16-factory-authorizer-additive-merge.md`.
```

### Example entry (enabling change — problem only, no decision to weigh)

```md
### Additive authorizer merge

> Factory merging overrode `authorize` by key, so a per-handler `authorize`
> replaced the factory's baseline policies instead of layering on top. This
> blocked composing authorization across factory boundaries.

- `mergeHandlerSecurityDefaults` now concats `authorize` buckets factory-first
  instead of overriding — the composition primitive `.extend()` builds on.
- Scalar-override still applies to `access`/`authenticate`.
```

### Example entry (deferred work — problem that couldn't be solved yet)

```md
### Query accessor — deferred

> Exposing a `.querySchema` accessor for cross-contract reuse (matching the new
> `.bodySchema`/`.paramsSchema`) ran into a type-level blocker: query's
> field-map-only input can't be widened because `MergePaginationQuery` merges
> via keyof-gated intersection, which breaks for `z.ZodObject`.

- No `.querySchema` shipped.
- **Deferred:** candidate solution + inference risk documented in
  `docs/specs/2026-07-16-query-accessor-deferral.md`.
```

## Why no commit hashes

Entries are anchored by **subject + date heading**, not commit hash. The reason
is structural, not stylistic:

- A commit's hash is **unknowable until that commit exists**. The changelog entry
  is part of that same commit (it's a defined completion step), so there is no
  hash to reference at authoring time.
- **Amending doesn't help.** Committing the feature first, reading the hash, then
  `--amend`-ing the entry in produces a *new* hash — the one written into the
  entry now points at a commit that no longer exists. (It's reachable via reflog
  locally, but garbage on a fresh clone.) Chicken-and-egg, no escape.
- The only ways out were: (a) two commits per feature (entry as a follow-up
  `docs(changelog):` commit — atomicity lost), (b) drop the hash and reference by
  subject (atomicity kept, one-click jump lost), or (c) accept a stale-by-one
  reference (ugly, fragile). **Option (b) was chosen** because the recall value
  lives in the blockquote, not the hash, and atomic single commits matter more
  than a one-click diff jump.

Traceability to a commit is via `git log --grep="<entry subject>"`. The 11
backfilled entries were originally authored with hashes (the hashes were stable
and known at backfill time) and later **stripped** so the whole file uses one
uniform reference scheme — a mix of hashed and hashless entries would read as an
unexplained two-era split.

## Scope rule (mechanical)

**An entry is written when and only when a commit changes files under
`src/core`.**

- `src/core` is the framework surface. Every commit touching it gets exactly one
  entry (one entry per commit — no consolidation).
- `src/shared`, `src/lib`, `src/utils`, and `src/features` are *consumers* of
  the framework, not framework surface. Changes there are consequences of a
  framework change. They:
  - Never generate their own entry.
  - **Never appear in the changelog at all** — not as bullets, not as examples,
    not as "demonstrated in X". This is a bright-line rule, not a judgment call:
    even when a consumer change illustrates the framework delta (e.g. the books
    proving ground adopting a new API), it stays out of the changelog. That the
    capability is usable on real code is conveyed by the framework API surface
    itself, not by consumer adoption notes.
- Pure infrastructure changes (configs, tooling, dependency bumps, `src/lib`
  connection plumbing, `src/utils`) never generate an entry, even if co-located
  in a commit that also touches `src/core` — the entry covers only the
  framework-API delta.

This rule is mechanical and judgment-free: did `src/core` change? Then write one
entry summarizing the framework-API delta of that commit.

## Backfill

Two artifacts, both written during implementation:

1. **Per-commit entries** for all 11 framework commits from `fce63c3` (request
   pagination) forward to HEAD that touch `src/core`:
   - Authored by examining each commit's actual diff (`git show <hash>`), not
     from memory or commit messages alone.
   - Form 2D shape, scope rule, and BREAKING/Deferred/spec-link conventions
     applied uniformly.
   - Commit list (oldest first):
     `fce63c3`, `7807584`, `21c5b0f`, `7e4a1f4`, `661b38a`, `5f15cd8`,
     `e0d8b26`, `7e16dda`, `6ae0b15`, `1467c0e`, `49b6021`.
   - **Excluded:** `0ebbde6` (Docker→SQLite swap) — it touches 0 `src/core`
     files (pure infrastructure: `Dockerfile`, `docker-compose.yml`,
     `prisma/schema.prisma`, `config.ts`), so it does not qualify under the
     `src/core`-only scope rule.
2. **Baseline section** anchored to `f28332e` (the parent of `fce63c3`) at the
   bottom of the file — a structured API snapshot of the framework as it existed
   immediately before the first changelog entry.
   - For each major surface (`createContract`, `createHandler`,
     `createHandlerFactory`, authorizer model, authenticator model, security
     pipeline, supporting exports): the exported name, the call signature in
     rough TypeScript, and a one-line note on how it differs from the current
     state where relevant.
   - Read first to understand the starting point; read upward through dated
     sections to trace evolution.
   - Source of truth for the snapshot's facts: the code at `f28332e`, read via
     `git show f28332e:<path>` (verified during design).

Pre-`fce63c3` commits (the early unscoped/messy ~40) are NOT backfilled
individually — the baseline snapshot summarizes their end state.

## Authoring process (the anti-rot mechanism)

A rule added to `AGENTS.md` makes appending a changelog entry a **defined
completion step** for any task that modifies `src/core`. Concretely:

- The agent writes the entry as part of finishing the work, alongside the
  existing completion steps (runtime tests, type-tests, `pnpm check`, JSDoc).
- The entry lands in the same commit as the code change.
- **No per-entry approval gate.** The user reviews after the fact (in the commit
  diff or by reading the file), and revises reactively if the agent over-writes
  or gets the tone wrong.

This is what keeps the changelog alive where `TODO.md` rotted: the entry is part
of the work itself, not a separate chore that slips when moving fast. The rule
is added to two places in `AGENTS.md` for reliable triggering:

1. A new dedicated section (e.g., `## Changelog Maintenance`) stating the rule,
   the scope, the entry shape, and pointing at `CHANGELOG.md`.
2. The `## Definition of Done` checklist, gaining one item: "If `src/core`
   changed, a `CHANGELOG.md` entry was appended in the same commit."

## What this is NOT

- **Not versioning.** No semver, no `package.json` bumps, no git tags, no
  release tooling. Pure documentation.
- **Not exhaustive.** Feature-app work, infrastructure, and consumer-side
  updates are not tracked here. Use `git log` for those.
- **Not a replacement for `docs/specs/`.** Specs capture design intent; this
  changelog captures what shipped. They complement each other.
- **Not a replacement for git log.** Git log captures raw actions; this
  changelog bridges them into a scannable, motivated, framework-scoped timeline.

## Validation

- Backfilled entries fact-checked against each commit's actual diff.
- Baseline snapshot facts already verified against the code at `f28332e`
  during design (read via `git show f28332e:<path>`).
- The `AGENTS.md` rule is placed in two locations for reliable triggering
  (dedicated section + Definition of Done item).
- No runtime or type-test impact — `CHANGELOG.md` and the `AGENTS.md` doc
  addition are documentation-only. `pnpm check` and the test suite are
  unaffected. Books proving ground is unaffected.

## Out of scope (intentionally not done)

- No release tooling, version bumping, or git tags.
- No backfill of pre-`fce63c3` history beyond the baseline snapshot.
- No restructuring of `docs/specs/` or its naming convention.
- No automation that generates entries from commit messages (commit-message
  style is too inconsistent across history, and authored entries carry
  motivation that commits don't).
- No multi-language or rendered-HTML output — plain Markdown only.

## Files touched

- `CHANGELOG.md` (new) — preamble + 11 backfilled per-commit entries + baseline
  snapshot.
- `AGENTS.md` — new `## Changelog Maintenance` section + one item added to
  `## Definition of Done`.
