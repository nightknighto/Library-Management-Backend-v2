import { UserController } from '../../src/controllers/users.controller';
import { UserModel } from '../../src/models/users.model';
import { JwtService } from '../../src/services';
import { createMockRequest, createMockResponse, mockUserData, mockErrorMessages } from '../utils';

// Mock the dependencies
jest.mock('../../src/models/users.model');
jest.mock('../../src/services');

const mockUserModel = UserModel as jest.Mocked<typeof UserModel>;
const mockJwtService = JwtService as jest.Mocked<typeof JwtService>;

describe('UserController', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('registerUser', () => {
        it('should register user successfully', async () => {
            const req = createMockRequest({
                body: {
                    email: 'test@example.com',
                    name: 'Test User',
                },
            });
            const res = createMockResponse();
            const createdUser = {
                email: 'test@example.com',
                name: 'Test User',
                registered_at: new Date(),
            };

            mockUserModel.createUser.mockResolvedValue(createdUser);

            await UserController.registerUser(req as any, res as any);

            expect(mockUserModel.createUser).toHaveBeenCalledWith('test@example.com', 'Test User');
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith({ message: 'User registered successfully' });
        });

        it('should handle user already exists', async () => {
            const req = createMockRequest({
                body: {
                    email: 'test@example.com',
                    name: 'Test User',
                },
            });
            const res = createMockResponse();

            mockUserModel.createUser.mockResolvedValue(undefined);

            await UserController.registerUser(req as any, res as any);

            expect(mockUserModel.createUser).toHaveBeenCalledWith('test@example.com', 'Test User');
            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.json).toHaveBeenCalledWith({ error: 'User with this email already exists' });
        });
    });

    describe('loginUser', () => {
        it('should login user successfully', async () => {
            const req = createMockRequest({
                body: {
                    email: 'test@example.com',
                },
            });
            const res = createMockResponse();
            const mockToken = 'mock-jwt-token';

            mockUserModel.getUser.mockResolvedValue(mockUserData.validUser);
            mockJwtService.createToken.mockReturnValue(mockToken);

            await UserController.loginUser(req as any, res as any);

            expect(mockUserModel.getUser).toHaveBeenCalledWith('test@example.com');
            expect(mockJwtService.createToken).toHaveBeenCalledWith({ email: 'test@example.com' });
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ token: mockToken });
        });

        it('should handle user not found', async () => {
            const req = createMockRequest({
                body: {
                    email: 'nonexistent@example.com',
                },
            });
            const res = createMockResponse();

            mockUserModel.getUser.mockResolvedValue(null);

            await UserController.loginUser(req as any, res as any);

            expect(mockUserModel.getUser).toHaveBeenCalledWith('nonexistent@example.com');
            expect(mockJwtService.createToken).not.toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ error: mockErrorMessages.userNotFound });
        });
    });

    describe('getAllUsers', () => {
        it('should get all users with default pagination', async () => {
            const req = createMockRequest({
                query: {},
            });
            const res = createMockResponse();
            const mockUsers = [mockUserData.validUser];

            mockUserModel.getAllUsers.mockResolvedValue(mockUsers);

            await UserController.getAllUsers(req as any, res as any);

            expect(mockUserModel.getAllUsers).toHaveBeenCalledWith(1, 10);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockUsers);
        });

        it('should get all users with custom pagination', async () => {
            const req = createMockRequest({
                query: {
                    page: '2',
                    limit: '5',
                },
            });
            const res = createMockResponse();
            const mockUsers = [mockUserData.validUser];

            mockUserModel.getAllUsers.mockResolvedValue(mockUsers);

            await UserController.getAllUsers(req as any, res as any);

            expect(mockUserModel.getAllUsers).toHaveBeenCalledWith(2, 5);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockUsers);
        });

        it('should limit maximum page size to 100', async () => {
            const req = createMockRequest({
                query: {
                    page: '1',
                    limit: '150',
                },
            });
            const res = createMockResponse();
            const mockUsers = [mockUserData.validUser];

            mockUserModel.getAllUsers.mockResolvedValue(mockUsers);

            await UserController.getAllUsers(req as any, res as any);

            expect(mockUserModel.getAllUsers).toHaveBeenCalledWith(1, 100);
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockUsers);
        });
    });

    describe('updateUser', () => {
        it('should update user successfully', async () => {
            const req = createMockRequest({
                user: { email: 'test@example.com' },
                body: {
                    name: 'Updated Name',
                },
            });
            const res = createMockResponse();

            mockUserModel.updateUser.mockResolvedValue(mockUserData.updatedUser);

            await UserController.updateUser(req as any, res as any);

            expect(mockUserModel.updateUser).toHaveBeenCalledWith('test@example.com', 'Updated Name');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(mockUserData.updatedUser);
        });

        it('should handle update user error', async () => {
            const req = createMockRequest({
                user: { email: 'test@example.com' },
                body: {
                    name: 'Updated Name',
                },
            });
            const res = createMockResponse();

            mockUserModel.updateUser.mockResolvedValue(undefined);

            await UserController.updateUser(req as any, res as any);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
        });
    });

    describe('deleteUser', () => {
        it('should delete user successfully', async () => {
            const req = createMockRequest({
                params: {
                    email: 'test@example.com',
                },
            });
            const res = createMockResponse();
            const deletedUser = {
                email: 'test@example.com',
                name: 'Test User',
                registered_at: new Date(),
            };

            mockUserModel.deleteUser.mockResolvedValue(deletedUser);

            await UserController.deleteUser(req as any, res as any);

            expect(mockUserModel.deleteUser).toHaveBeenCalledWith('test@example.com');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({ message: 'User deleted successfully' });
        });

        it('should handle delete user error', async () => {
            const req = createMockRequest({
                params: {
                    email: 'test@example.com',
                },
            });
            const res = createMockResponse();

            mockUserModel.deleteUser.mockResolvedValue(undefined);

            await UserController.deleteUser(req as any, res as any);

            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ error: 'User not found' });
        });
    });

    describe('getUserBorrows', () => {
        it('should get user borrows successfully', async () => {
            const req = createMockRequest({
                user: { email: 'test@example.com' },
            });
            const res = createMockResponse();

            mockUserModel.getUserWithActiveBorrows.mockResolvedValue(mockUserData.userWithBorrows);

            await UserController.getUserBorrows(req as any, res as any);

            expect(mockUserModel.getUserWithActiveBorrows).toHaveBeenCalledWith('test@example.com');
            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                email: 'test@example.com',
                name: 'Test User',
                activeBorrows: [
                    {
                        bookTitle: 'Test Book 1',
                        due_date: new Date('2025-10-01'),
                        status: 'On Time',
                    },
                    {
                        bookTitle: 'Test Book 2',
                        due_date: new Date('2025-08-01'),
                        status: 'Overdue',
                    },
                ],
            });
        });

        it('should handle user not found for borrows', async () => {
            const req = createMockRequest({
                user: { email: 'test@example.com' },
            });
            const res = createMockResponse();

            mockUserModel.getUserWithActiveBorrows.mockResolvedValue(null);

            await UserController.getUserBorrows(req as any, res as any);

            expect(mockUserModel.getUserWithActiveBorrows).toHaveBeenCalledWith('test@example.com');
            expect(res.status).toHaveBeenCalledWith(404);
            expect(res.json).toHaveBeenCalledWith({ error: mockErrorMessages.userNotFound });
        });

        it('should correctly identify overdue vs on-time books', async () => {
            const now = new Date('2025-09-14'); // Current date from context
            const req = createMockRequest({
                user: { email: 'test@example.com' },
            });
            const res = createMockResponse();

            const userWithMixedBorrows = {
                email: 'test@example.com',
                name: 'Test User',
                registered_at: new Date(),
                Borrow: [
                    {
                        book: { title: 'Future Due Book' },
                        due_date: new Date('2025-12-01'), // Future date - On Time
                    },
                    {
                        book: { title: 'Past Due Book' },
                        due_date: new Date('2025-08-01'), // Past date - Overdue
                    },
                ],
            };

            mockUserModel.getUserWithActiveBorrows.mockResolvedValue(userWithMixedBorrows);

            // Mock Date constructor to control "now"
            const originalDate = global.Date;
            global.Date = class extends originalDate {
                constructor(...args: any[]) {
                    if (args.length === 0) {
                        super('2025-09-14T00:00:00.000Z');
                    } else {
                        super(...(args as [any]));
                    }
                }
            } as any;

            await UserController.getUserBorrows(req as any, res as any);

            // Restore original Date
            global.Date = originalDate;

            expect(res.status).toHaveBeenCalledWith(200);
            const responseCall = res.json.mock.calls[0][0];
            expect(responseCall.activeBorrows).toEqual([
                {
                    bookTitle: 'Future Due Book',
                    due_date: new Date('2025-12-01'),
                    status: 'On Time',
                },
                {
                    bookTitle: 'Past Due Book',
                    due_date: new Date('2025-08-01'),
                    status: 'Overdue',
                },
            ]);
        });
    });
});