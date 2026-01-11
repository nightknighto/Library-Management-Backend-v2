import type { Request, Response } from 'express';
import type { UserDTOs } from './users.dtos.ts';
import { UserRepository } from './users.repository.ts';
import { JwtService } from '../../common/services/jwt.service.ts';

async function registerUser(req: Request<unknown, unknown, UserDTOs.RegisterUserRequest>, res: Response) {
    const { email, name } = req.body;
    const user = await UserRepository.createUser(email, name);
    if (!user) {
        return res.status(400).json({ error: 'User with this email already exists' });
    }
    res.status(201).json({ message: 'User registered successfully' });
}

async function loginUser(req: Request<unknown, unknown, UserDTOs.LoginUserRequest>, res: Response) {
    const { email } = req.body;
    const user = await UserRepository.getUser(email);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    const token = JwtService.createToken({ email });
    res.status(200).json({ token });
}

async function getAllUsers(req: Request, res: Response) {
    const { page, limit } = req.query;
    const users = await UserRepository.getAllUsers(
        page ? parseInt(page as string) : 1,
        Math.min(limit ? parseInt(limit as string) : 10, 100)
    );
    res.status(200).json(users);
}

async function updateUser(req: Request<unknown, unknown, UserDTOs.UpdateUserRequest>, res: Response) {
    const { email } = req.user!;
    const { name } = req.body;
    const updatedUser = await UserRepository.updateUser(email, name);
    if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json(updatedUser);
}

async function deleteUser(req: Request<UserDTOs.UserParams>, res: Response) {
    const { email } = req.params;
    const user = await UserRepository.deleteUser(email);
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.status(200).json({ message: 'User deleted successfully' });
}

async function getUserBorrows(req: Request, res: Response) {
    const { email } = req.user!;
    const userWithBorrows = await UserRepository.getUserWithActiveBorrows(email);
    if (!userWithBorrows) {
        return res.status(404).json({ error: 'User not found' });
    }

    const now = new Date();
    const response = {
        email: userWithBorrows.email,
        name: userWithBorrows.name,
        activeBorrows: userWithBorrows.Borrow.map(borrow => ({
            bookTitle: borrow.book.title,
            due_date: borrow.due_date,
            status: borrow.due_date > now ? 'On Time' : 'Overdue'
        }))
    }

    res.status(200).json(response);
}

export const UserController = {
    registerUser,
    loginUser,
    getAllUsers,
    updateUser,
    deleteUser,
    getUserBorrows
};