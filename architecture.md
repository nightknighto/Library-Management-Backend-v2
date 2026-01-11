# 📁 Project Architecture Guide

## 🏗 Overview

This project follows a **Feature-Based (Vertical Slice) Architecture**. Unlike traditional MVC, we group code by **Business Domain** rather than technical role. This ensures high cohesion and makes the codebase easier to navigate as it scales.

---

## 📂 Directory Structure

### `src/features/` (The Core)

This is where 90% of the development happens. Each folder represents a specific business domain (e.g., `users`, `billing`, `orders`).

* **`*.controller.ts`**: Handles HTTP logic. Parses requests and returns responses. No business logic here.
* **`*.service.ts`**: The "Brain." Contains all business logic and orchestrates database calls.
* **`*.schema.ts`**: Data validation (Zod). Defines what the input/output should look like.
* **`*.routes.ts`**: Local routing for the specific feature.
* **`*.types.ts`**: TypeScript interfaces specific to this domain.

### `src/shared/` (The Glue)

Logic that is specific to our application but used by multiple features.

* **`middlewares/`**: Global Express middlewares (Auth guards, error handlers, rate limiters).
* **`schemas/`**: Common validation patterns (e.g., Pagination, UUID validation).
* **`types/`**: Global API response shapes or Express type extensions.
* **`services/`**: Shared services used across features (e.g., EmailService, LoggingService, RedisService).

### `src/lib/` (The Adapters)

Wrappers for third-party SDKs. If we swap a library, we only change it here. Only for initializing and configuring external services.

* *Examples:* `prisma.ts` (DB Client), `stripe.ts` (Payments), `s3.ts` (Storage).
* **Rule:** Features should import from `lib/`, not directly from `node_modules` for core clients.

### `src/utils/` (The Toolbox)

Stateless, domain-agnostic helper functions.

* *Examples:* `date-formatter.ts`, `currency-convert.ts`, `string-utils.ts`.
* **Rule:** If a function needs to know about the Database or a User model or third-party service, it does **not** belong here.

### `src/config/` (The Brain)

Centralized environment variable management.

* Uses a validation library (like Zod) to ensure the app crashes immediately if a required `.env` variable is missing.
