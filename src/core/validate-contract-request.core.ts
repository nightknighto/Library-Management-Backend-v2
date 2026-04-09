/**
 * @file validate-contract-request.core.ts
 * 
 * Handles request validation and type promotion. This module is responsible for
 * ensuring incoming requests conform to their contracts and promoting plain Express
 * requests to ValidatedRequest with proper TypeScript typing.
 * 
 * SECTIONS:
 * 1. VALIDATION HELPERS - Type guards and validation utilities
 * 2. VALIDATION EXECUTION - Main validation function
 */

import type { Request } from "express";
import { ZodError, type infer as Infer, type ZodTypeAny } from "zod";
import type { ValidatedRequest } from "../shared/middlewares/validators.middleware.ts";

// ============================================================================
// SECTION 1: VALIDATION HELPERS - Type Guards
// ============================================================================
// Helper functions for detecting and working with Zod errors.

/**
 * Type guard to detect if an error is a ZodError.
 * 
 * Works both in browsers and Node, checking both instanceof and the error's name property
 * to handle cases where ZodError instance checks might fail (e.g., cross-realm errors).
 * 
 * @param error - Any error to check
 * @returns True if error is a ZodError, false otherwise
 * 
 * @example
 * try {
 *   schema.parse(data);
 * } catch (error) {
 *   if (isZodError(error)) {
 *     console.log("Validation issues:", error.issues);
 *   }
 * }
 */
export function isZodError(error: unknown): error is ZodError {
    return error instanceof ZodError || (error as { name?: string })?.name === "ZodError";
}

// ============================================================================
// SECTION 2: VALIDATION EXECUTION - Main Validation Function
// ============================================================================
// Core validation function that validates and type-promotes requests.

/**
 * Validates an Express request against a Zod schema and promotes it to ValidatedRequest.
 * 
 * This function performs three operations:
 * 1. **Validation**: Parses request (body, query, params) against schema asynchronously
 * 2. **Mutation**: Replaces req fields with validated data (type promotion in-place)
 * 3. **Type Return**: Returns same request object, now correctly TypeScript-typed
 * 
 * ## How It Works
 * 
 * ```
 * Input:  req (plain Request with any or unknown types)
 *         schema (Zod schema for request shape)
 *         ↓
 * Step 1: schema.parseAsync({ body, query, params })
 *         ↓ (throws if invalid)
 * Step 2: req.body = validated.body
 *         req.query = validated.query
 *         req.params = validated.params
 *         ↓
 * Output: req (now typed as ValidatedRequest<T>)
 * ```
 * 
 * ## Validation Failure
 * 
 * If validation fails, throws ZodError with structured issues array.
 * The error is caught and handled by createHandler to return 400 response.
 * 
 * - Error has arrays of validation issues: `error.issues`
 * - Each issue has: { path, code, message, expected, received }
 * - Use `isZodError(error)` to distinguish from other errors
 * 
 * ## Input/Output Contract
 * 
 * Input request object may have:
 * - `body`: any (from JSON parser, or populated by previous middleware)
 * - `query`: any (from Express parse-qs)
 * - `params`: any (from Express route matching)
 * 
 * After successful validation, these fields are replaced with types matching TRequestSchema.
 * 
 * @param schema - Zod schema that validates { body, query, params } structure
 * @param req - Express Request object to validate and mutate
 * 
 * @returns Same request object, with mutated body/query/params and proper TypeScript typing
 * 
 * @throws ZodError if request doesn't match schema (caught by createHandler for 400 response)
 * 
 * @typeParam TRequestSchema - Zod schema type (typically contract.request)
 * 
 * @example
 * // In createHandler:
 * const validatedReq = await validateContractRequest(contract.request, req);
 * // Now validatedReq.body, query, params are properly typed per contract
 */
export async function validateContractRequest<TRequestSchema extends ZodTypeAny>(
    schema: TRequestSchema,
    req: Request,
): Promise<ValidatedRequest<Infer<TRequestSchema>>> {
    // Parse and validate: extracts body, query, params from request
    // Throws ZodError if any field fails validation
    const validated = await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
    });

    // Mutate request: replace raw fields with validated, typed fields
    // This in-place modification serves as type promotion for TypeScript
    req.body = validated.body;
    req.query = validated.query;
    req.params = validated.params;

    // Return mutated request, now correctly typed as ValidatedRequest
    return req as ValidatedRequest<Infer<TRequestSchema>>;
}

