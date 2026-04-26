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
import z, { prettifyError, ZodError } from "zod";
import { createErrorMap, fromError } from "zod-validation-error";
import type { ErrorResponse } from "./types.core.ts";

// configure zod to use zod-validation-error's error map
// we use zod-validation-error's error map for better user-friendly messages
z.config({
    customError: createErrorMap(),
});

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
 * Handles Zod validation errors specifically for input validation.
 * 
 * Input validation error: client request didn't match contract
 * 
 * Return 400 with structured validation issues for client debugging
 * 
 * @param error - ZodError from validation
 * @param res - Express response object
 */
export function handleRequestValidationError(
    error: ZodError,
    res: Response,
): void {
    // Input validation error: client request didn't match contract
    // Return 400 with structured validation issues for client debugging
    // use zod-validation-error's fromError to get a more user-friendly error message
    const validationError = fromError(error)

    res.status(400).json({
        success: false,
        error: {
            message: "Request validation failed",
            issues: validationError.toString().replaceAll("\"", "'"),
        },
    } satisfies ErrorResponse);
}

/**
 * Handles Zod validation errors specifically for response/output validation.
 * 
 * Response validation error: handler returned data that doesn't match contract response schema.
 * This is an internal server error (500) since the client cannot fix handler bugs.
 * 
 * @param error - ZodError from response validation
 * @param res - Express response object
 */
export function handleResponseValidationError(
    error: ZodError,
    res: Response,
): void {
    // Output validation error: handler returned invalid data (internal server error)
    // use zod-validation-error's fromError to get a more user-friendly error message
    console.error("Output validation error:", fromError(error))

    res.status(500).json({ success: false, error: "Internal Server Error" } satisfies ErrorResponse);
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
    res: Response,
): void {
    res.status(error.statusCode).json(
        { success: false, error: error.message } satisfies ErrorResponse
    );
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
    res: Response,
): void {
    // Log error for debugging (after ensuring it's not a Zod error)
    console.error("Error in handler:", formatErrorForLog(error));

    res.status(500).json({ success: false, error: "Internal Server Error" } satisfies ErrorResponse);
}

// ============================================================================
// SECTION 3: ERROR HANDLER - Main Error Orchestration
// ============================================================================
// Central error dispatcher that categorizes and handles all error types.

/**
 * Main error handler that categorizes errors and sends appropriate responses.
 * 
 * Implements error routing logic:
 * 1. Check if HttpError (custom HTTP error)
 * 2. Fallback to generic error (500)
 * 
 * ## Usage in createHandler
 * 
 * ```typescript
 * try {
 *   // validation, execution, response building
 * } catch (error) {
 *   handleError(error, res);
 * }
 * ```
 * 
 * @param error - The caught error (any type)
 * @param res - Express response object to send error response
 */
export function handleError(
    error: unknown,
    res: Response,
): void {

    // HttpError exceptions (custom status code + message)
    if (error instanceof createHttpError.HttpError) {
        handleHttpError(error, res);
        return;
    }

    //Generic unexpected errors (500)
    handleGenericError(error, res);
}
