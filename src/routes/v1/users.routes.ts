import { Router } from "express";
import { UserController } from '../../controllers/users.controller';
import { authenticate, rateLimiter } from "../../middleware";
import { Validators } from "../../middleware/validators.middleware";
import { UserDTOs } from "../../dtos/users.dtos";

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
