import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.ts";
import { getBookAvailableQuantity } from "@prisma/client/sql";

async function createBook(author: string, {
    isbn, title, shelf, total_quantity
}: Omit<Prisma.BookCreateInput, "created_at" | "Borrow" | 'Author'>) {
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

async function getAllBooks({
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

async function countBooks({
    title, author, isbn,
}: {
    title?: string;
    author?: string;
    isbn?: string;
}) {
    const where: Prisma.BookWhereInput = {
        ...(title && { title: { contains: title, mode: "insensitive" } }),
        ...(author && { author: { contains: author, mode: "insensitive" } }),
        ...(isbn && { isbn: { contains: isbn, mode: "insensitive" } }),
    };

    const totalCount = await prisma.book.count({
        where,
    });

    return totalCount;
}



async function getBookByIsbn(isbn: string) {
    const book = await prisma.$queryRawTyped(getBookAvailableQuantity(isbn));
    return book[0];
}

async function updateBook(isbn: string, author: string, data: Omit<Prisma.BookUpdateInput, "created_at" | "Borrow">) {
    try {
        const updatedBook = await prisma.book.update({
            where: { isbn, author },
            data: {
                title: data.title,
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

async function deleteBook(isbn: string, author: string) {
    try {
        const book = await prisma.book.delete({
            where: { isbn, author },
        });
        return book;
    } catch (error: any) {
        if (error.code === 'P2025') {
            return undefined
        }
        throw error;
    }
}

export const BookRepository = {
    createBook,
    getAllBooks,
    getBookByIsbn,
    updateBook,
    deleteBook,
    countBooks
} as const;