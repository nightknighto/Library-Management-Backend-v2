import { Request, Response } from "express";
import { StatsService } from "../services/stats.service";
import { json2csv } from 'json-2-csv';

export namespace StatsController {
    export async function getBorrowsStatistics(req: Request<{}, {}, {}, { from: string, format: 'json' | 'csv' }>, res: Response) {
        const query = req.query;

        const from = query.from || new Date(new Date().setDate(new Date().getDate() - 30)).toISOString(); // default to last 30 days
        const format = query.format && query.format === 'csv' ? 'csv' : 'json';

        const borrows = await StatsService.borrowsMadeDailySince(new Date(from));
        const returns = await StatsService.returnsMadeDailySince(new Date(from));
        const mostPopularBooks = await StatsService.mostPopularBooksSince(new Date(from));
        const mostBorrowingUsers = await StatsService.mostBorrowingUsersSince(new Date(from));

        if (format === 'json') {
            res.json({
                borrows,
                returns,
                mostPopularBooks,
                mostBorrowingUsers
            });
            return
        }

        const csv = json2csv(borrows)
        res.header('Content-Type', 'text/csv');
        res.attachment('borrows.csv');
        res.send(csv);
    }

    export async function getOverdueStatistics(req: Request<{}, {}, {}, { from: string, format: 'json' | 'csv' }>, res: Response) {
        const query = req.query;


        const from = query.from || new Date(new Date().setDate(new Date().getDate() - 30)).toISOString(); // default to last 30 days
        const format = query.format && query.format === 'csv' ? 'csv' : 'json';

        const overdue = await StatsService.overdueDailySince(new Date(from));
        const mostOverdueUsers = await StatsService.mostOverdueUsersSince(new Date(from));

        if (format === 'json') {
            res.json({
                overdue,
                mostOverdueUsers
            });
            return
        }

        const csv = json2csv(overdue)
        res.header('Content-Type', 'text/csv');
        res.attachment('overdue.csv');
        res.send(csv);
    }
}