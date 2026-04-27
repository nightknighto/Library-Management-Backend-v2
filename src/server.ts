import express from 'express';
import { CONFIG } from './config/config.ts';
import rootRouter from './routes.ts';
import { globalErrorHandler } from './shared/middlewares/error-handler.middleware.ts';
import type { ErrorResponse } from './core/types.core.ts';

// Create Express app
const app = express();
const PORT = CONFIG.port;

// Middleware
app.use(express.json());

app.use('/api/v1', rootRouter);

// 404 handler for unmatched routes
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: {
            code: 'NOT_FOUND',
            message: 'Route not found'
        }
    } satisfies ErrorResponse);
});

// Error handling middleware
// Keep it. It handles malformed JSON bodies
app.use(globalErrorHandler);

// Start server
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

process.on('unhandledRejection', (reason) => {
    console.error('Unhandled Rejection:', reason);
});

// Prevent the process from exiting
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});


export default app;