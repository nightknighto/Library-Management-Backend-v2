/**
 * @file error-handler.core.ts
 * 
 * Centralized error handling for HTTP requests. Categorizes errors, generates appropriate
 * responses, and handles logging safely.
 * 
 * Error Categories:
 * 1. Zod Validation Errors - Request validation (400) or output validation (500)
 * 2. HttpError Exceptions - Custom HTTP errors with status codes
 * 3. Generic Errors - Unexpected errors (500)
 * 
 * SECTIONS:
 * 1. ERROR UTILITIES - Logging and type checking helpers
 * 2. ERROR RESPONSE BUILDERS - Functions to build error responses per category
 * 3. ERROR HANDLER - Main error orchestration function
 */

import type { Response } from "express";
import createHttpError from "http-errors";
import { ZodError } from "zod";
import type { ContractResponseSchema } from "./create-contract.core.ts";
import { sanitizeResponse } from "../shared/schemas/sanitize-response.ts";

// ============================================================================
// SECTION 1: ERROR UTILITIES - Logging and Type Checking
// ============================================================================
// Helper functions for detecting errors and formatting them safely.

/**
 * Type guard to detect if an error is a ZodError.
 * 
 * Works both in browsers and Node, checking both instanceof and the error's name property
 * to handle cases where ZodError instance checks might fail (e.g., cross-realm errors).
 * 
 * @param error - Any error to check
 * @returns True if error is a ZodError, false otherwise
 */
export function isZodError(error: unknown): error is ZodError {
    return error instanceof ZodError || (error as { name?: string })?.name === "ZodError";
}

/**
 * Safe error formatter for logging without crashing on complex objects.
 * 
 * Node's util.inspect can crash when formatting complex Zod errors. This helper
 * safely converts errors to strings, falling back to JSON.stringify then String()
 * if necessary to avoid crashes.
 * 
 * @param error - Any error object (Error, Zod error, plain object, etc.)
 * @returns Safe string representation suitable for logging
 */
export function formatErrorForLog(error: unknown): string {
    // For standard Error objects, use stack trace if available
    if (error instanceof Error) {
        return error.stack ?? error.message;
    }

    // Try JSON.stringify for plain objects
    try {
        return JSON.stringify(error);
    } catch {
        // Fallback to String() if JSON.stringify fails (circular refs, etc.)
        return String(error);
    }
}

// ============================================================================
// SECTION 2: ERROR RESPONSE BUILDERS - Per-Category Response Construction
// ============================================================================
// Functions to build standardized error responses for each error type.

/**
 * Handles Zod validation errors (input or output validation).
 * 
 * Distinguishes between:
 * - Input validation (400): Client sent invalid request
 * - Output validation (500): Handler returned invalid data (internal error)
 * 
 * @param error - ZodError from validation
 * @param responseSchema - Contract response schema for sanitization
 * @param res - Express response object
 */
function handleZodError(
    error: ZodError,
    responseSchema: ContractResponseSchema<any, any>,
    res: Response,
): void {
    // Check if this is an output validation error (marked during sanitization)
    if ((error as { isOutputValidationError?: boolean })?.isOutputValidationError) {
        // Output validation error: handler returned invalid data (internal server error)
        const output = sanitizeResponse(
            responseSchema,
            { success: false, error: "Internal Server Error" }
        );
        res.status(500).json(output);
        return;
    }

    // Input validation error: client request didn't match contract
    // Return 400 with structured validation issues for client debugging
    const output = sanitizeResponse(responseSchema, {
        success: false,
        error: {
            message: "Request validation failed",
            issues: error.issues,
        },
    });
    res.status(400).json(output);
}

/**
 * Handles HttpError exceptions (custom HTTP errors with status codes).
 * 
 * Extracts error message and status code from http-errors package.
 * 
 * @param error - HttpError instance
 * @param responseSchema - Contract response schema for sanitization
 * @param res - Express response object
 */
function handleHttpError(
    error: createHttpError.HttpError,
    responseSchema: ContractResponseSchema<any, any>,
    res: Response,
): void {
    const output = sanitizeResponse(
        responseSchema,
        { success: false, error: error.message }
    );
    res.status(error.statusCode).json(output);
}

/**
 * Handles generic unexpected errors (500).
 * 
 * For any error that doesn't fit the above categories.
 * 
 * @param error - Unknown error
 * @param responseSchema - Contract response schema for sanitization
 * @param res - Express response object
 */
function handleGenericError(
    error: unknown,
    responseSchema: ContractResponseSchema<any, any>,
    res: Response,
): void {
    // Log error for debugging (after ensuring it's not a Zod error)
    console.error("Error in handler:", formatErrorForLog(error));

    // Return generic 500 error
    const output = sanitizeResponse(
        responseSchema,
        { success: false, error: "Internal Server Error" }
    );
    res.status(500).json(output);
}

// ============================================================================
// SECTION 3: ERROR HANDLER - Main Error Orchestration
// ============================================================================
// Central error dispatcher that categorizes and handles all error types.

/**
 * Main error handler that categorizes errors and sends appropriate responses.
 * 
 * Implements error routing logic:
 * 1. Check if Zod error (input or output validation)
 * 2. Check if HttpError (custom HTTP error)
 * 3. Fallback to generic error (500)
 * 
 * All responses are sanitized against the contract response schema.
 * 
 * ## Usage in createHandler
 * 
 * ```typescript
 * try {
 *   // validation, execution, response building
 * } catch (error) {
 *   handleError(error, contract.response, res);
 * }
 * ```
 * 
 * @param error - The caught error (any type)
 * @param responseSchema - Contract response schema for building sanitized responses
 * @param res - Express response object to send error response
 */
export function handleError(
    error: unknown,
    responseSchema: ContractResponseSchema<any, any>,
    res: Response,
): void {
    // CATEGORY 1: Zod validation errors (input validation 400 or output validation 500)
    if (isZodError(error)) {
        handleZodError(error, responseSchema, res);
        return;
    }

    // CATEGORY 2: HttpError exceptions (custom status code + message)
    if (error instanceof createHttpError.HttpError) {
        handleHttpError(error, responseSchema, res);
        return;
    }

    // CATEGORY 3: Generic unexpected errors (500)
    handleGenericError(error, responseSchema, res);
}
