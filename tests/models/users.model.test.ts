import { UserModel } from '../../src/models/users.model';
import { mockPrisma, mockPrismaUser } from '../setup';

describe('UserModel', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createUser', () => {
        it('should create a user successfully', async () => {
            const email = 'test@example.com';
            const name = 'Test User';
            const createdUser = {
                email,
                name,
            };

            mockPrismaUser.create.mockResolvedValue(createdUser);

            const result = await UserModel.createUser(email, name);

            expect(mockPrismaUser.create).toHaveBeenCalledWith({
                data: {
                    email,
                    name,
                },
            });
            expect(mockPrismaUser.create).toHaveBeenCalledTimes(1);
            expect(result).toEqual(createdUser);
        });

        it('should return undefined when user already exists (P2002 error)', async () => {
            const email = 'test@example.com';
            const name = 'Test User';
            const error = { code: 'P2002' };

            mockPrismaUser.create.mockRejectedValue(error);

            const result = await UserModel.createUser(email, name);

            expect(mockPrismaUser.create).toHaveBeenCalledWith({
                data: {
                    email,
                    name,
                },
            });
            expect(result).toBeUndefined();
        });

        it('should throw error when prisma create fails with other errors', async () => {
            const email = 'test@example.com';
            const name = 'Test User';
            const error = new Error('Database error');

            mockPrismaUser.create.mockRejectedValue(error);

            await expect(UserModel.createUser(email, name)).rejects.toThrow('Database error');
            expect(mockPrismaUser.create).toHaveBeenCalledWith({
                data: {
                    email,
                    name,
                },
            });
        });
    });

    describe('getAllUsers', () => {
        it('should get all users with pagination', async () => {
            const page = 1;
            const limit = 10;
            const mockUsers = [
                { email: 'user1@example.com', name: 'User 1' },
                { email: 'user2@example.com', name: 'User 2' },
            ];

            mockPrismaUser.findMany.mockResolvedValue(mockUsers);

            const result = await UserModel.getAllUsers(page, limit);

            expect(mockPrismaUser.findMany).toHaveBeenCalledWith({
                skip: 0,
                take: 10,
            });
            expect(result).toEqual(mockUsers);
        });

        it('should handle undefined pagination parameters', async () => {
            const mockUsers = [
                { email: 'user1@example.com', name: 'User 1' },
            ];

            mockPrismaUser.findMany.mockResolvedValue(mockUsers);

            const result = await UserModel.getAllUsers(0, 0);

            expect(mockPrismaUser.findMany).toHaveBeenCalledWith({
                skip: undefined,
                take: undefined,
            });
            expect(result).toEqual(mockUsers);
        });

        it('should calculate correct skip value for page 2', async () => {
            const page = 2;
            const limit = 5;
            const mockUsers: [] = [];

            mockPrismaUser.findMany.mockResolvedValue(mockUsers);

            await UserModel.getAllUsers(page, limit);

            expect(mockPrismaUser.findMany).toHaveBeenCalledWith({
                skip: 5, // (page - 1) * limit = (2 - 1) * 5 = 5
                take: 5,
            });
        });
    });

    describe('getUser', () => {
        it('should get user by email successfully', async () => {
            const email = 'test@example.com';
            const mockUser = {
                email,
                name: 'Test User',
            };

            mockPrismaUser.findUnique.mockResolvedValue(mockUser);

            const result = await UserModel.getUser(email);

            expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
                where: { email },
            });
            expect(result).toEqual(mockUser);
        });

        it('should return null when user not found', async () => {
            const email = 'nonexistent@example.com';

            mockPrismaUser.findUnique.mockResolvedValue(null);

            const result = await UserModel.getUser(email);

            expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
                where: { email },
            });
            expect(result).toBeNull();
        });
    });

    describe('getUserWithActiveBorrows', () => {
        it('should get user with active borrows successfully', async () => {
            const email = 'test@example.com';
            const mockUserWithBorrows = {
                email,
                name: 'Test User',
                Borrow: [
                    {
                        book: { title: 'Test Book' },
                        due_date: new Date('2025-10-01'),
                    },
                ],
            };

            mockPrismaUser.findUnique.mockResolvedValue(mockUserWithBorrows);

            const result = await UserModel.getUserWithActiveBorrows(email);

            expect(mockPrismaUser.findUnique).toHaveBeenCalledWith({
                where: { email },
                include: {
                    Borrow: {
                        select: {
                            book: {
                                select: {
                                    title: true,
                                }
                            },
                            due_date: true,
                        },
                        where: {
                            return_date: null
                        }
                    }
                }
            });
            expect(result).toEqual(mockUserWithBorrows);
        });

        it('should return null when user not found', async () => {
            const email = 'nonexistent@example.com';

            mockPrismaUser.findUnique.mockResolvedValue(null);

            const result = await UserModel.getUserWithActiveBorrows(email);

            expect(result).toBeNull();
        });

        it('should return undefined when user not found (P2025 error)', async () => {
            const email = 'test@example.com';
            const error = { code: 'P2025' };

            mockPrismaUser.findUnique.mockRejectedValue(error);

            const result = await UserModel.getUserWithActiveBorrows(email);

            expect(result).toBeUndefined();
        });

        it('should throw error when prisma fails with other errors', async () => {
            const email = 'test@example.com';
            const error = new Error('Database error');

            mockPrismaUser.findUnique.mockRejectedValue(error);

            await expect(UserModel.getUserWithActiveBorrows(email)).rejects.toThrow('Database error');
        });
    });

    describe('updateUser', () => {
        it('should update user successfully', async () => {
            const email = 'test@example.com';
            const name = 'Updated Name';
            const updatedUser = {
                email,
                name,
            };

            mockPrismaUser.update.mockResolvedValue(updatedUser);

            const result = await UserModel.updateUser(email, name);

            expect(mockPrismaUser.update).toHaveBeenCalledWith({
                where: { email },
                data: { name },
            });
            expect(result).toEqual(updatedUser);
        });

        it('should return undefined when user not found (P2025 error)', async () => {
            const email = 'nonexistent@example.com';
            const name = 'Updated Name';
            const error = { code: 'P2025' };

            mockPrismaUser.update.mockRejectedValue(error);

            const result = await UserModel.updateUser(email, name);

            expect(result).toBeUndefined();
        });

        it('should throw error when prisma update fails with other errors', async () => {
            const email = 'test@example.com';
            const name = 'Updated Name';
            const error = new Error('Database error');

            mockPrismaUser.update.mockRejectedValue(error);

            await expect(UserModel.updateUser(email, name)).rejects.toThrow('Database error');
        });
    });

    describe('deleteUser', () => {
        it('should delete user successfully', async () => {
            const email = 'test@example.com';
            const deletedUser = { email, name: 'Test User' };

            mockPrismaUser.delete.mockResolvedValue(deletedUser);

            const result = await UserModel.deleteUser(email);

            expect(mockPrismaUser.delete).toHaveBeenCalledWith({
                where: { email },
            });
            expect(mockPrismaUser.delete).toHaveBeenCalledTimes(1);
            expect(result).toEqual(deletedUser);
        });

        it('should return undefined when user not found (P2025 error)', async () => {
            const email = 'nonexistent@example.com';
            const error = { code: 'P2025' };

            mockPrismaUser.delete.mockRejectedValue(error);

            const result = await UserModel.deleteUser(email);

            expect(result).toBeUndefined();
        });

        it('should throw error when prisma delete fails with other errors', async () => {
            const email = 'test@example.com';
            const error = new Error('Database error');

            mockPrismaUser.delete.mockRejectedValue(error);

            await expect(UserModel.deleteUser(email)).rejects.toThrow('Database error');
        });
    });
});