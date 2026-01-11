import { Prisma } from "@prisma/client";
import { prisma } from "../prisma.ts";


export namespace UserModel {
    export async function createUser(email: string, name: string) {
        try {
            const user = await prisma.user.create({
                data: {
                    email,
                    name,
                }
            })
            return user;
        } catch (error: any) {
            if (error.code === 'P2002') {
                return undefined
            }
            throw error;
        }
    }

    export async function getAllUsers(page: number, limit: number) {
        const skip = page && limit ? (page - 1) * limit : undefined;
        const take = limit || undefined;

        // CUSTOM SQL
        const users = await prisma.user.findMany({
            skip,
            take,
        });

        return users;
    }

    export async function getUser(email: string) {
        const user = await prisma.user.findUnique({
            where: { email },
        });
        return user;
    }

    /**
     * Retrieves a user by email along with their active book borrows.
     * 
     * @param email - The email address of the user to retrieve
     * @returns A promise that resolves to the user object with active borrows, or undefined if user not found
     * 
     * @remarks
     * This function fetches a user and includes only their active borrows (where return_date is null).
     * For each active borrow, it includes the book title and due date.
     * 
     * @throws Will throw an error if the database operation fails, except for P2025 (record not found) which returns undefined
     */
    export async function getUserWithActiveBorrows(email: string) {
        try {
            const user = await prisma.user.findUnique({
                where: { email },
                include: {
                    Borrow: {
                        select: {
                            book: {
                                select: {
                                    title: true,
                                }
                            },
                            due_date: true,
                        },
                        where: {
                            return_date: null
                        }
                    }
                }
            });
            return user;
        } catch (error: any) {
            if (error.code === 'P2025') {
                return undefined
            }
            throw error;
        }
    }

    export async function updateUser(email: string, name: string) {
        try {
            const updatedUser = await prisma.user.update({
                where: { email },
                data: {
                    name,
                },
            });
            return updatedUser;
        } catch (error: any) {
            if (error.code === 'P2025') {
                return undefined
            }
            throw error;
        }
    }

    export async function deleteUser(email: string) {
        try {
            const user = await prisma.user.delete({
                where: { email },
            });
            return user;
        } catch (error: any) {
            if (error.code === 'P2025') {
                return undefined
            }
            throw error;
        }
    }
}