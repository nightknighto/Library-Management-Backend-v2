# Factory Instance `access` Override — Decision Deferral

- **Date:** 2026-07-16
- **Status:** Deferred (no implementation; pending more usage experience)
- **Relationship:** Companion to `2026-07-16-factory-authorizer-additive-merge.md`. That spec settles how `authorize` buckets merge (pure additive). This doc records the **unresolved** question of whether a factory instance may change the factory's `access` mode.
- **Related invariant (decided):** A factory instance may **not** change the factory's `authenticate`. See §2 — that lock is final.

---

## 1. Why this exists

`createHandlerFactory` is the framework's security-posture primitive: it captures `access` + `security` once and stamps them onto every handler it produces. A natural question arises: **should an individual instance be able to override the `access` mode the factory declared** — e.g. turn a `protected` factory into a `public` endpoint, or a `public` factory into a `protected` one?

The answer has real security consequences and is not obvious. This document captures the full debate so a future decision can be made from a known starting point instead of being re-derived.

---

## 2. The `authenticate` analog — decided, for contrast

We debated two factory-instance override questions together. They have different answers:

| Property | Instance can override? | Rationale |
|---|---|---|
| `authenticate` | **No (locked)** — final decision | Swapping the authenticator can produce a *different auth-context shape* than the factory's `TAuth` promises, which is unsound. The identity model is the most fundamental primitive; it must be uniform across a factory's surface. The current type lock (`InheritedSecurity` exposes only `authorize`) is correct and should be treated as a first-class invariant. |
| `access` | **Deferred** — this document | See §3. |

The `authenticate` lock informs the `access` debate: if the identity provider is locked, the question is only *what the factory does with that provider's output* (require it? allow its absence?).

---

## 3. The debate

### 3.1 Current behavior

Today, `access` is **freely changeable** at the instance. `SecuredFactory` (`create-handler.core.ts:643-659`) lets a `protected` factory produce `optional` or `public` instances; `PublicFactory` (`:666-689`) lets a public factory upgrade to `protected`/`optional`. Any direction, any time.

At runtime the merge (`:778-792`) computes `merged.access = overrides?.access ?? defaults?.access`, and `createHandlerRuntime` (`:362-443`) then branches purely on the resolved `access`. Every type-valid transition behaves correctly at runtime (verified 2026-07-16).

### 3.2 Steelman for keeping it changeable

Real SaaS surfaces aren't uniform. A user-resource controller legitimately mixes postures:
- `GET /api/me` → `protected`
- `GET /api/users/:id` → `optional` (public profile; authed users see more)
- `GET /api/health` → `public`

These often share a controller — same resource domain, same error handling, same authorizers, same rate-limit config. Forcing *three factories* (protectedUserApi / optionalUserApi / publicUserApi) holding identical non-access config is genuine boilerplate. On this view the factory is "shared config," and `access` is just one more piece of config that can vary per endpoint.

### 3.3 Steelman for locking it

1. **The factory's identity is security posture.** It takes `access` + `security`; its *purpose* is the auth posture. An auditor reading `staffApiFactory(...)` should be able to assume `protected` — today they cannot.
2. **Widening is the footgun; cost asymmetry favors locking.** A `protected → public` instance change *weakens* security, invisibly, far from the baseline. The cost of being wrong if we lock (someone needs the override → trivial escape: a second factory or raw `createHandler`, zero capability lost) is tiny. The cost of being wrong if we stay permissive (a silent security hole) is large.
3. **The "mixed-posture controller" scenario is weaker than it sounds.** In real codebases the public/optional endpoints almost always have a *different middleware stack* (no auth middleware, different rate limits, CORS) and get split into their own router anyway. The friction of a second factory is often fictional.
4. **Consistency.** Locking `authenticate` but not `access` leaves one security property of the factory's identity overridable and the other not — an inconsistency that's hard to teach. Locking both gives one clean rule: *the factory declares the security posture; the instance extends policy within that posture.*

### 3.4 The narrowing-only middle ground

A defensible intermediate policy: **allow tightening, forbid loosening.** An instance may move `public → optional → protected` but never backward. This keeps the safe, genuinely-useful narrowing case (a default-public app securing one endpoint) while blocking the dangerous widening footgun. It is more flexible than a flat lock, at the cost of a more complex rule to teach and type (directional ordering on `AccessMode`).

---

## 4. The three options on the table

| Option | Behavior | Tradeoff |
|---|---|---|
| **Lock completely** | Factory `access` is final; instances cannot change it. | Simplest, most predictable, closes the widening footgun, consistent with the `authenticate` lock. Narrowing use case lost (escape: second factory / `createHandler`). |
| **Narrowing-only** | Instances may tighten (`public → optional → protected`), never loosen. | Keeps the safe narrowing case; blocks widening. More complex to teach and type. |
| **Status quo (any change)** | Instance can change `access` freely. | Most flexible. Allows silent widening — the security footgun. |

---

## 5. Why the decision is deferred (not skipped)

The decision hinges on how often, in real apps, a *single controller* genuinely needs mixed `access` postures with otherwise-identical factory config — and whether the cost of a second factory in those cases is real friction or theoretical. That cannot be answered from a single dummy app. It needs exposure across several real codebases.

---

## 6. What to gather before revisiting

Concrete observations to collect during usage:

1. **Frequency of mixed-posture controllers.** How often does one resource domain span multiple `access` modes in practice? If rare, lock. If common, narrowing-only or status quo.
2. **Whether mixed-posture endpoints actually share non-access config.** Do they reuse the same authorizers / error handling, or do they diverge enough that a second factory is trivial? If they diverge, the boilerplate argument weakens.
3. **Whether widening ever happens accidentally.** Any near-miss where a `protected → public` override was written by mistake would be direct evidence for locking.
4. **The cost of the second-factory escape hatch.** If locking forces awkward factory proliferation, that's friction evidence against the flat lock (favoring narrowing-only).

---

## 7. Implementation notes for whoever revisits

When the decision is made, the change is concentrated in:

- **`src/core/create-handler.core.ts`** — the `SecuredFactory` and `PublicFactory` overloads (`:634-689`): a flat lock removes the cross-access overloads; narrowing-only keeps the `public → secured` direction and removes the reverse.
- **Possibly the runtime** — only if defense-in-depth against `as any` escapes is desired (arguably YAGNI; the type system is the boundary, and today's runtime already handles every type-valid transition correctly).
- **Type-tests** — `src/core/__type-tests__/create-handler.capabilities.type-test.ts` would need negative assertions for the newly-forbidden transitions.
- **JSDoc** — `createHandlerFactory` "Merge rules" block (`:701-704`) and the factory type docs must state the final rule explicitly.

Coordinate with `2026-07-16-factory-authorizer-additive-merge.md`: the two specs touch adjacent factory-merge surfaces and should be implemented in a consistent pass.
