import express, { Application } from 'express';
import mainRouter from './routes';
import { CONFIG } from './config';

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

app.use('/api', mainRouter);
// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error('Error:', err);    
    res.status(500).json('Internal Server Error');
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

export default app;