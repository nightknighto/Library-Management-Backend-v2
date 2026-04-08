# 📁 Project Architecture Guide

## 🏗 Overview

This project follows a **Feature-Based (Vertical Slice) Architecture**. Unlike traditional MVC, we group code by **Business Domain** rather than technical role. This ensures high cohesion and makes the codebase easier to navigate as it scales.

---

## 📂 Directory Structure

### `src/features/` (The Core)

This is where 90% of the development happens. Each folder represents a specific business domain (e.g., `users`, `billing`, `orders`).

* **`*.controller.ts`**: Handles HTTP or Express-specific logic. Parses requests, calls the appropriate service and returns responses. No business logic here.
* **`*.service.ts`**: The "Brain". Contains all business logic and interacts with the database, integrates with third-party APIs, or performs calculations. Never pass `req` or `res` into a service; this makes it impossible to test.
  * If you ever need to switch from REST to GraphQL, your Services won't change; only your Controllers will.
* **`*.schema.ts`**: Data validation (Zod). Defines what the input/output should look like. Database table schemas can also be defined here.
* **`*.routes.ts`**: Local routing for the specific feature.
* **`*.types.ts`**: TypeScript interfaces specific to this domain.

> **Encapsulation**: The rest of the app only talks to the `service`. The routes and schemas are private details of that feature.

Some other file notations that are less likely to be needed: (won't be used in this project but good to know for future projects)

- **`*.model.ts`**: Database models and schemas definition. It defines fields, types, and constraints. You use it to tell the database what the table looks like and to tell TypeScript what the object looks like. (In case you don't want to store all schemas in `*.schema.ts`).
- **`*.repository.ts`**: Data access layer. Contains all database queries related to that feature. This is optional and can be merged into the service if the logic is simple. It abstracts away the database client and allows for easier swapping of database technologies in the future. Having a separate Repository file for every feature can feel like "boilerplate overkill" because modern ORMs like Drizzle are already very clean. If you find yourself writing a lot of complex queries that are hard to read in the service, then it might be worth extracting them into a repository. 


### `src/shared/` (The Glue)

Logic that is specific to your application but used by multiple features.

* **`middlewares/`**: Global Express middlewares (Auth guards, error handlers, rate limiters).
* **`schemas/`**: Common validation patterns (e.g., Pagination, UUID validation).
* **`types/`**: Global API response shapes or Express type extensions.
* **`services/`**: Shared services used across features (e.g., EmailService, LoggingService, RedisService).

> The Rule: It is "domain-aware." It knows what a "User" or an "Error" looks like in your specific system.

### `src/lib/` (The Adapters)

Wrappers for third-party SDKs. If we swap a library, we only change it here. Only for initializing and configuring external services.

* *Examples:* `prisma.ts` (DB Client), `stripe.ts` (Payments), `s3.ts` (Storage).
* **Rule:** It "initializes" a tool.
* **Rule:** Features should import from `lib/`, not directly from `node_modules` for core clients.

### `src/utils/` (The Toolbox)

These are stateless, generic functions that do one small thing and have no "knowledge" of your app's business domain.

* **What goes here**: Date formatters, string manipulators, or a function to calculate a hash.
* *Examples:* `date-formatter.ts`, `currency-convert.ts`, `string-utils.ts`.
* **Rule:** If a function needs to know about the Database or a User model or third-party service, it does **not** belong here.
* **Rule:** You should be able to copy this folder into a completely different project (like a React frontend) and it would still work.

> Reflecting on `/lib` and `/utils`: The key is to maintain the conceptual separation: `/lib` for external service wrappers and `/utils` for pure helper functions. If you find that distinction too rigid, feel free to combine them but keep the naming clear (e.g., `lib/stripe.ts` vs `lib/date-utils.ts`).

### `src/config/` (The Brain)

Centralized environment variable management. This is strictly for external settings. It’s the bridge between your environment variables `(.env)` and your application.
* What goes here: Database connection strings, API keys, CORS settings, or AWS S3 bucket names.
* The Rule: If you change a value here, it shouldn't require you to change your business logic.
* Example: `database.config.ts`, `passport.config.ts`.

> Use a validation library (like Zod) to ensure the app crashes immediately if a required `.env` variable is missing.

> Loggers and their configurations are put in this folder.

---

## 🔗 Inter-Feature Communication

The "Final Boss" of feature-based architecture is handling communication between features. Two strategies ensure independence while allowing features to collaborate:

### Strategy 1: Controller Orchestrator

The controller calls both services and passes results between them. Services remain unaware of each other.

* **Rule:** Services don't import other services.
* **Why:** Completely decouples business logic. Each service can be tested in isolation without worrying about dependencies. The controller acts as the "orchestrator" that coordinates between services.
* **Best for:**
  * Synchronous workflows requiring coordination between independent features (e.g., getting user data to create an order).
  * When features are truly isolated and you want to keep them decoupled.
  * Highest flexibility in how features interact since the controller can decide what data to pass and how to handle it.
  * Highest reusability of services since they don't depend on each other.
  * Testability since services can be tested in isolation without worrying about dependencies.

**Example:**

```typescript
// features/orders/orders.controller.ts
import * as orderService from './orders.service.ts';
import * as userService from '../users/users.service.ts'; // Importing the other service

export const checkout = async (req, res) => {
  // 1. Get user data from User Service
  const user = await userService.getById(req.user.id);

  // 2. Pass that data into the Order Service
  const order = await orderService.createOrder(user, req.body.items);

  res.status(201).json(order);
};
```

### Strategy 2: Shared Common Logic / Shared Services

Shared logic lives in `src/shared/services/`, not in either feature, and both features (their services) import from there. This is ideal for truly shared domain logic (e.g., calculating discounts, sending notifications). For non-domain-specific shared logic (e.g., formatting dates), use `src/utils/`.

* **Rule:** Services import from `shared/` for common business logic.
* **Why:** 
  * Eliminates duplication when multiple services legitimately need the same logic. Shared services ensure consistency and a single source of truth across features.
  * Controllers stay strict to HTTP concerns—parsing requests, calling a service, returning responses. Services handle all business logic orchestration internally, avoiding controller coupling with business logic.
* **Best for:**
  * When multiple features share the exact same business logic (vs isolated services in Strategy 1).
  * When consistency across features is critical and non-negotiable (e.g., tax calculations, discount rules, permission checks).
  * When avoiding duplication is more important than maintaining service isolation.
  * When the same business rule must be enforced everywhere for correctness, not just convenience.
  * Reducing code duplication across multiple services that would otherwise implement the same logic independently.
* **When NOT to use:**
  * If logic is only used by a single feature, keep it in that feature's service. This is premature extraction.
  * If code is similar but represents different business rules, don't force it into shared logic. Only share genuinely identical logic.
* **What "shared" means:**
  * Extract only logic that enforces the same business rule across features (e.g., same tax calculation, same permission check).
  * Don't extract "similar-looking code" if it serves different purposes in different contexts.

**The Import Rule:**
* Features CAN import from `shared/` and `lib/`.
* Features CAN import from other Features (carefully).
* `shared/` and `lib/` can NEVER import from Features.

**The Circular Dependency Trap ⚠️:**

Avoid direct service-to-service imports:

```typescript
// ❌ WRONG

--- // In users.service.ts
import * as orderService from '../orders/orders.service.ts';

--- // In orders.service.ts
import * as userService from '../users/users.service.ts'; 

---
// Result: Node crashes or undefined imports
```

**Fix it by:**
1. Extracting shared logic into a third service file in `src/shared/services/`.
2. Moving orchestration (calling services) into Controllers instead of services.

---

**Mixing Both Strategies:**

You don't have to choose one strategy for your entire app. Use **Strategy 1** for some feature interactions and **Strategy 2** for others. Pick the right tool for each use case:
* Use Strategy 1 when features are independent and coordinate in the controller.
* Use Strategy 2 when features legitimately share the same business logic.

Example: Orders and Payments might use Strategy 1 (controller orchestrates), while Orders and Invoices might use Strategy 2 (shared `invoice.service.ts` for generating invoices).
