import { Router } from "express";
import { StatsController } from '../../controllers/stats.controller';

const statsRoutes = Router();


// GET /stats/borrows - Get borrowing statistics
statsRoutes.get('/borrows',
    StatsController.getBorrowsStatistics
);

// GET /stats/overdue - Get overdue statistics
statsRoutes.get('/overdue',
    StatsController.getOverdueStatistics
);
export default statsRoutes;