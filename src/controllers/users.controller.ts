import type { Request, Response } from 'express';
import { UserModel } from '../models/index.ts';
import { JwtService } from '../services/index.ts';
import { UserDTOs } from '../dtos/index.ts';


export namespace UserController {

    export async function registerUser(req: Request<unknown, unknown, UserDTOs.RegisterUserRequest>, res: Response) {
        const { email, name } = req.body;
        const user = await UserModel.createUser(email, name);
        if (!user) {
            return res.status(400).json({ error: 'User with this email already exists' });
        }
        res.status(201).json({ message: 'User registered successfully' });
    }

    export async function loginUser(req: Request<unknown, unknown, UserDTOs.LoginUserRequest>, res: Response) {
        const { email } = req.body;
        const user = await UserModel.getUser(email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const token = JwtService.createToken({ email });
        res.status(200).json({ token });
    }

    export async function getAllUsers(req: Request, res: Response) {
        const { page, limit } = req.query;
        const users = await UserModel.getAllUsers(
            page ? parseInt(page as string) : 1,
            Math.min(limit ? parseInt(limit as string) : 10, 100)
        );
        res.status(200).json(users);
    }

    export async function updateUser(req: Request<unknown, unknown, UserDTOs.UpdateUserRequest>, res: Response) {
        const { email } = req.user!;
        const { name } = req.body;
        const updatedUser = await UserModel.updateUser(email, name);
        if (!updatedUser) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(200).json(updatedUser);
    }

    export async function deleteUser(req: Request<UserDTOs.UserParams>, res: Response) {
        const { email } = req.params;
        const user = await UserModel.deleteUser(email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.status(200).json({ message: 'User deleted successfully' });
    }

    export async function getUserBorrows(req: Request, res: Response) {
        const { email } = req.user!;
        const userWithBorrows = await UserModel.getUserWithActiveBorrows(email);
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
}