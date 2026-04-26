import { z } from 'zod';
import { createContract } from '../../core/create-contract.core.ts';

const isbnSchema = z.string()

// Title validation
const titleSchema = z.string()

// Author validation
const authorSchema = z.string()

// Shelf validation - format like A1, B2, C10, etc.
const shelfSchema = z.string()

// Total quantity validation
const totalQuantitySchema = z.int("Total quantity must be a whole number")
    .min(1, "Total quantity must be at least 1")
    .max(1000, "Total quantity cannot exceed 1000");

const bookOutputSchema = z.object({
    isbn: z.string(),
    title: z.string(),
    author: z.string(),
    shelf: z.string(),
    total_quantity: z.number(),
    // created_at: z.date()
})

export const CreateBookContract = createContract({
    request: {
        body: {
            isbn: isbnSchema,
            title: titleSchema,
            shelf: shelfSchema,
            total_quantity: totalQuantitySchema
        },
    },
    response: z.string(),
})

export const UpdateBookContract = createContract({
    request: {
        body: {
            title: titleSchema.optional(),
            shelf: shelfSchema.optional(),
            total_quantity: totalQuantitySchema.optional()
        },
        params: {
            isbn: isbnSchema
        }
    },
    response: bookOutputSchema
})

export const ListBooksContract = createContract({
    request: {
        query: {
            title: titleSchema.optional(),
            author: authorSchema.optional(),
            isbn: isbnSchema.optional(),
            page: z.coerce.number()
                .refine(val => val > 0, "Page must be a positive number")
                .prefault(1),
            limit: z.coerce.number()
                .refine(val => val > 0 && val <= 100, "Limit must be between 1 and 100")
                .prefault(10),
        }
    },
    response: z.array(bookOutputSchema),
    paginated: true,
})

export const GetBookContract = createContract({
    request: {
        query: {
            fields: z.string().optional()
                .transform(val => val ? val.split(',') : [])
                .pipe(z.array(z.enum(['title', 'author', 'isbn', 'shelf', 'total_quantity'])))
        },
        params: {
            isbn: isbnSchema
        }
    },
    response: bookOutputSchema.partial(),
})

export const DeleteBookContract = createContract({
    request: {
        params: {
            isbn: isbnSchema
        }
    },
    response: z.void()
})

// Type exports for use in frontend
export type CreateBookRequest = z.infer<typeof CreateBookContract['request']>;
export type UpdateBookRequest = z.infer<typeof UpdateBookContract['request']>;
export type ListBooksRequest = z.infer<typeof ListBooksContract['request']>;
export type GetBookRequest = z.infer<typeof GetBookContract['request']>;
export type DeleteBookRequest = z.infer<typeof DeleteBookContract['request']>;

export type CreateBookResponse = z.infer<typeof CreateBookContract['response']>;
export type UpdateBookResponse = z.infer<typeof UpdateBookContract['response']>;
export type ListBooksResponse = z.infer<typeof ListBooksContract['response']>;
export type GetBookResponse = z.infer<typeof GetBookContract['response']>;
export type DeleteBookResponse = z.infer<typeof DeleteBookContract['response']>;