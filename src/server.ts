import express from 'express';
import { CONFIG } from './config/config.ts';
import rootRouter from './routes.ts';

// Create Express app
const app = express();
const PORT = CONFIG.port

// Middleware
app.use(express.json());

app.use((req, res, next) => {
    // Overwrite the 'query' property with a new, writable one
    Object.defineProperty(req, 'query', {
        ...Object.getOwnPropertyDescriptor(req, 'query'),
        value: req.query,
        writable: true,
    });

    next();
});

app.use('/api/v1', rootRouter);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);
    res.status(500).json('Internal Server Error');
});

// Start server
const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
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