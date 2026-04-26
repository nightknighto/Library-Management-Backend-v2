import { z } from 'zod';
import { createRequestSchema } from '../../shared/schemas/create-request-schema.ts';
import { createContract } from '../../core/create-contract.core.ts';

// Email validation
const emailInputSchema = z.email("Invalid email format")
    .min(1, "Email is required")
    .trim()
    .toLowerCase()
    .max(255, "Email must be less than 255 characters");

// Name validation
const nameInputSchema = z.string()
    .min(1, "Name is required")
    .max(100, "Name must be less than 100 characters")
    .regex(/^[a-zA-Z\s'-]+$/, "Name can only contain letters, spaces, hyphens, and apostrophes")
    .trim();

export const RegisterUserContract = createContract({
    request: {
        body: {
            email: emailInputSchema,
            name: nameInputSchema
        }
    },
    response: z.object({
        token: z.string()
    })
})

export const LoginUserContract = createContract({
    request: {
        body: {
            email: emailInputSchema
        }
    },
    response: z.object({
        token: z.string()
    })
})

export const UpdateUserContract = createContract({
    request: {
        body: {
            name: nameInputSchema
        }
    },
    response: z.object({
        email: z.string(),
        name: z.string(),
        registered_at: z.date()
    })
})

export const GetAllUsersContract = createContract({
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
        email: z.string(),
        name: z.string(),
        registered_at: z.date(),
    }).array(),
    paginated: true,
})

export const DeleteUserContract = createContract({
    request: {
        params: {
            email: emailInputSchema
        }
    },
    response: z.string()
})

export const GetUserBorrowsContract = createContract({
    request: {},
    response: z.object({
        email: z.string(),
        name: z.string(),
        activeBorrows: z.array(z.object({
            bookTitle: z.string(),
            due_date: z.date(),
            status: z.enum(['On Time', 'Overdue'])
        }))
    }),
})

// Type exports for use in controllers
export type RegisterUserRequest = z.infer<typeof RegisterUserContract.request>;
export type RegisterUserResponse = z.infer<typeof RegisterUserContract.response>;

export type LoginUserRequest = z.infer<typeof LoginUserContract.request>;
export type LoginUserResponse = z.infer<typeof LoginUserContract.response>;

export type UpdateUserRequest = z.infer<typeof UpdateUserContract.request>;
export type UpdateUserResponse = z.infer<typeof UpdateUserContract.response>;

export type GetAllUsersRequest = z.infer<typeof GetAllUsersContract.request>;
export type GetAllUsersResponse = z.infer<typeof GetAllUsersContract.response>;

export type DeleteUserRequest = z.infer<typeof DeleteUserContract.request>;
export type DeleteUserResponse = z.infer<typeof DeleteUserContract.response>;

export type GetUserBorrowsRequest = z.infer<typeof GetUserBorrowsContract.request>;
export type GetUserBorrowsResponse = z.infer<typeof GetUserBorrowsContract.response>;
