import { getReturnsMadeDaily, getBorrowsMadeDaily, getMostBorrowingUsers, getMostPopularBooks, getMostOverdueUsers, getOverdueDaily } from "@prisma/client/sql";
import { prisma } from "../prisma.ts";

export namespace StatsService {
    export async function borrowsMadeDailySince(date: Date) {
        const result = await prisma.$queryRawTyped(getBorrowsMadeDaily(date));
        return result;
    }

    export async function returnsMadeDailySince(date: Date) {
        const result = await prisma.$queryRawTyped(getReturnsMadeDaily(date));
        return result;
    }

    export async function mostPopularBooksSince(date: Date) {
        const result = await prisma.$queryRawTyped(getMostPopularBooks(date));
        return result;
    }
    export async function mostBorrowingUsersSince(date: Date) {
        const result = await prisma.$queryRawTyped(getMostBorrowingUsers(date));
        return result;
    }

    export async function mostOverdueUsersSince(date: Date) {
        const result = await prisma.$queryRawTyped(getMostOverdueUsers(date));
        return result;
    }

    export async function overdueDailySince(date: Date) {
        const result = await prisma.$queryRawTyped(getOverdueDaily(date));
        return result;
    }
}