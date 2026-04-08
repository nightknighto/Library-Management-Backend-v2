import { z } from 'zod';
import { createRequestSchema } from '../../shared/schemas/create-request-schema.ts';


const isbnSchema = z.string()

export const BorrowBookRequestSchema = createRequestSchema({
    params: {
        isbn: isbnSchema
    }
})

export const BorrowBookResponseSchema = z.object({
    message: z.string()
})

export const ReturnBookRequestSchema = createRequestSchema({
    params: {
        isbn: isbnSchema
    }
})

export const ReturnBookResponseSchema = z.object({
    message: z.string()
})

export const OverdueBooksRequestSchema = createRequestSchema({
    query: {
        page: z.string()
            .optional()
            .transform(val => val ? parseInt(val) : 1)
            .refine(val => val > 0, "Page must be a positive number"),
        limit: z.string()
            .optional()
            .transform(val => val ? parseInt(val) : 10)
            .refine(val => val > 0 && val <= 100, "Limit must be between 1 and 100")
    }
})

export const OverdueBooksResponseSchema = z.object({
    userEmail: z.string().email(),
    bookTitle: z.string().max(255),
    dueDate: z.date(),
    bookIsbn: z.string(),
}).array()

// Type exports for use in controllers
export type BorrowBookRequest = z.infer<typeof BorrowBookRequestSchema>;
export type BorrowBookResponse = z.infer<typeof BorrowBookResponseSchema>;
export type ReturnBookRequest = z.infer<typeof ReturnBookRequestSchema>;
export type ReturnBookResponse = z.infer<typeof ReturnBookResponseSchema>;
export type OverdueBooksRequest = z.infer<typeof OverdueBooksRequestSchema>;
export type OverdueBooksResponse = z.infer<typeof OverdueBooksResponseSchema>;
