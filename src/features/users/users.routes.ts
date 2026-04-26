import { Router } from "express";
import * as UserDTOs from "./users.schemas.ts";
import { UserController } from "./users.controller.ts";
import { rateLimiter } from "../../shared/middlewares/rate-limiter.middleware.ts";
import { validateRequest } from "../../shared/middlewares/validators.middleware.ts";

const usersRoutes = Router();

// POST /users/register - Register a new user
usersRoutes.post('/register',
    UserController.registerUser
);

// POST /users/login - Login user
usersRoutes.post('/login',
    UserController.loginUser
);

// GET /users - Get all users with pagination
usersRoutes.get('/',
    UserController.getAllUsers as any
);

// PUT /users - Update current user (requires authentication)
usersRoutes.put('/',
    rateLimiter(1000, 3),
    UserController.updateUser
);

// DELETE /users/:email - Delete a user by email
usersRoutes.delete('/:email',
    UserController.deleteUser
);

// GET /users/borrows - Get current user's borrows (requires authentication)
usersRoutes.get('/borrows',
    UserController.getUserBorrows
);

export default usersRoutes;
