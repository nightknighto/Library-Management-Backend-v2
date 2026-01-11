import { z } from 'zod';

/**
 * Validation schemas for User-related endpoints
 */
export namespace UserDTOs {

    // Email validation
    const emailSchema = z.string()
        .min(1, "Email is required")
        .trim()
        .toLowerCase()
        .email("Invalid email format")
        .max(255, "Email must be less than 255 characters");

    // Name validation
    const nameSchema = z.string()
        .min(1, "Name is required")
        .max(100, "Name must be less than 100 characters")
        .regex(/^[a-zA-Z\s'-]+$/, "Name can only contain letters, spaces, hyphens, and apostrophes")
        .trim();

    /**
     * Schema for user registration
     */
    export const RegisterUserSchema = z.object({
        email: emailSchema,
        name: nameSchema
    }).strict();

    /**
     * Schema for user login
     */
    export const LoginUserSchema = z.object({
        email: emailSchema
    }).strict();

    /**
     * Schema for updating user information
     */
    export const UpdateUserSchema = z.object({
        name: nameSchema
    }).strict();

    /**
     * Schema for user pagination query parameters
     */
    export const UserPaginationQuerySchema = z.object({
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
     * Schema for user email parameter validation
     */
    export const UserParamsSchema = z.object({
        email: emailSchema
    });

    // Type exports for use in controllers
    export type RegisterUserRequest = z.infer<typeof RegisterUserSchema>;
    export type LoginUserRequest = z.infer<typeof LoginUserSchema>;
    export type UpdateUserRequest = z.infer<typeof UpdateUserSchema>;
    export type UserPaginationQuery = z.infer<typeof UserPaginationQuerySchema>;
    export type UserParams = z.infer<typeof UserParamsSchema>;
}