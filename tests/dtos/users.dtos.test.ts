import { UserDTOs } from '../../src/dtos/users.dtos';

describe('UserDTOs', () => {
    describe('RegisterUserSchema', () => {
        it('should validate valid registration data', () => {
            const validData = {
                email: 'test@example.com',
                name: 'John Doe',
            };

            const result = UserDTOs.RegisterUserSchema.safeParse(validData);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({
                    email: 'test@example.com',
                    name: 'John Doe',
                });
            }
        });

        it('should trim and lowercase email', () => {
            const dataWithSpaces = {
                email: '  TEST@EXAMPLE.COM  ',
                name: 'John Doe',
            };

            const result = UserDTOs.RegisterUserSchema.safeParse(dataWithSpaces);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.email).toBe('test@example.com');
            }
        });

        it('should reject invalid email format', () => {
            const invalidData = {
                email: 'invalid-email',
                name: 'John Doe',
            };

            const result = UserDTOs.RegisterUserSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe('Invalid email format');
            }
        });

        it('should reject empty email', () => {
            const invalidData = {
                email: '',
                name: 'John Doe',
            };

            const result = UserDTOs.RegisterUserSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe('Email is required');
            }
        });

        it('should reject email longer than 255 characters', () => {
            const longEmail = 'a'.repeat(250) + '@example.com'; // 263 characters
            const invalidData = {
                email: longEmail,
                name: 'John Doe',
            };

            const result = UserDTOs.RegisterUserSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe('Email must be less than 255 characters');
            }
        });

        it('should reject missing name', () => {
            const invalidData = {
                email: 'test@example.com',
            };

            const result = UserDTOs.RegisterUserSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.code).toBe('invalid_type');
            }
        });

        it('should reject extra fields due to strict mode', () => {
            const invalidData = {
                email: 'test@example.com',
                name: 'John Doe',
                extraField: 'should not be allowed',
            };

            const result = UserDTOs.RegisterUserSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.code).toBe('unrecognized_keys');
            }
        });
    });

    describe('LoginUserSchema', () => {
        it('should validate valid login data', () => {
            const validData = {
                email: 'test@example.com',
            };

            const result = UserDTOs.LoginUserSchema.safeParse(validData);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({
                    email: 'test@example.com',
                });
            }
        });

        it('should trim and lowercase email', () => {
            const dataWithSpaces = {
                email: '  TEST@EXAMPLE.COM  ',
            };

            const result = UserDTOs.LoginUserSchema.safeParse(dataWithSpaces);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.email).toBe('test@example.com');
            }
        });

        it('should reject invalid email format', () => {
            const invalidData = {
                email: 'invalid-email',
            };

            const result = UserDTOs.LoginUserSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe('Invalid email format');
            }
        });

        it('should reject extra fields due to strict mode', () => {
            const invalidData = {
                email: 'test@example.com',
                password: 'should not be needed for login',
            };

            const result = UserDTOs.LoginUserSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.code).toBe('unrecognized_keys');
            }
        });
    });

    describe('UpdateUserSchema', () => {
        it('should validate valid update data', () => {
            const validData = {
                name: 'Updated Name',
            };

            const result = UserDTOs.UpdateUserSchema.safeParse(validData);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({
                    name: 'Updated Name',
                });
            }
        });

        it('should reject extra fields due to strict mode', () => {
            const invalidData = {
                name: 'Updated Name',
                email: 'should not be updatable',
            };

            const result = UserDTOs.UpdateUserSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.code).toBe('unrecognized_keys');
            }
        });
    });

    describe('UserPaginationQuerySchema', () => {
        it('should validate with default values', () => {
            const validData = {};

            const result = UserDTOs.UserPaginationQuerySchema.safeParse(validData);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({
                    page: 1,
                    limit: 10,
                });
            }
        });

        it('should validate with custom page and limit', () => {
            const validData = {
                page: '3',
                limit: '20',
            };

            const result = UserDTOs.UserPaginationQuerySchema.safeParse(validData);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({
                    page: 3,
                    limit: 20,
                });
            }
        });

        it('should reject negative page number', () => {
            const invalidData = {
                page: '-1',
            };

            const result = UserDTOs.UserPaginationQuerySchema.safeParse(invalidData);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe('Page must be a positive number');
            }
        });

        it('should reject zero page number', () => {
            const invalidData = {
                page: '0',
            };

            const result = UserDTOs.UserPaginationQuerySchema.safeParse(invalidData);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe('Page must be a positive number');
            }
        });

        it('should reject negative limit', () => {
            const invalidData = {
                limit: '-5',
            };

            const result = UserDTOs.UserPaginationQuerySchema.safeParse(invalidData);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe('Limit must be between 1 and 100');
            }
        });

        it('should reject zero limit', () => {
            const invalidData = {
                limit: '0',
            };

            const result = UserDTOs.UserPaginationQuerySchema.safeParse(invalidData);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe('Limit must be between 1 and 100');
            }
        });

        it('should reject limit greater than 100', () => {
            const invalidData = {
                limit: '101',
            };

            const result = UserDTOs.UserPaginationQuerySchema.safeParse(invalidData);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe('Limit must be between 1 and 100');
            }
        });

        it('should handle non-numeric strings gracefully', () => {
            const invalidData = {
                page: 'abc',
                limit: 'def',
            };

            const result = UserDTOs.UserPaginationQuerySchema.safeParse(invalidData);
            expect(result.success).toBe(false);
            // The transform will fail because parseInt('abc') returns NaN
        });
    });

    describe('UserParamsSchema', () => {
        it('should validate valid email parameter', () => {
            const validData = {
                email: 'test@example.com',
            };

            const result = UserDTOs.UserParamsSchema.safeParse(validData);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data).toEqual({
                    email: 'test@example.com',
                });
            }
        });

        it('should trim and lowercase email', () => {
            const dataWithSpaces = {
                email: '  TEST@EXAMPLE.COM  ',
            };

            const result = UserDTOs.UserParamsSchema.safeParse(dataWithSpaces);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.email).toBe('test@example.com');
            }
        });

        it('should reject invalid email format', () => {
            const invalidData = {
                email: 'invalid-email',
            };

            const result = UserDTOs.UserParamsSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe('Invalid email format');
            }
        });

        it('should reject empty email', () => {
            const invalidData = {
                email: '',
            };

            const result = UserDTOs.UserParamsSchema.safeParse(invalidData);
            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0]?.message).toBe('Email is required');
            }
        });
    });

    describe('Type exports', () => {
        it('should have correct TypeScript types', () => {
            // This test ensures the type exports are working correctly
            const registerRequest: UserDTOs.RegisterUserRequest = {
                email: 'test@example.com',
                name: 'Test User',
            };

            const loginRequest: UserDTOs.LoginUserRequest = {
                email: 'test@example.com',
            };

            const updateRequest: UserDTOs.UpdateUserRequest = {
                name: 'Updated Name',
            };

            const paginationQuery: UserDTOs.UserPaginationQuery = {
                page: 1,
                limit: 10,
            };

            const userParams: UserDTOs.UserParams = {
                email: 'test@example.com',
            };

            // If this compiles without errors, the types are correct
            expect(registerRequest).toBeDefined();
            expect(loginRequest).toBeDefined();
            expect(updateRequest).toBeDefined();
            expect(paginationQuery).toBeDefined();
            expect(userParams).toBeDefined();
        });
    });
});