import { getReturnsMadeDaily, getBorrowsMadeDaily, getMostBorrowingUsers, getMostPopularBooks, getMostOverdueUsers, getOverdueDaily } from "@prisma/client/sql";
import { prisma } from "../../lib/prisma.ts";

export const StatsService = {
    async borrowsMadeDailySince(date: Date) {
        const result = await prisma.$queryRawTyped(getBorrowsMadeDaily(date));
        return result;
    },

    async returnsMadeDailySince(date: Date) {
        const result = await prisma.$queryRawTyped(getReturnsMadeDaily(date));
        return result;
    },

    async mostPopularBooksSince(date: Date) {
        const result = await prisma.$queryRawTyped(getMostPopularBooks(date));
        return result;
    },
    async mostBorrowingUsersSince(date: Date) {
        const result = await prisma.$queryRawTyped(getMostBorrowingUsers(date));
        return result;
    },

    async mostOverdueUsersSince(date: Date) {
        const result = await prisma.$queryRawTyped(getMostOverdueUsers(date));
        return result;
    },

    async overdueDailySince(date: Date) {
        const result = await prisma.$queryRawTyped(getOverdueDaily(date));
        return result;
    }
}