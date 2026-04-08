import { Router } from "express";
import * as UserDTOs from "./users.dtos.ts";
import { UserController } from "./users.controller.ts";
import { rateLimiter } from "../../shared/middlewares/rate-limiter.middleware.ts";
import { authenticate } from "../../shared/middlewares/auth.ts";
import { validateRequest } from "../../shared/middlewares/validators.middleware.ts";

const usersRoutes = Router();

// POST /users/register - Register a new user
usersRoutes.post('/register',
    validateRequest(UserDTOs.RegisterUserRequestSchema),
    UserController.registerUser
);

// POST /users/login - Login user
usersRoutes.post('/login',
    validateRequest(UserDTOs.LoginUserRequestSchema),
    UserController.loginUser
);

// GET /users - Get all users with pagination
usersRoutes.get('/',
    validateRequest(UserDTOs.GetAllUsersRequestSchema),
    UserController.getAllUsers as any
);

// PUT /users - Update current user (requires authentication)
usersRoutes.put('/',
    rateLimiter,
    authenticate,
    validateRequest(UserDTOs.UpdateUserRequestSchema),
    UserController.updateUser
);

// DELETE /users/:email - Delete a user by email
usersRoutes.delete('/:email',
    validateRequest(UserDTOs.DeleteUserRequestSchema),
    UserController.deleteUser
);

// GET /users/borrows - Get current user's borrows (requires authentication)
usersRoutes.get('/borrows',
    authenticate,
    validateRequest(UserDTOs.GetUserBorrowsRequestSchema),
    UserController.getUserBorrows
);

export default usersRoutes;
