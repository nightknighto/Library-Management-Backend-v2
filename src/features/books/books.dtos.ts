import { z } from 'zod';
import { createRequestSchema } from '../../shared/schemas/create-request-schema.ts';

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

export const CreateBookRequestSchema = createRequestSchema({
    body: {
        isbn: isbnSchema,
        title: titleSchema,
        author: authorSchema,
        shelf: shelfSchema,
        total_quantity: totalQuantitySchema
    }
})

export const UpdateBookRequestSchema = createRequestSchema({
    body: {
        title: titleSchema.optional(),
        author: authorSchema.optional(),
        shelf: shelfSchema.optional(),
        total_quantity: totalQuantitySchema.optional()
    },
    params: {
        isbn: isbnSchema
    }
})

/**
 * Schema for book search query parameters
 */
export const ListBooksRequestSchema = createRequestSchema({
    query: {
        title: titleSchema.optional(),
        author: authorSchema.optional(),
        isbn: isbnSchema.optional(),
        page: z.coerce.number()
            .refine(val => val > 0, "Page must be a positive number")
            .default(1),
        limit: z.coerce.number()
            .refine(val => val > 0 && val <= 100, "Limit must be between 1 and 100")
            .default(10),
    }
})

export const GetBookRequestSchema = createRequestSchema({
    query: {
        fields: z.string().optional()
            .transform(val => val ? val.split(',') : [])
            .pipe(z.array(z.enum(['title', 'author', 'isbn', 'shelf', 'total_quantity'])))
    },
    params: {
        isbn: isbnSchema
    }
})

export const DeleteBookRequestSchema = createRequestSchema({
    params: {
        isbn: isbnSchema
    }
})

// Type exports for use in controllers
export type CreateBookRequest = z.infer<typeof CreateBookRequestSchema>;
export type UpdateBookRequest = z.infer<typeof UpdateBookRequestSchema>;
export type ListBooksRequest = z.infer<typeof ListBooksRequestSchema>;
export type GetBookRequest = z.infer<typeof GetBookRequestSchema>;
export type DeleteBookRequest = z.infer<typeof DeleteBookRequestSchema>;