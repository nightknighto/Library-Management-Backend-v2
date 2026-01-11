import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";
import { getBookAvailableQuantity } from "@prisma/client/sql";

export namespace BookModel {

    export async function createBook({
        isbn, title, author, shelf, total_quantity
    }: Omit<Prisma.BookCreateInput, "created_at" | "Borrow">) {
        try {
            const book = await prisma.book.create({
                data: {
                    isbn,
                    title,
                    author,
                    shelf,
                    total_quantity,
                }
            })
            return book;
        } catch (error: any) {
            if (error.code === 'P2002') {
                return undefined
            }
            throw error;
        }
    }

    export async function getAllBooks({
        title, author, isbn, page, limit
    }: {
        page: number;
        limit: number;
        title?: string;
        author?: string;
        isbn?: string;
    }) {
        const where: Prisma.BookWhereInput = {
            ...(title && { title: { contains: title, mode: "insensitive" } }),
            ...(author && { author: { contains: author, mode: "insensitive" } }),
            ...(isbn && { isbn: { contains: isbn, mode: "insensitive" } }),
        };

        const skip = page && limit ? (page - 1) * limit : undefined;
        const take = limit || undefined;

        const books = await prisma.book.findMany({
            where,
            skip,
            take,
        });

        return books;
    }

    export async function getBookByIsbn(isbn: string) {
        const book = await prisma.$queryRawTyped(getBookAvailableQuantity(isbn));
        return book[0];
    }

    export async function updateBook(isbn: string, data: Omit<Prisma.BookUpdateInput, "created_at" | "Borrow">) {
        try {
            const updatedBook = await prisma.book.update({
                where: { isbn },
                data: {
                    title: data.title,
                    author: data.author,
                    total_quantity: data.total_quantity,
                    shelf: data.shelf,
                },
            });
            return updatedBook;
        } catch (error: any) {
            if (error.code === 'P2025') {
                return undefined
            }
            throw error;
        }
    }

    export async function deleteBook(isbn: string) {
        try {
            const book = await prisma.book.delete({
                where: { isbn },
            });
            return book;
        } catch (error: any) {
            if (error.code === 'P2025') {
                return undefined
            }
            throw error;
        }
    }
}