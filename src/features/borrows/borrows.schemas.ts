import { z } from 'zod';
import { createContract } from '../../core/create-contract.core.ts';

const isbnSchema = z.string()

export const BorrowBookContract = createContract({
    request: {
        params: {
            isbn: isbnSchema
        }
    },
    response: z.string()
})

export const ReturnBookContract = createContract({
    request: {
        params: {
            isbn: isbnSchema
        }
    },
    response: z.string()
})

export const OverdueBooksContract = createContract({
    request: {
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
    },
    response: z.object({
        userEmail: z.string().email(),
        bookTitle: z.string().max(255),
        dueDate: z.date(),
        bookIsbn: z.string(),
    }).array(),
    paginated: true,
})
