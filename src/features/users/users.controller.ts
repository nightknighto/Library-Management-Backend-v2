import * as UserDTOs from './users.schemas.ts';
import { UserRepository } from './users.repository.ts';
import { JwtUtils } from '../../utils/jwt.util.ts';
import { createHandler } from '../../core/index.ts';
import createHttpError from 'http-errors';
import { authenticateJwt } from '../../shared/auth-stuff.ts';

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
        data: { token },
        cookies: [
            {
                action: 'set',
                name: 'session',
                value: token,
                options: { httpOnly: true, sameSite: 'lax' },
            },
        ],
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
        data: { token },
        cookies: [
            {
                action: 'set',
                name: 'session',
                value: token,
                options: { httpOnly: true, sameSite: 'lax' },
            },
            {
                action: 'set',
                name: 'hi',
                value: '2'
            }
        ],
    }
})

const logout = createHandler(UserDTOs.LogoutUserContract, async (req) => {
    return {
        statusCode: 204,
        data: undefined,
        cookies: [
            {
                action: 'clear',
                name: 'session',
                options: { httpOnly: true, sameSite: 'lax' },
            }
        ]
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
    {
        access: 'protected',
        security: {
            authenticate: authenticateJwt,
        },
    },
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
)

const deleteUser = createHandler(UserDTOs.DeleteUserContract, async (req) => {
    const { email } = req.params;
    const user = await UserRepository.deleteUser(email);
    if (!user) {
        throw new createHttpError.NotFound('User not found');
    }
    return {
        data: 'User deleted successfully',
        cookies: [
            {
                action: 'clear',
                name: 'session',
                options: { sameSite: 'lax' },
            },
        ],
    };
})

const getUserBorrows = createHandler(UserDTOs.GetUserBorrowsContract,
    {
        access: 'protected',
        security: {
            authenticate: authenticateJwt,
        },
    },
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
)

export const UserController = {
    registerUser,
    loginUser,
    logout,
    getAllUsers,
    updateUser,
    deleteUser,
    getUserBorrows
};
