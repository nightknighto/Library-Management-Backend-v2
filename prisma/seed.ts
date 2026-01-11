import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    try {
        console.log("Starting database seeding...");

        // Clear existing data (optional - remove if you want to append data)
        await prisma.borrow.deleteMany();
        await prisma.user.deleteMany();
        await prisma.book.deleteMany();
        console.log("Cleared existing data.");

        // Seed Books
        console.log("Seeding books...");
        const books = await prisma.book.createMany({
            data: [
                // Fiction
                { isbn: "978-0-06-112008-4", title: "To Kill a Mockingbird", author: "Harper Lee", shelf: "A1", total_quantity: 5 },
                { isbn: "978-0-7432-7356-5", title: "The Great Gatsby", author: "F. Scott Fitzgerald", shelf: "A1", total_quantity: 8 },
                { isbn: "978-0-452-28423-4", title: "1984", author: "George Orwell", shelf: "A2", total_quantity: 12 },
                { isbn: "978-0-14-143951-8", title: "Pride and Prejudice", author: "Jane Austen", shelf: "A2", total_quantity: 6 },
                { isbn: "978-0-06-093546-7", title: "One Hundred Years of Solitude", author: "Gabriel García Márquez", shelf: "A3", total_quantity: 4 },
                { isbn: "978-0-679-73226-4", title: "Beloved", author: "Toni Morrison", shelf: "A3", total_quantity: 7 },
                { isbn: "978-0-553-21311-0", title: "Brave New World", author: "Aldous Huxley", shelf: "A4", total_quantity: 9 },
                { isbn: "978-0-14-044926-6", title: "The Catcher in the Rye", author: "J.D. Salinger", shelf: "A4", total_quantity: 10 },
                { isbn: "978-0-14-118776-1", title: "Lord of the Flies", author: "William Golding", shelf: "A5", total_quantity: 8 },
                { isbn: "978-0-316-76948-0", title: "The Handmaid's Tale", author: "Margaret Atwood", shelf: "A5", total_quantity: 6 },

                // Mystery/Thriller
                { isbn: "978-0-06-440872-2", title: "Gone Girl", author: "Gillian Flynn", shelf: "B1", total_quantity: 15 },
                { isbn: "978-0-307-58837-1", title: "The Girl with the Dragon Tattoo", author: "Stieg Larsson", shelf: "B1", total_quantity: 12 },
                { isbn: "978-0-385-53785-8", title: "The Da Vinci Code", author: "Dan Brown", shelf: "B2", total_quantity: 20 },
                { isbn: "978-0-7432-4722-5", title: "Angels & Demons", author: "Dan Brown", shelf: "B2", total_quantity: 18 },
                { isbn: "978-0-14-312018-5", title: "In the Woods", author: "Tana French", shelf: "B3", total_quantity: 5 },
                { isbn: "978-0-06-077298-9", title: "Big Little Lies", author: "Liane Moriarty", shelf: "B3", total_quantity: 11 },
                { isbn: "978-0-525-50825-5", title: "The Silent Patient", author: "Alex Michaelides", shelf: "B4", total_quantity: 14 },
                { isbn: "978-1-4767-2765-3", title: "The Woman in the Window", author: "A.J. Finn", shelf: "B4", total_quantity: 9 },

                // Science Fiction/Fantasy
                { isbn: "978-0-553-10354-0", title: "Dune", author: "Frank Herbert", shelf: "C1", total_quantity: 8 },
                { isbn: "978-0-345-33968-3", title: "Foundation", author: "Isaac Asimov", shelf: "C1", total_quantity: 6 },
                { isbn: "978-0-547-92822-7", title: "The Hobbit", author: "J.R.R. Tolkien", shelf: "C2", total_quantity: 12 },
                { isbn: "978-0-547-52837-9", title: "The Fellowship of the Ring", author: "J.R.R. Tolkien", shelf: "C2", total_quantity: 10 },
                { isbn: "978-0-547-95581-9", title: "The Two Towers", author: "J.R.R. Tolkien", shelf: "C2", total_quantity: 10 },
                { isbn: "978-0-547-95582-6", title: "The Return of the King", author: "J.R.R. Tolkien", shelf: "C2", total_quantity: 10 },
                { isbn: "978-0-553-38034-0", title: "A Game of Thrones", author: "George R.R. Martin", shelf: "C3", total_quantity: 15 },
                { isbn: "978-0-553-38103-3", title: "A Clash of Kings", author: "George R.R. Martin", shelf: "C3", total_quantity: 12 },
                { isbn: "978-0-06-112241-5", title: "Ender's Game", author: "Orson Scott Card", shelf: "C4", total_quantity: 7 },
                { isbn: "978-0-345-40957-0", title: "Neuromancer", author: "William Gibson", shelf: "C4", total_quantity: 5 },

                // Non-Fiction
                { isbn: "978-0-7432-7357-2", title: "Sapiens", author: "Yuval Noah Harari", shelf: "D1", total_quantity: 13 },
                { isbn: "978-0-8129-9653-1", title: "Educated", author: "Tara Westover", shelf: "D1", total_quantity: 16 },
                { isbn: "978-1-250-06203-5", title: "Becoming", author: "Michelle Obama", shelf: "D2", total_quantity: 22 },
                { isbn: "978-0-385-34799-8", title: "Thinking, Fast and Slow", author: "Daniel Kahneman", shelf: "D2", total_quantity: 8 },
                { isbn: "978-0-06-231508-7", title: "The 7 Habits of Highly Effective People", author: "Stephen R. Covey", shelf: "D3", total_quantity: 11 },
                { isbn: "978-0-7432-6734-6", title: "Freakonomics", author: "Steven D. Levitt", shelf: "D3", total_quantity: 9 },
                { isbn: "978-0-316-20016-4", title: "Outliers", author: "Malcolm Gladwell", shelf: "D4", total_quantity: 14 },
                { isbn: "978-0-385-33171-3", title: "A Brief History of Time", author: "Stephen Hawking", shelf: "D4", total_quantity: 6 },

                // Biography/Memoir
                { isbn: "978-1-5011-2701-8", title: "Steve Jobs", author: "Walter Isaacson", shelf: "E1", total_quantity: 10 },
                { isbn: "978-0-307-38789-9", title: "The Immortal Life of Henrietta Lacks", author: "Rebecca Skloot", shelf: "E1", total_quantity: 8 },
                { isbn: "978-0-385-53074-3", title: "Born to Run", author: "Bruce Springsteen", shelf: "E2", total_quantity: 7 },
                { isbn: "978-0-06-125973-3", title: "Kitchen Confidential", author: "Anthony Bourdain", shelf: "E2", total_quantity: 9 },
                { isbn: "978-0-679-43133-2", title: "Long Walk to Freedom", author: "Nelson Mandela", shelf: "E3", total_quantity: 5 },

                // Romance
                { isbn: "978-0-425-26634-7", title: "The Notebook", author: "Nicholas Sparks", shelf: "F1", total_quantity: 12 },
                { isbn: "978-1-4767-7834-2", title: "Me Before You", author: "Jojo Moyes", shelf: "F1", total_quantity: 18 },
                { isbn: "978-0-345-53486-1", title: "Fifty Shades of Grey", author: "E.L. James", shelf: "F2", total_quantity: 25 },
                { isbn: "978-0-425-24559-5", title: "The Fault in Our Stars", author: "John Green", shelf: "F2", total_quantity: 20 },
                { isbn: "978-0-452-29815-6", title: "Outlander", author: "Diana Gabaldon", shelf: "F3", total_quantity: 8 },

                // Technical/Programming
                { isbn: "978-0-596-51774-8", title: "JavaScript: The Good Parts", author: "Douglas Crockford", shelf: "G1", total_quantity: 6 },
                { isbn: "978-0-13-597663-6", title: "Clean Code", author: "Robert C. Martin", shelf: "G1", total_quantity: 8 },
                { isbn: "978-0-201-61622-4", title: "The Pragmatic Programmer", author: "David Thomas", shelf: "G2", total_quantity: 5 },
                { isbn: "978-0-321-12521-7", title: "Design Patterns", author: "Gang of Four", shelf: "G2", total_quantity: 4 },
                { isbn: "978-0-262-03384-8", title: "Introduction to Algorithms", author: "Thomas H. Cormen", shelf: "G3", total_quantity: 3 },

                // Children's Books
                { isbn: "978-0-439-70818-8", title: "Harry Potter and the Sorcerer's Stone", author: "J.K. Rowling", shelf: "H1", total_quantity: 25 },
                { isbn: "978-0-439-06486-6", title: "Harry Potter and the Chamber of Secrets", author: "J.K. Rowling", shelf: "H1", total_quantity: 22 },
                { isbn: "978-0-439-13635-8", title: "Harry Potter and the Prisoner of Azkaban", author: "J.K. Rowling", shelf: "H1", total_quantity: 20 },
                { isbn: "978-0-06-440055-8", title: "Where the Crawdads Sing", author: "Delia Owens", shelf: "H2", total_quantity: 30 },
                { isbn: "978-0-06-112008-5", title: "Charlotte's Web", author: "E.B. White", shelf: "H2", total_quantity: 15 },
                { isbn: "978-0-06-440018-3", title: "Matilda", author: "Roald Dahl", shelf: "H3", total_quantity: 12 },
                { isbn: "978-0-14-036212-1", title: "The Chronicles of Narnia", author: "C.S. Lewis", shelf: "H3", total_quantity: 18 },
            ],
            skipDuplicates: true
        });
        console.log(`Created ${books.count} books.`);

        // Seed Users
        console.log("Seeding users...");
        const users = await prisma.user.createMany({
            data: [
                { email: "alice.johnson@email.com", name: "Alice Johnson", registered_at: new Date("2023-01-15T10:30:00Z") },
                { email: "bob.smith@email.com", name: "Bob Smith", registered_at: new Date("2023-02-20T14:15:00Z") },
                { email: "charlie.brown@email.com", name: "Charlie Brown", registered_at: new Date("2023-03-05T09:45:00Z") },
                { email: "diana.prince@email.com", name: "Diana Prince", registered_at: new Date("2023-03-12T16:20:00Z") },
                { email: "edward.cullen@email.com", name: "Edward Cullen", registered_at: new Date("2023-04-01T11:30:00Z") },
                { email: "fiona.gallagher@email.com", name: "Fiona Gallagher", registered_at: new Date("2023-04-18T13:45:00Z") },
                { email: "george.washington@email.com", name: "George Washington", registered_at: new Date("2023-05-10T08:20:00Z") },
                { email: "helen.keller@email.com", name: "Helen Keller", registered_at: new Date("2023-05-25T15:10:00Z") },
                { email: "ivan.petrov@email.com", name: "Ivan Petrov", registered_at: new Date("2023-06-02T12:35:00Z") },
                { email: "jane.doe@email.com", name: "Jane Doe", registered_at: new Date("2023-06-15T10:50:00Z") },
                { email: "kevin.hart@email.com", name: "Kevin Hart", registered_at: new Date("2023-07-01T14:25:00Z") },
                { email: "lucy.liu@email.com", name: "Lucy Liu", registered_at: new Date("2023-07-20T09:15:00Z") },
                { email: "michael.jordan@email.com", name: "Michael Jordan", registered_at: new Date("2023-08-05T16:40:00Z") },
                { email: "nancy.drew@email.com", name: "Nancy Drew", registered_at: new Date("2023-08-22T11:05:00Z") },
                { email: "oscar.wilde@email.com", name: "Oscar Wilde", registered_at: new Date("2023-09-01T13:30:00Z") },
                { email: "penny.lane@email.com", name: "Penny Lane", registered_at: new Date("2023-09-10T15:55:00Z") },
                { email: "quincy.jones@email.com", name: "Quincy Jones", registered_at: new Date("2024-01-12T10:20:00Z") },
                { email: "rachel.green@email.com", name: "Rachel Green", registered_at: new Date("2024-02-14T14:30:00Z") },
                { email: "steve.rogers@email.com", name: "Steve Rogers", registered_at: new Date("2024-03-01T09:10:00Z") },
                { email: "tina.turner@email.com", name: "Tina Turner", registered_at: new Date("2024-04-05T16:15:00Z") },
                { email: "ulysses.grant@email.com", name: "Ulysses Grant", registered_at: new Date("2024-05-18T12:45:00Z") },
                { email: "victoria.beckham@email.com", name: "Victoria Beckham", registered_at: new Date("2024-06-22T11:25:00Z") },
                { email: "walter.white@email.com", name: "Walter White", registered_at: new Date("2024-07-30T15:35:00Z") },
                { email: "xenia.goodwin@email.com", name: "Xenia Goodwin", registered_at: new Date("2024-08-12T13:20:00Z") },
                { email: "yuki.tanaka@email.com", name: "Yuki Tanaka", registered_at: new Date("2024-09-01T10:50:00Z") },
                { email: "zoe.saldana@email.com", name: "Zoe Saldana", registered_at: new Date("2024-09-10T14:15:00Z") },
                { email: "amy.adams@email.com", name: "Amy Adams", registered_at: new Date("2025-01-15T09:30:00Z") },
                { email: "ben.affleck@email.com", name: "Ben Affleck", registered_at: new Date("2025-02-20T16:45:00Z") },
                { email: "cate.blanchett@email.com", name: "Cate Blanchett", registered_at: new Date("2025-03-10T11:20:00Z") },
                { email: "denzel.washington@email.com", name: "Denzel Washington", registered_at: new Date("2025-04-25T13:55:00Z") }
            ],
            skipDuplicates: true
        });
        console.log(`Created ${users.count} users.`);

        // Seed Borrows
        console.log("Seeding borrow records...");
        const borrows = await prisma.borrow.createMany({
            data: [
                // === BASIC SCENARIOS ===
                // Active borrows (not returned yet)
                { user_email: "alice.johnson@email.com", book_isbn: "978-0-06-112008-4", borrow_date: new Date("2024-08-15T10:00:00Z"), due_date: new Date("2024-09-15T23:59:59Z") },
                { user_email: "bob.smith@email.com", book_isbn: "978-0-7432-7356-5", borrow_date: new Date("2024-08-20T14:30:00Z"), due_date: new Date("2024-09-20T23:59:59Z") },
                { user_email: "charlie.brown@email.com", book_isbn: "978-0-452-28423-4", borrow_date: new Date("2024-09-01T09:15:00Z"), due_date: new Date("2024-10-01T23:59:59Z") },
                { user_email: "diana.prince@email.com", book_isbn: "978-0-385-53785-8", borrow_date: new Date("2024-09-05T16:20:00Z"), due_date: new Date("2024-10-05T23:59:59Z") },
                { user_email: "edward.cullen@email.com", book_isbn: "978-0-553-10354-0", borrow_date: new Date("2024-09-10T11:45:00Z"), due_date: new Date("2024-10-10T23:59:59Z") },

                // Overdue borrows (past due date, not returned)
                { user_email: "fiona.gallagher@email.com", book_isbn: "978-0-14-143951-8", borrow_date: new Date("2024-07-01T10:00:00Z"), due_date: new Date("2024-08-01T23:59:59Z") },
                { user_email: "george.washington@email.com", book_isbn: "978-0-06-093546-7", borrow_date: new Date("2024-07-15T14:30:00Z"), due_date: new Date("2024-08-15T23:59:59Z") },
                { user_email: "helen.keller@email.com", book_isbn: "978-0-679-73226-4", borrow_date: new Date("2024-08-01T09:15:00Z"), due_date: new Date("2024-09-01T23:59:59Z") },

                // === CAPACITY TESTING (Books at their limits) ===
                // "To Kill a Mockingbird" has total_quantity: 5, let's max it out with unreturned borrows
                { user_email: "ivan.petrov@email.com", book_isbn: "978-0-06-112008-4", borrow_date: new Date("2024-08-01T10:00:00Z"), due_date: new Date("2024-09-01T23:59:59Z") },
                { user_email: "jane.doe@email.com", book_isbn: "978-0-06-112008-4", borrow_date: new Date("2024-08-02T11:00:00Z"), due_date: new Date("2024-09-02T23:59:59Z") },
                { user_email: "kevin.hart@email.com", book_isbn: "978-0-06-112008-4", borrow_date: new Date("2024-08-03T12:00:00Z"), due_date: new Date("2024-09-03T23:59:59Z") },
                { user_email: "lucy.liu@email.com", book_isbn: "978-0-06-112008-4", borrow_date: new Date("2024-08-04T13:00:00Z"), due_date: new Date("2024-09-04T23:59:59Z") },
                // ^ Now "To Kill a Mockingbird" has 5/5 unreturned borrows (should be unavailable)

                // "One Hundred Years of Solitude" has total_quantity: 4, let's test near-capacity
                { user_email: "michael.jordan@email.com", book_isbn: "978-0-06-093546-7", borrow_date: new Date("2024-08-10T10:00:00Z"), due_date: new Date("2024-09-10T23:59:59Z") },
                { user_email: "nancy.drew@email.com", book_isbn: "978-0-06-093546-7", borrow_date: new Date("2024-08-11T11:00:00Z"), due_date: new Date("2024-09-11T23:59:59Z") },
                // ^ Now "One Hundred Years of Solitude" has 3/4 unreturned borrows (1 available)

                // "Introduction to Algorithms" has total_quantity: 3, let's fully book it
                { user_email: "oscar.wilde@email.com", book_isbn: "978-0-262-03384-8", borrow_date: new Date("2024-09-01T10:00:00Z"), due_date: new Date("2024-10-01T23:59:59Z") },
                { user_email: "penny.lane@email.com", book_isbn: "978-0-262-03384-8", borrow_date: new Date("2024-09-02T11:00:00Z"), due_date: new Date("2024-10-02T23:59:59Z") },
                { user_email: "quincy.jones@email.com", book_isbn: "978-0-262-03384-8", borrow_date: new Date("2024-09-03T12:00:00Z"), due_date: new Date("2024-10-03T23:59:59Z") },
                // ^ Now "Introduction to Algorithms" has 3/3 unreturned borrows (should be unavailable)

                // === SEQUENTIAL BORROWING (Return and re-borrow patterns) ===
                // Rachel Green borrows and returns Harry Potter multiple times
                { user_email: "rachel.green@email.com", book_isbn: "978-0-439-70818-8", borrow_date: new Date("2024-01-15T10:00:00Z"), due_date: new Date("2024-02-15T23:59:59Z"), return_date: new Date("2024-02-10T14:20:00Z") },
                { user_email: "rachel.green@email.com", book_isbn: "978-0-439-70818-8", borrow_date: new Date("2024-03-01T10:00:00Z"), due_date: new Date("2024-04-01T23:59:59Z"), return_date: new Date("2024-03-25T16:30:00Z") },
                { user_email: "rachel.green@email.com", book_isbn: "978-0-439-70818-8", borrow_date: new Date("2024-05-15T10:00:00Z"), due_date: new Date("2024-06-15T23:59:59Z"), return_date: new Date("2024-06-12T18:45:00Z") },
                { user_email: "rachel.green@email.com", book_isbn: "978-0-439-70818-8", borrow_date: new Date("2024-08-01T10:00:00Z"), due_date: new Date("2024-09-01T23:59:59Z") }, // Currently borrowed again

                // Steve Rogers has a complex borrowing pattern with The Da Vinci Code
                { user_email: "steve.rogers@email.com", book_isbn: "978-0-385-53785-8", borrow_date: new Date("2024-01-01T10:00:00Z"), due_date: new Date("2024-02-01T23:59:59Z"), return_date: new Date("2024-01-28T15:30:00Z") },
                { user_email: "steve.rogers@email.com", book_isbn: "978-0-385-53785-8", borrow_date: new Date("2024-03-15T10:00:00Z"), due_date: new Date("2024-04-15T23:59:59Z"), return_date: new Date("2024-04-20T12:15:00Z") }, // Late return
                { user_email: "steve.rogers@email.com", book_isbn: "978-0-385-53785-8", borrow_date: new Date("2024-06-10T10:00:00Z"), due_date: new Date("2024-07-10T23:59:59Z"), return_date: new Date("2024-07-08T09:45:00Z") },

                // === HIGH CIRCULATION BOOKS ===
                // Harry Potter Sorcerer's Stone (total_quantity: 25) - very popular
                { user_email: "tina.turner@email.com", book_isbn: "978-0-439-70818-8", borrow_date: new Date("2024-01-10T10:00:00Z"), due_date: new Date("2024-02-10T23:59:59Z"), return_date: new Date("2024-02-08T14:20:00Z") },
                { user_email: "ulysses.grant@email.com", book_isbn: "978-0-439-70818-8", borrow_date: new Date("2024-02-20T10:00:00Z"), due_date: new Date("2024-03-20T23:59:59Z"), return_date: new Date("2024-03-18T16:30:00Z") },
                { user_email: "victoria.beckham@email.com", book_isbn: "978-0-439-70818-8", borrow_date: new Date("2024-04-01T10:00:00Z"), due_date: new Date("2024-05-01T23:59:59Z"), return_date: new Date("2024-04-28T11:15:00Z") },
                { user_email: "walter.white@email.com", book_isbn: "978-0-439-70818-8", borrow_date: new Date("2024-05-20T10:00:00Z"), due_date: new Date("2024-06-20T23:59:59Z"), return_date: new Date("2024-06-25T13:45:00Z") }, // Late return
                { user_email: "xenia.goodwin@email.com", book_isbn: "978-0-439-70818-8", borrow_date: new Date("2024-07-01T10:00:00Z"), due_date: new Date("2024-08-01T23:59:59Z"), return_date: new Date("2024-07-30T17:20:00Z") },
                { user_email: "yuki.tanaka@email.com", book_isbn: "978-0-439-70818-8", borrow_date: new Date("2024-08-15T10:00:00Z"), due_date: new Date("2024-09-15T23:59:59Z") }, // Active
                { user_email: "zoe.saldana@email.com", book_isbn: "978-0-439-70818-8", borrow_date: new Date("2024-09-01T10:00:00Z"), due_date: new Date("2024-10-01T23:59:59Z") }, // Active
                { user_email: "amy.adams@email.com", book_isbn: "978-0-439-70818-8", borrow_date: new Date("2024-09-05T10:00:00Z"), due_date: new Date("2024-10-05T23:59:59Z") }, // Active

                // Fifty Shades of Grey (total_quantity: 25) - another popular book
                { user_email: "ben.affleck@email.com", book_isbn: "978-0-345-53486-1", borrow_date: new Date("2024-01-05T10:00:00Z"), due_date: new Date("2024-02-05T23:59:59Z"), return_date: new Date("2024-02-03T15:30:00Z") },
                { user_email: "cate.blanchett@email.com", book_isbn: "978-0-345-53486-1", borrow_date: new Date("2024-02-10T10:00:00Z"), due_date: new Date("2024-03-10T23:59:59Z"), return_date: new Date("2024-03-08T12:45:00Z") },
                { user_email: "denzel.washington@email.com", book_isbn: "978-0-345-53486-1", borrow_date: new Date("2024-03-20T10:00:00Z"), due_date: new Date("2024-04-20T23:59:59Z"), return_date: new Date("2024-04-18T14:20:00Z") },
                { user_email: "alice.johnson@email.com", book_isbn: "978-0-345-53486-1", borrow_date: new Date("2024-05-01T10:00:00Z"), due_date: new Date("2024-06-01T23:59:59Z"), return_date: new Date("2024-06-05T16:30:00Z") }, // Late return
                { user_email: "bob.smith@email.com", book_isbn: "978-0-345-53486-1", borrow_date: new Date("2024-06-15T10:00:00Z"), due_date: new Date("2024-07-15T23:59:59Z"), return_date: new Date("2024-07-12T11:20:00Z") },
                { user_email: "charlie.brown@email.com", book_isbn: "978-0-345-53486-1", borrow_date: new Date("2024-08-01T10:00:00Z"), due_date: new Date("2024-09-01T23:59:59Z") }, // Active
                { user_email: "diana.prince@email.com", book_isbn: "978-0-345-53486-1", borrow_date: new Date("2024-08-10T10:00:00Z"), due_date: new Date("2024-09-10T23:59:59Z") }, // Active
                { user_email: "edward.cullen@email.com", book_isbn: "978-0-345-53486-1", borrow_date: new Date("2024-08-20T10:00:00Z"), due_date: new Date("2024-09-20T23:59:59Z") }, // Active

                // === SAME USER MULTIPLE DIFFERENT BOOKS ===
                // Penny Lane is a prolific reader
                { user_email: "penny.lane@email.com", book_isbn: "978-0-14-312018-5", borrow_date: new Date("2024-01-01T10:00:00Z"), due_date: new Date("2024-02-01T23:59:59Z"), return_date: new Date("2024-01-28T16:15:00Z") },
                { user_email: "penny.lane@email.com", book_isbn: "978-0-06-077298-9", borrow_date: new Date("2024-02-05T10:00:00Z"), due_date: new Date("2024-03-05T23:59:59Z"), return_date: new Date("2024-03-03T14:30:00Z") },
                { user_email: "penny.lane@email.com", book_isbn: "978-0-525-50825-5", borrow_date: new Date("2024-03-10T10:00:00Z"), due_date: new Date("2024-04-10T23:59:59Z"), return_date: new Date("2024-04-08T18:45:00Z") },
                { user_email: "penny.lane@email.com", book_isbn: "978-1-4767-2765-3", borrow_date: new Date("2024-04-15T10:00:00Z"), due_date: new Date("2024-05-15T23:59:59Z"), return_date: new Date("2024-05-12T12:20:00Z") },
                { user_email: "penny.lane@email.com", book_isbn: "978-0-553-10354-0", borrow_date: new Date("2024-05-20T10:00:00Z"), due_date: new Date("2024-06-20T23:59:59Z"), return_date: new Date("2024-06-18T15:30:00Z") },
                { user_email: "penny.lane@email.com", book_isbn: "978-0-345-33968-3", borrow_date: new Date("2024-06-25T10:00:00Z"), due_date: new Date("2024-07-25T23:59:59Z"), return_date: new Date("2024-07-23T17:45:00Z") },
                { user_email: "penny.lane@email.com", book_isbn: "978-0-547-92822-7", borrow_date: new Date("2024-08-01T10:00:00Z"), due_date: new Date("2024-09-01T23:59:59Z"), return_date: new Date("2024-08-28T19:15:00Z") },
                { user_email: "penny.lane@email.com", book_isbn: "978-0-596-51774-8", borrow_date: new Date("2024-09-05T10:00:00Z"), due_date: new Date("2024-10-05T23:59:59Z") }, // Currently active

                // === EDGE CASES ===
                // Same-day operations
                { user_email: "oscar.wilde@email.com", book_isbn: "978-0-425-26634-7", borrow_date: new Date("2024-06-01T09:00:00Z"), due_date: new Date("2024-07-01T23:59:59Z"), return_date: new Date("2024-06-01T17:30:00Z") }, // Same day borrow/return
                { user_email: "quincy.jones@email.com", book_isbn: "978-1-4767-7834-2", borrow_date: new Date("2024-06-15T10:00:00Z"), due_date: new Date("2024-07-15T23:59:59Z"), return_date: new Date("2024-06-15T23:59:59Z") }, // Returned at midnight

                // Boundary dates (due exactly today)
                { user_email: "walter.white@email.com", book_isbn: "978-0-425-24559-5", borrow_date: new Date("2024-08-14T10:00:00Z"), due_date: new Date("2024-09-14T23:59:59Z") }, // Due today (Sept 14, 2025)
                { user_email: "xenia.goodwin@email.com", book_isbn: "978-0-452-29815-6", borrow_date: new Date("2024-08-13T10:00:00Z"), due_date: new Date("2024-09-13T23:59:59Z") }, // Overdue by 1 day

                // Long overdue books
                { user_email: "yuki.tanaka@email.com", book_isbn: "978-0-596-51774-8", borrow_date: new Date("2024-01-15T10:00:00Z"), due_date: new Date("2024-02-15T23:59:59Z") }, // 7+ months overdue
                { user_email: "zoe.saldana@email.com", book_isbn: "978-0-13-597663-6", borrow_date: new Date("2024-03-01T10:00:00Z"), due_date: new Date("2024-04-01T23:59:59Z") }, // 5+ months overdue

                // Very quick returns (within hours)
                { user_email: "amy.adams@email.com", book_isbn: "978-0-201-61622-4", borrow_date: new Date("2024-07-01T10:00:00Z"), due_date: new Date("2024-08-01T23:59:59Z"), return_date: new Date("2024-07-01T14:30:00Z") }, // 4.5 hours
                { user_email: "ben.affleck@email.com", book_isbn: "978-0-321-12521-7", borrow_date: new Date("2024-07-15T09:00:00Z"), due_date: new Date("2024-08-15T23:59:59Z"), return_date: new Date("2024-07-15T11:45:00Z") }, // 2.75 hours

                // === TESTING DIFFERENT BOOK TYPES ===
                // Technical books (lower quantities)
                { user_email: "charlie.brown@email.com", book_isbn: "978-0-596-51774-8", borrow_date: new Date("2024-08-01T10:00:00Z"), due_date: new Date("2024-09-01T23:59:59Z"), return_date: new Date("2024-08-25T16:30:00Z") },
                { user_email: "diana.prince@email.com", book_isbn: "978-0-13-597663-6", borrow_date: new Date("2024-08-05T10:00:00Z"), due_date: new Date("2024-09-05T23:59:59Z") }, // Active
                { user_email: "edward.cullen@email.com", book_isbn: "978-0-201-61622-4", borrow_date: new Date("2024-08-10T10:00:00Z"), due_date: new Date("2024-09-10T23:59:59Z") }, // Active
                { user_email: "fiona.gallagher@email.com", book_isbn: "978-0-321-12521-7", borrow_date: new Date("2024-08-15T10:00:00Z"), due_date: new Date("2024-09-15T23:59:59Z") }, // Active

                // Children's books (higher quantities)
                { user_email: "george.washington@email.com", book_isbn: "978-0-06-440055-8", borrow_date: new Date("2024-08-01T10:00:00Z"), due_date: new Date("2024-09-01T23:59:59Z"), return_date: new Date("2024-08-28T14:20:00Z") },
                { user_email: "helen.keller@email.com", book_isbn: "978-0-06-112008-5", borrow_date: new Date("2024-08-05T10:00:00Z"), due_date: new Date("2024-09-05T23:59:59Z") }, // Active
                { user_email: "ivan.petrov@email.com", book_isbn: "978-0-06-440018-3", borrow_date: new Date("2024-08-10T10:00:00Z"), due_date: new Date("2024-09-10T23:59:59Z") }, // Active
                { user_email: "jane.doe@email.com", book_isbn: "978-0-14-036212-1", borrow_date: new Date("2024-08-15T10:00:00Z"), due_date: new Date("2024-09-15T23:59:59Z") }, // Active

                // === RETURNED BOOKS (Various scenarios) ===
                // On-time returns
                { user_email: "kevin.hart@email.com", book_isbn: "978-0-553-21311-0", borrow_date: new Date("2024-06-01T10:00:00Z"), due_date: new Date("2024-07-01T23:59:59Z"), return_date: new Date("2024-06-28T15:30:00Z") },
                { user_email: "lucy.liu@email.com", book_isbn: "978-0-14-044926-6", borrow_date: new Date("2024-06-15T14:30:00Z"), due_date: new Date("2024-07-15T23:59:59Z"), return_date: new Date("2024-07-10T11:20:00Z") },
                { user_email: "michael.jordan@email.com", book_isbn: "978-0-14-118776-1", borrow_date: new Date("2024-07-01T09:15:00Z"), due_date: new Date("2024-08-01T23:59:59Z"), return_date: new Date("2024-07-30T16:45:00Z") },
                { user_email: "nancy.drew@email.com", book_isbn: "978-0-316-76948-0", borrow_date: new Date("2024-07-10T16:20:00Z"), due_date: new Date("2024-08-10T23:59:59Z"), return_date: new Date("2024-08-05T14:10:00Z") },

                // Late returns (various degrees of lateness)
                { user_email: "tina.turner@email.com", book_isbn: "978-0-06-440872-2", borrow_date: new Date("2024-05-01T10:00:00Z"), due_date: new Date("2024-06-01T23:59:59Z"), return_date: new Date("2024-06-10T13:25:00Z") }, // 9 days late
                { user_email: "ulysses.grant@email.com", book_isbn: "978-0-307-58837-1", borrow_date: new Date("2024-05-15T14:30:00Z"), due_date: new Date("2024-06-15T23:59:59Z"), return_date: new Date("2024-06-25T09:50:00Z") }, // 10 days late
                { user_email: "victoria.beckham@email.com", book_isbn: "978-0-7432-4722-5", borrow_date: new Date("2024-06-01T09:15:00Z"), due_date: new Date("2024-07-01T23:59:59Z"), return_date: new Date("2024-07-15T12:30:00Z") }, // 14 days late
                { user_email: "walter.white@email.com", book_isbn: "978-1-250-06203-5", borrow_date: new Date("2024-04-01T10:00:00Z"), due_date: new Date("2024-05-01T23:59:59Z"), return_date: new Date("2024-06-01T15:45:00Z") }, // 31 days late

                // === RECENT ACTIVITY (last few days) ===
                { user_email: "xenia.goodwin@email.com", book_isbn: "978-0-385-34799-8", borrow_date: new Date("2024-09-09T14:30:00Z"), due_date: new Date("2024-10-09T23:59:59Z") }, // Active
                { user_email: "yuki.tanaka@email.com", book_isbn: "978-0-06-231508-7", borrow_date: new Date("2024-09-10T09:15:00Z"), due_date: new Date("2024-10-10T23:59:59Z") }, // Active
                { user_email: "zoe.saldana@email.com", book_isbn: "978-0-7432-6734-6", borrow_date: new Date("2024-09-11T16:20:00Z"), due_date: new Date("2024-10-11T23:59:59Z") }, // Active
                { user_email: "amy.adams@email.com", book_isbn: "978-0-316-20016-4", borrow_date: new Date("2024-09-12T11:45:00Z"), due_date: new Date("2024-10-12T23:59:59Z") }, // Active
                { user_email: "ben.affleck@email.com", book_isbn: "978-0-385-33171-3", borrow_date: new Date("2024-09-13T08:30:00Z"), due_date: new Date("2024-10-13T23:59:59Z") }, // Active

                // === HISTORICAL DATA (for trend analysis) ===
                { user_email: "cate.blanchett@email.com", book_isbn: "978-1-5011-2701-8", borrow_date: new Date("2024-03-15T14:30:00Z"), due_date: new Date("2024-04-15T23:59:59Z"), return_date: new Date("2024-04-20T12:15:00Z") }, // Late
                { user_email: "denzel.washington@email.com", book_isbn: "978-0-307-38789-9", borrow_date: new Date("2024-04-01T09:15:00Z"), due_date: new Date("2024-05-01T23:59:59Z"), return_date: new Date("2024-04-25T16:45:00Z") }, // On time
                { user_email: "alice.johnson@email.com", book_isbn: "978-0-385-53074-3", borrow_date: new Date("2024-04-15T16:20:00Z"), due_date: new Date("2024-05-15T23:59:59Z"), return_date: new Date("2024-05-10T11:30:00Z") }, // On time
                { user_email: "bob.smith@email.com", book_isbn: "978-0-06-125973-3", borrow_date: new Date("2024-05-01T10:00:00Z"), due_date: new Date("2024-06-01T23:59:59Z"), return_date: new Date("2024-05-28T14:20:00Z") }, // On time
                { user_email: "charlie.brown@email.com", book_isbn: "978-0-679-43133-2", borrow_date: new Date("2024-05-15T11:30:00Z"), due_date: new Date("2024-06-15T23:59:59Z"), return_date: new Date("2024-06-20T09:45:00Z") } // Late
            ],
            skipDuplicates: true
        });
        console.log(`Created ${borrows.count} borrow records.`);

        console.log("Database seeding completed successfully!");

        // Print summary
        const totalBooks = await prisma.book.count();
        const totalUsers = await prisma.user.count();
        const totalBorrows = await prisma.borrow.count();
        const activeBorrows = await prisma.borrow.count({ where: { return_date: null } });
        const overdueBorrows = await prisma.borrow.count({
            where: {
                return_date: null,
                due_date: { lt: new Date() }
            }
        });

        console.log("\n--- Database Summary ---");
        console.log(`Total Books: ${totalBooks}`);
        console.log(`Total Users: ${totalUsers}`);
        console.log(`Total Borrow Records: ${totalBorrows}`);
        console.log(`Active Borrows: ${activeBorrows}`);
        console.log(`Overdue Borrows: ${overdueBorrows}`);

    } catch (error) {
        console.error("Error seeding database:", error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

main();
