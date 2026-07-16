import { prisma } from '../../lib/prisma.ts';

export const StatsService = {
    async borrowsMadeDailySince(date: Date) {
        // Native Prisma cannot truncate a DateTime to a calendar day via groupBy
        // (every @default(now()) timestamp is distinct), so fetch the raw dates
        // and aggregate into per-day counts in JS.
        const rows = await prisma.borrow.findMany({
            where: { borrow_date: { gt: date } },
            select: { borrow_date: true },
        });

        const counts = new Map<string, number>();
        for (const { borrow_date } of rows) {
            const day = borrow_date.toISOString().slice(0, 10);
            counts.set(day, (counts.get(day) ?? 0) + 1);
        }

        return Array.from(counts, ([day, count]) => ({ day, count }));
    },

    async returnsMadeDailySince(date: Date) {
        const rows = await prisma.borrow.findMany({
            where: { return_date: { gt: date } },
            select: { return_date: true },
        });

        const counts = new Map<string, number>();
        for (const { return_date } of rows) {
            // return_date is filtered to non-null above.
            const day = return_date!.toISOString().slice(0, 10);
            counts.set(day, (counts.get(day) ?? 0) + 1);
        }

        return Array.from(counts, ([day, count]) => ({ day, count }));
    },

    async mostPopularBooksSince(date: Date) {
        return prisma.borrow.groupBy({
            by: ['book_isbn'],
            where: { borrow_date: { gt: date } },
            _count: { book_isbn: true },
            orderBy: { _count: { book_isbn: 'desc' } },
            take: 5,
        });
    },

    async mostBorrowingUsersSince(date: Date) {
        return prisma.borrow.groupBy({
            by: ['user_email'],
            where: { borrow_date: { gt: date } },
            _count: { user_email: true },
            orderBy: { _count: { user_email: 'desc' } },
            take: 5,
        });
    },

    async mostOverdueUsersSince(date: Date) {
        return prisma.borrow.groupBy({
            by: ['user_email'],
            where: {
                borrow_date: { gt: date },
                return_date: null,
                due_date: { lt: new Date() },
            },
            _count: { user_email: true },
            orderBy: { _count: { user_email: 'desc' } },
            take: 5,
        });
    },

    async overdueDailySince(date: Date) {
        // Per-day aggregation of currently-overdue borrows; see borrowsMadeDailySince.
        const rows = await prisma.borrow.findMany({
            where: {
                borrow_date: { gt: date },
                return_date: null,
                due_date: { lt: new Date() },
            },
            select: { borrow_date: true },
        });

        const counts = new Map<string, number>();
        for (const { borrow_date } of rows) {
            const day = borrow_date.toISOString().slice(0, 10);
            counts.set(day, (counts.get(day) ?? 0) + 1);
        }

        return Array.from(counts, ([day, count]) => ({ day, count }));
    },
};
