import { z } from 'zod';
import { createRequestSchema } from '../../shared/schemas/create-request-schema.ts';

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

export const RegisterUserRequestSchema = createRequestSchema({
    body: {
        email: emailInputSchema,
        name: nameInputSchema
    }
});

export const RegisterUserResponseSchema = z.object({
    token: z.string()
})

export const LoginUserRequestSchema = createRequestSchema({
    body: {
        email: emailInputSchema
    }
});

export const LoginUserResponseSchema = z.object({
    token: z.string()
})

export const UpdateUserRequestSchema = createRequestSchema({
    body: {
        name: nameInputSchema
    }
});

export const UpdateUserResponseSchema = z.object({
    email: z.string(),
    name: z.string(),
    registered_at: z.date()
})

export const GetAllUsersRequestSchema = createRequestSchema({
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
});

export const GetAllUsersResponseSchema = z.object({
    email: z.string(),
    name: z.string(),
    registered_at: z.date(),
}).array()

export const DeleteUserRequestSchema = createRequestSchema({
    params: {
        email: emailInputSchema
    }
})

export const DeleteUserResponseSchema = z.object({
    message: z.string()
})

export const GetUserBorrowsRequestSchema = createRequestSchema({});

export const GetUserBorrowsResponseSchema = z.object({
    email: z.string(),
    name: z.string(),
    activeBorrows: z.array(z.object({
        bookTitle: z.string(),
        due_date: z.date(),
        status: z.enum(['On Time', 'Overdue'])
    }))
})

// Type exports for use in controllers
export type RegisterUserRequest = z.infer<typeof RegisterUserRequestSchema>;
export type RegisterUserResponse = z.infer<typeof RegisterUserResponseSchema>;

export type LoginUserRequest = z.infer<typeof LoginUserRequestSchema>;
export type LoginUserResponse = z.infer<typeof LoginUserResponseSchema>;

export type UpdateUserRequest = z.infer<typeof UpdateUserRequestSchema>;
export type UpdateUserResponse = z.infer<typeof UpdateUserResponseSchema>;

export type GetAllUsersRequest = z.infer<typeof GetAllUsersRequestSchema>;
export type GetAllUsersResponse = z.infer<typeof GetAllUsersResponseSchema>;

export type DeleteUserRequest = z.infer<typeof DeleteUserRequestSchema>;
export type DeleteUserResponse = z.infer<typeof DeleteUserResponseSchema>;

export type GetUserBorrowsRequest = z.infer<typeof GetUserBorrowsRequestSchema>;
export type GetUserBorrowsResponse = z.infer<typeof GetUserBorrowsResponseSchema>;
