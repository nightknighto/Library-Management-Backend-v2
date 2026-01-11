import { z } from 'zod';

/**
 * Validation schemas for Borrow-related endpoints
 */
export namespace BorrowDTOs {

    const isbnSchema = z.string()

    /**
     * Schema for borrow book parameters (ISBN in URL)
     */
    export const BorrowBookParamsSchema = z.object({
        isbn: isbnSchema
    });

    /**
     * Schema for return book parameters (ISBN in URL)
     */
    export const ReturnBookParamsSchema = z.object({
        isbn: isbnSchema
    });

    /**
     * Schema for overdue books query parameters
     */
    export const OverdueBooksQuerySchema = z.object({
        page: z.string()
            .optional()
            .transform(val => val ? parseInt(val) : 1)
            .refine(val => val > 0, "Page must be a positive number"),
        limit: z.string()
            .optional()
            .transform(val => val ? parseInt(val) : 10)
            .refine(val => val > 0 && val <= 100, "Limit must be between 1 and 100")
    });

    // Type exports for use in controllers
    export type BorrowBookParams = z.infer<typeof BorrowBookParamsSchema>;
    export type ReturnBookParams = z.infer<typeof ReturnBookParamsSchema>;
    export type OverdueBooksQuery = z.infer<typeof OverdueBooksQuerySchema>;
}