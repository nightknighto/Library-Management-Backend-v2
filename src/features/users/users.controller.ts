import * as UserDTOs from './users.schemas.ts';
import { UserRepository } from './users.repository.ts';
import { JwtUtils } from '../../utils/jwt.util.ts';
import type { ValidatedRequest } from '../../shared/middlewares/validators.middleware.ts';
import type { ControllerResponse, PaginatedControllerResponse } from '../../shared/schemas/controller-responses.schema.ts';
import { createHandler } from '../../core/create-handler.core.ts';
import createHttpError from 'http-errors';
import { authenticateJwt } from '../auth-stuff.ts';

// const registerUser = createHandler(UserDTOs., handler)

const registerUser = createHandler(UserDTOs.RegisterUserContract, async (req) => {
    const { email, name } = req.body;
    const user = await UserRepository.createUser(email, name);
    if (!user) {
        throw new createHttpError.BadRequest('User with this email already exists')
    }

    const token = JwtUtils.createToken({ email });

    return {
        statusCode: 201,
        data: { token }
    }
})

const loginUser = createHandler(UserDTOs.LoginUserContract, async (req) => {
    const { email } = req.body;
    const user = await UserRepository.getUser(email);
    if (!user) {
        throw new createHttpError.NotFound('User not found')
    }
    const token = JwtUtils.createToken({ email });
    return {
        data: { token }
    }
})

const getAllUsers = createHandler(UserDTOs.GetAllUsersContract, async (req) => {
    const { page, limit } = req.query;
    const users = await UserRepository.getAllUsers(
        page,
        limit
    );
    const totalCount = await UserRepository.getUserCount();

    return {
        data: users,
        pagination: {
            totalCount,
            page,
            limit,
        }
    }
})

const updateUser = createHandler(UserDTOs.UpdateUserContract,
    async (req, auth) => {
        const email = auth.email;
        const { name } = req.body;
        const updatedUser = await UserRepository.updateUser(email, name);
        if (!updatedUser) {
            throw new createHttpError.NotFound('User not found');
        }
        return {
            data: updatedUser,
        };
    },
    {
        access: 'protected',
        security: {
            authenticate: authenticateJwt,
        },
    }
)


const deleteUser = createHandler(UserDTOs.DeleteUserContract, async (req) => {
    const { email } = req.params;
    const user = await UserRepository.deleteUser(email);
    if (!user) {
        throw new createHttpError.NotFound('User not found');
    }
    return {
        data: 'User deleted successfully',
    };
})

const getUserBorrows = createHandler(UserDTOs.GetUserBorrowsContract,
    async (req, auth) => {
        const email = auth.email;
        const userWithBorrows = await UserRepository.getUserWithActiveBorrows(email);
        if (!userWithBorrows) {
            throw new createHttpError.NotFound('User not found');
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

        return {
            data: response,
        };
    },
    {
        access: 'protected',
        security: {
            authenticate: authenticateJwt,
        },
    }
)

export const UserController = {
    registerUser,
    loginUser,
    getAllUsers,
    updateUser,
    deleteUser,
    getUserBorrows
};