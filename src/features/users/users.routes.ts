import { Router } from 'express';
import { rateLimiter } from '../../shared/middlewares/rate-limiter.middleware.ts';
import { UserController } from './users.controller.ts';

const usersRoutes = Router();

// POST /users/register - Register a new user
usersRoutes.post('/register', UserController.registerUser);

// POST /users/login - Login user
usersRoutes.post('/login', UserController.loginUser);

// POST /users/logout - Logout user
usersRoutes.post('/logout', UserController.logout);

// GET /users - Get all users with pagination
usersRoutes.get('/', UserController.getAllUsers as any);

// PUT /users - Update current user (requires authentication)
usersRoutes.put('/', rateLimiter(1000, 3), UserController.updateUser);

// DELETE /users/:email - Delete a user by email
usersRoutes.delete('/:email', UserController.deleteUser);

// GET /users/borrows - Get current user's borrows (requires authentication)
usersRoutes.get('/borrows', UserController.getUserBorrows);

export default usersRoutes;
