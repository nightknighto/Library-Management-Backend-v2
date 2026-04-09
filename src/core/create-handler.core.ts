/**
 * @file create-handler.core.ts
 * 
 * Orchestrates HTTP request handling by connecting three stages: validation, execution,
 * and response generation. This is the main execution engine for API endpoints.
 * 
 * A handler processes three stages:
 * 1. Request validation: Ensures incoming request conforms to contract
 * 2. Handler execution: Runs business logic with validated request
 * 3. Response generation: Wraps results in contract-compliant envelope
 * 
 * Response building (pagination, payload construction) is delegated to response-builder.core.ts.
 * Error handling is delegated to error-handler.core.ts module for separation of concerns.
 * 
 * All responses follow the contract structure: { success: true|false, data?, error?, meta }
 * 
 * SECTIONS:
 * 1. DATA STRUCTURES - Shared type usage (types.core.ts)
 * 2. TYPE INFERENCE ENGINE - Advanced TypeScript types for type safety (internal)
 * 3. HANDLER EXECUTION - Main orchestration logic (developer-facing API)
 */

import type { RequestHandler } from "express";
import type { infer as Infer, ZodTypeAny } from "zod";
import type { Contract } from "./create-contract.core.ts";
import type { ValidatedRequest } from "../shared/middlewares/validators.middleware.ts";
import { sanitizeResponse } from "../shared/schemas/sanitize-response.ts";
import { validateContractRequest } from "./validate-contract-request.core.ts";
import { handleError } from "./error-handler.core.ts";
import { buildPaginationMeta, buildSuccessResponsePayload } from "./response-builder.core.ts";
import type { HandlerSuccessResult } from "./types.core.ts";

// ============================================================================
// SECTION 1: DATA STRUCTURES - Shared Type Usage
// ============================================================================
// Shared handler and response types are defined in types.core.ts.

// ============================================================================
// SECTION 2: TYPE INFERENCE ENGINE - Advanced TypeScript Types
// ============================================================================
// These are "magical" TypeScript constructs that provide automatic type inference
// for contract shapes, handler inputs, and return types. You likely won't modify these.

/**
 * Generic type matching any contract for simplified type signatures.
 */
type AnyContract = Contract<ZodTypeAny, ZodTypeAny, boolean>;

/**
 * Extracts the request payload type from a contract.
 * 
 * Infers what the handler will receive as `req` after validation.
 */
type ContractRequestPayload<TContract extends AnyContract> = Infer<TContract['request']>;

/**
 * Contract-specific handler result type.
 * 
 * Automatically infers pagination requirement from the contract's `paginated` flag.
 * This ensures typechecker validates handler return shape matches contract expectations.
 */
type ContractHandlerSuccessResult<TContract extends AnyContract> =
    TContract extends Contract<ZodTypeAny, infer TResponseDataSchema extends ZodTypeAny, infer TPaginated extends boolean>
    ? HandlerSuccessResult<TResponseDataSchema, TPaginated>
    : never;

// ============================================================================
// SECTION 3: HANDLER EXECUTION - Main Orchestration Logic
// ============================================================================
// Main handler factory. Creates Express RequestHandler that automates validation,
// execution, response building, and error handling.

/**
 * Creates an Express request handler with automatic request validation and response wrapping.
 * 
 * ## Three-Stage Processing
 * 
 * **Stage 1: Request Validation**
 * - Validates incoming request (body, query, params) against contract.request schema
 * - Returns 400 with validation issues if invalid
 * - Mutates req object with validated/typed fields
 * 
 * **Stage 2: Handler Execution**
 * - Invokes **your** handler function with validated request
 * - Your handler **must** return { data, statusCode?, pagination? } (types enforced by contract)
 * - Catches exceptions (both expected HttpError and unexpected generic errors)
 * 
 * **Stage 3: Response Wrapping**
 * - Wraps data in contract-compliant response envelope
 * - Generates timestamp and pagination metadata
 * - Sanitizes response to remove extra fields (via sanitizeResponse)
 * - Returns HTTP response with appropriate status code
 * 
 * ## Error Handling Strategy
 * 
 * - **Zod Validation Errors (400)**: Invalid request → { success: false, error: { message, issues } }
 * - **Output Validation Errors (500)**: Handler returned invalid data → { success: false, error: "..." }
 * - **HttpError Exceptions**: Custom status + message → { success: false, error: "..." }
 * - **Generic Errors (500)**: Any other error → { success: false, error: "Internal Server Error" }
 * 
 * ## Usage
 * 
 * ```typescript
 * // Define contract
 * const createBookContract = createContract({
 *   request: { body: { title: z.string(), isbn: z.string() } },
 *   response: BookSchema,
 * });
 * 
 * // Write handler
 * const createBook = createHandler(createBookContract, async (req) => {
 *   const book = await BookRepository.create(req.body);
 *   if (!book) throw new createHttpError.BadRequest("Failed to create");
 *   return {
 *     statusCode: 201,
 *     data: book,
 *   };
 * });
 * 
 * // Route registers handler directly
 * router.post('/books', createBook);
 * ```
 * 
 * @returns Express RequestHandler ready to mount on routes
 * 
 * @typeParam TContract - The contract type (inferred from params)
 * 
 * @throws HTTP response on validation error (400), HTTP error (custom), or server error (500)
 *         (Does not throw; instead sends error response)
 */
export function createHandler<TContract extends AnyContract>(
    /**
     * API contract defining request/response shapes and pagination behavior.
     * 
     * The contract acts as a schema definition that:
     * - Validates incoming request (body, query, params)
     * - Enforces response data shape returned by handler
     * - Specifies pagination requirements
     * 
     * **Must be created with `createContract()`**
     * 
     * @example
     * ```typescript
     * const listBooksContract = createContract({
     *   request: {
     *     query: { limit: z.number(), offset: z.number() }
     *   },
     *   response: BookSchema,
     *   paginated: true,  // Enables pagination in response
     * });
     * 
     * @see createContract for contract creation
     */
    contract: TContract,

    /**
     * Business logic function that processes the validated request and returns a typed result.
     * 
     * @param req - Validated request object with type-safe body, query, and params properties
     * @returns Promise resolving to `{ data, statusCode?, pagination? }`
     *   - `data`: Must match the contract's response schema (validated automatically)
     *   - `statusCode`: HTTP status code **(default: 200)**. Use 201 for creation, 204 for no content, etc.
     *   - `pagination`: Pagination metadata `{ limit, offset, total }` - Required only for **paginated contracts**
     * 
     * @example
     * ```typescript
     * const createBook = createHandler(createBookContract, async (req) => {
     *   const book = await BookRepository.create(req.body);
     *   if (!book) throw new createHttpError.BadRequest("Failed to create book");
     *   return {
     *     statusCode: 201,
     *     data: book,
     *   };
     * });
     * ```
     * 
     * @throws HttpError - Use for expected errors (400, 404, 409, etc.)
     * @throws Any other error - Will be caught and returned as 500 Internal Server Error
     */
    handler: (
        req: ValidatedRequest<ContractRequestPayload<TContract>>,
    ) => Promise<ContractHandlerSuccessResult<TContract>>,
): RequestHandler {
    return async (req, res) => {
        try {
            // ================================================================
            // STAGE 1: REQUEST VALIDATION
            // ================================================================
            // Parse and validate incoming request against contract schema.
            // Throws ZodError if validation fails (caught below).
            // Mutates req.body, req.query, req.params with validated data.

            const validatedReq = await validateContractRequest<TContract['request']>(
                contract.request,
                req,
            );

            // ================================================================
            // STAGE 2: HANDLER EXECUTION
            // ================================================================
            // Execute business logic with validated, typed request.
            // Handler returns { data, statusCode?, pagination? } which must
            // match the contract's expected response data type.

            const result = await handler(validatedReq);

            // ================================================================
            // STAGE 3: RESPONSE WRAPPER
            // ================================================================
            // Build response envelope following contract structure.

            // Generate ISO timestamp for all successful responses
            const timestamp = new Date().toISOString();

            // Use handler's statusCode or default to 200
            const statusCode = result.statusCode ?? 200;

            // Build pagination metadata if handler provided pagination input
            // (computed only for paginated contracts when pagination is present)
            const pagination = result.pagination
                ? buildPaginationMeta(result.pagination)
                : undefined;

            // Construct success response matching contract.response schema
            const successPayload = buildSuccessResponsePayload({
                data: result.data,
                timestamp,
                // Pagination metadata: only included if present
                pagination,
            });

            // Validate response against contract.response schema and strip extra fields
            // (throws error caught in outer catch if output validation fails)
            const output = sanitizeResponse(contract.response, successPayload);

            // Send validated response
            res.status(statusCode).json(output);
        } catch (error) {
            // All error handling is delegated to the error handler module
            // which categorizes and responds appropriately (400, 500, or custom status)
            handleError(error, contract.response, res);
        }
    };
}
