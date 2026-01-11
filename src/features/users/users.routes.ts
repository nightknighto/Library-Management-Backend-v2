import { Router } from "express";
import { UserDTOs } from "./users.dtos.ts";
import { UserController } from "./users.controller.ts";
import { Validators } from "../../shared/middlewares/validators.middleware.ts";
import { rateLimiter } from "../../shared/middlewares/rate-limiter.middleware.ts";
import { authenticate } from "../../shared/middlewares/auth.ts";

const usersRoutes = Router();

// POST /users/register - Register a new user
usersRoutes.post('/register',
    Validators.validateBody(UserDTOs.RegisterUserSchema),
    UserController.registerUser
);

// POST /users/login - Login user
usersRoutes.post('/login',
    Validators.validateBody(UserDTOs.LoginUserSchema),
    UserController.loginUser
);

// GET /users - Get all users with pagination
usersRoutes.get('/',
    Validators.validateQuery(UserDTOs.UserPaginationQuerySchema),
    UserController.getAllUsers
);

// PUT /users - Update current user (requires authentication)
usersRoutes.put('/',
    rateLimiter,
    authenticate,
    Validators.validateBody(UserDTOs.UpdateUserSchema),
    UserController.updateUser
);

// DELETE /users/:email - Delete a user by email
usersRoutes.delete('/:email',
    Validators.validateParams(UserDTOs.UserParamsSchema),
    UserController.deleteUser
);

// GET /users/borrows - Get current user's borrows (requires authentication)
usersRoutes.get('/borrows',
    authenticate,
    UserController.getUserBorrows
);

export default usersRoutes;
