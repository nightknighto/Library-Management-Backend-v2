import { z } from 'zod';

const isbnSchema = z.string()

// Title validation
const titleSchema = z.string()

// Author validation
const authorSchema = z.string()

// Shelf validation - format like A1, B2, C10, etc.
const shelfSchema = z.string()

// Total quantity validation
const totalQuantitySchema = z.number()
    .int("Total quantity must be a whole number")
    .min(1, "Total quantity must be at least 1")
    .max(1000, "Total quantity cannot exceed 1000");

export const CreateBookSchema = z.object({
    isbn: isbnSchema,
    title: titleSchema,
    author: authorSchema,
    shelf: shelfSchema,
    total_quantity: totalQuantitySchema
}).strict();

export const UpdateBookSchema = CreateBookSchema.omit({ isbn: true });

/**
 * Schema for book search query parameters
 */
export const BookSearchQuerySchema = z.object({
    title: z.string().optional(),
    author: z.string().optional(),
    isbn: z.string().optional(),
    page: z.string()
        .optional()
        .transform(val => val ? parseInt(val) : 1)
        .refine(val => val > 0, "Page must be a positive number"),
    limit: z.string()
        .optional()
        .transform(val => val ? parseInt(val) : 10)
        .refine(val => val > 0 && val <= 100, "Limit must be between 1 and 100")
});

/**
 * Schema for ISBN parameter validation
 */
export const BookParamsSchema = z.object({
    isbn: isbnSchema
});

// Type exports for use in controllers
export type CreateBookRequest = z.infer<typeof CreateBookSchema>;
export type UpdateBookRequest = z.infer<typeof UpdateBookSchema>;
export type BookSearchQuery = z.infer<typeof BookSearchQuerySchema>;
export type BookParams = z.infer<typeof BookParamsSchema>;
