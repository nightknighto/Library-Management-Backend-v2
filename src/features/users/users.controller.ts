import type * as UserDTOs from './users.dtos.ts';
import { UserRepository } from './users.repository.ts';
import { JwtUtils } from '../../utils/jwt.util.ts';
import type { ValidatedRequest } from '../../shared/middlewares/validators.middleware.ts';
import type { ControllerResponse, PaginatedControllerResponse } from '../../shared/schemas/controller-responses.schema.ts';

async function registerUser(req: ValidatedRequest<UserDTOs.RegisterUserRequest>, res: ControllerResponse<UserDTOs.RegisterUserResponse>) {
    const { email, name } = req.body;
    const user = await UserRepository.createUser(email, name);
    if (!user) {
        return res.status(400).json({
            success: false,
            error: 'User with this email already exists'
        });
    }
    const token = JwtUtils.createToken({ email });
    res.status(201).json({
        success: true,
        data: { token },
        meta: { timestamp: new Date().toISOString() }
    });
}

async function loginUser(req: ValidatedRequest<UserDTOs.LoginUserRequest>, res: ControllerResponse<UserDTOs.LoginUserResponse>) {
    const { email } = req.body;
    const user = await UserRepository.getUser(email);
    if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }
    const token = JwtUtils.createToken({ email });
    res.status(200).json({ success: true, data: { token }, meta: { timestamp: new Date().toISOString() } });
}

async function getAllUsers(req: ValidatedRequest<UserDTOs.GetAllUsersRequest>, res: PaginatedControllerResponse<UserDTOs.GetAllUsersResponse>) {
    const { page, limit } = req.query;
    const users = await UserRepository.getAllUsers(
        page,
        limit
    );
    const totalCount = await UserRepository.getUserCount();

    res.status(200).json({
        success: true,
        data: users,
        meta: {
            timestamp: new Date().toISOString(),
            pagination: {
                totalCount: totalCount,
                limit: limit,
                offset: (page - 1) * limit,
                hasNextPage: page * limit < totalCount
            }
        }
    });
}

async function updateUser(req: ValidatedRequest<UserDTOs.UpdateUserRequest>, res: ControllerResponse<UserDTOs.UpdateUserResponse>) {
    const { email } = req.user!;
    const { name } = req.body;
    const updatedUser = await UserRepository.updateUser(email, name);
    if (!updatedUser) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.status(200).json({
        success: true,
        data: updatedUser,
        meta: { timestamp: new Date().toISOString() }
    });
}

async function deleteUser(req: ValidatedRequest<UserDTOs.DeleteUserRequest>, res: ControllerResponse<UserDTOs.DeleteUserResponse>) {
    const { email } = req.params;
    const user = await UserRepository.deleteUser(email);
    if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }
    res.status(200).json({
        success: true,
        data: { message: 'User deleted successfully' },
        meta: { timestamp: new Date().toISOString() }
    });
}

async function getUserBorrows(req: ValidatedRequest<UserDTOs.GetUserBorrowsRequest>, res: ControllerResponse<UserDTOs.GetUserBorrowsResponse>) {
    const { email } = req.user!;
    const userWithBorrows = await UserRepository.getUserWithActiveBorrows(email);
    if (!userWithBorrows) {
        return res.status(404).json({ success: false, error: 'User not found' });
    }

    const now = new Date();
    const response = {
        email: userWithBorrows.email,
        name: userWithBorrows.name,
        activeBorrows: userWithBorrows.Borrow.map(borrow => ({
            bookTitle: borrow.book.title,
            due_date: borrow.due_date,
            status: borrow.due_date > now ? 'On Time' as const : 'Overdue' as const
        }))
    }

    res.status(200).json({
        success: true,
        data: response,
        meta: { timestamp: new Date().toISOString() }
    });
}

export const UserController = {
    registerUser,
    loginUser,
    getAllUsers,
    updateUser,
    deleteUser,
    getUserBorrows
};