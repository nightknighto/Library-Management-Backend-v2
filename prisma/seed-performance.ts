import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Configuration for performance testing
const CONFIG = {
    BOOKS_COUNT: 15_000,
    USERS_COUNT: 75_000,
    BORROWS_COUNT: 750_000,
    BATCH_SIZE: 1000, // Records per batch for bulk inserts
    PROGRESS_INTERVAL: 5000 // Show progress every N records
};

// Data generators for realistic fake data
class DataGenerator {
    private static bookTitles = [
        "The Art of", "Understanding", "Mastering", "Introduction to", "Advanced", "Fundamentals of",
        "Complete Guide to", "Modern", "Classical", "Contemporary", "Essential", "Comprehensive",
        "Practical", "Theoretical", "Applied", "Digital", "Analog", "The Science of", "The History of",
        "Handbook of", "Manual of", "Principles of", "Techniques in", "Methods for", "Strategies for"
    ];

    private static bookSubjects = [
        "Programming", "Mathematics", "Physics", "Chemistry", "Biology", "Literature", "History",
        "Philosophy", "Psychology", "Sociology", "Anthropology", "Economics", "Political Science",
        "Computer Science", "Engineering", "Medicine", "Law", "Business", "Art", "Music", "Theatre",
        "Film Studies", "Architecture", "Geography", "Linguistics", "Education", "Journalism",
        "Astronomy", "Geology", "Botany", "Zoology", "Statistics", "Data Science", "Machine Learning",
        "Artificial Intelligence", "Cybersecurity", "Web Development", "Mobile Development", "Design",
        "Marketing", "Finance", "Accounting", "Management", "Entrepreneurship", "Innovation"
    ];

    private static authorFirstNames = [
        "James", "Mary", "Robert", "Patricia", "John", "Jennifer", "Michael", "Linda", "William", "Elizabeth",
        "David", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Christopher", "Karen",
        "Charles", "Nancy", "Daniel", "Lisa", "Matthew", "Betty", "Anthony", "Helen", "Mark", "Sandra",
        "Donald", "Donna", "Steven", "Carol", "Paul", "Ruth", "Andrew", "Sharon", "Joshua", "Michelle",
        "Kenneth", "Laura", "Kevin", "Sarah", "Brian", "Kimberly", "George", "Deborah", "Timothy", "Dorothy",
        "Ronald", "Lisa", "Jason", "Nancy", "Edward", "Karen", "Jeffrey", "Betty", "Ryan", "Helen",
        "Jacob", "Sandra", "Gary", "Donna", "Nicholas", "Carol", "Eric", "Ruth", "Jonathan", "Sharon"
    ];

    private static authorLastNames = [
        "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
        "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin",
        "Lee", "Perez", "Thompson", "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
        "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen", "Hill", "Flores",
        "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera", "Campbell", "Mitchell", "Carter", "Roberts",
        "Gomez", "Phillips", "Evans", "Turner", "Diaz", "Parker", "Cruz", "Edwards", "Collins", "Reyes"
    ];

    private static userFirstNames = [
        "Alex", "Jamie", "Taylor", "Jordan", "Casey", "Riley", "Morgan", "Avery", "Quinn", "Sage",
        "River", "Phoenix", "Skylar", "Cameron", "Drew", "Blake", "Emery", "Finley", "Hayden", "Indigo",
        "Kai", "Lane", "Max", "Nova", "Ocean", "Parker", "Raven", "Shay", "Tatum", "Urban",
        "Valentina", "Winter", "Xenon", "Yale", "Zara", "Aaron", "Bella", "Caleb", "Diana", "Ethan",
        "Fiona", "Gabriel", "Hannah", "Isaac", "Julia", "Kevin", "Luna", "Mason", "Nora", "Oliver"
    ];

    private static userLastNames = [
        "Anderson", "Brown", "Chen", "Davis", "Edwards", "Foster", "Garcia", "Harris", "Ibrahim", "Jackson",
        "Kumar", "Lopez", "Martinez", "Nielsen", "O'Connor", "Patel", "Quinn", "Rodriguez", "Singh", "Taylor",
        "Upton", "Vasquez", "Wang", "Xavier", "Young", "Zhang", "Abbott", "Bell", "Cooper", "Dixon",
        "Ellis", "Fletcher", "Grant", "Hughes", "Ivanov", "Jenkins", "Kelly", "Lawrence", "Murphy", "Nash"
    ];

    private static domains = [
        "gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "email.com", "mail.com", "inbox.com",
        "company.com", "business.org", "university.edu", "school.edu", "institute.org", "research.org",
        "tech.com", "startup.io", "consulting.biz", "enterprise.net", "solutions.com", "services.org"
    ];

    static generateISBN(): string {
        // Generate a valid-looking ISBN-13
        const prefix = "978";
        const group = Math.floor(Math.random() * 10);
        const publisher = String(Math.floor(Math.random() * 99999)).padStart(5, '0');
        const title = String(Math.floor(Math.random() * 999)).padStart(3, '0');
        const check = Math.floor(Math.random() * 10);

        return `${prefix}-${group}-${publisher}-${title}-${check}`;
    }

    static generateBookTitle(): string {
        const prefix = this.bookTitles[Math.floor(Math.random() * this.bookTitles.length)];
        const subject = this.bookSubjects[Math.floor(Math.random() * this.bookSubjects.length)];

        // Sometimes add edition/volume info
        const addExtra = Math.random() < 0.3;
        if (addExtra) {
            const extras = ["2nd Edition", "3rd Edition", "Volume I", "Volume II", "Revised Edition", "Updated Edition"];
            const extra = extras[Math.floor(Math.random() * extras.length)];
            return `${prefix} ${subject} - ${extra}`;
        }

        return `${prefix} ${subject}`;
    }

    static generateAuthorName(): string {
        const firstName = this.authorFirstNames[Math.floor(Math.random() * this.authorFirstNames.length)];
        const lastName = this.authorLastNames[Math.floor(Math.random() * this.authorLastNames.length)];

        // Sometimes add middle initial
        const addMiddle = Math.random() < 0.4;
        if (addMiddle) {
            const middle = String.fromCharCode(65 + Math.floor(Math.random() * 26));
            return `${firstName} ${middle}. ${lastName}`;
        }

        return `${firstName} ${lastName}`;
    }

    static generateShelf(): string {
        // Generate shelf codes like A1, B2, C3, etc.
        const section = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
        const number = Math.floor(Math.random() * 50) + 1; // 1-50
        const subsection = Math.random() < 0.5 ? String.fromCharCode(65 + Math.floor(Math.random() * 10)) : ''; // Sometimes add A-J

        return `${section}${number}${subsection}`;
    }

    static generateUserName(): string {
        const firstName = this.userFirstNames[Math.floor(Math.random() * this.userFirstNames.length)];
        const lastName = this.userLastNames[Math.floor(Math.random() * this.userLastNames.length)];
        return `${firstName} ${lastName}`;
    }

    static generateEmail(name: string, index: number): string {
        const cleanName = name.toLowerCase().replace(/[^a-z\s]/g, '').replace(/\s+/g, '.');
        const domain = this.domains[Math.floor(Math.random() * this.domains.length)];

        // Add number suffix to ensure uniqueness
        const suffix = Math.floor(index / 1000) > 0 ? Math.floor(index / 1000) : '';

        return `${cleanName}${suffix}@${domain}`;
    }

    static generateRandomDate(startDate: Date, endDate: Date): Date {
        const startTime = startDate.getTime();
        const endTime = endDate.getTime();
        const randomTime = startTime + Math.random() * (endTime - startTime);
        return new Date(randomTime);
    }

    static generateQuantity(): number {
        // Weighted distribution: more books have lower quantities
        const rand = Math.random();
        if (rand < 0.4) return Math.floor(Math.random() * 5) + 1; // 1-5 (40%)
        if (rand < 0.7) return Math.floor(Math.random() * 10) + 6; // 6-15 (30%)
        if (rand < 0.9) return Math.floor(Math.random() * 15) + 16; // 16-30 (20%)
        return Math.floor(Math.random() * 50) + 31; // 31-80 (10%)
    }
}

async function seedBooksInBatches(totalBooks: number) {
    console.log(`\n🔥 Generating ${totalBooks} books...`);

    const booksPerBatch = CONFIG.BATCH_SIZE;
    const totalBatches = Math.ceil(totalBooks / booksPerBatch);

    let totalCreated = 0;
    const usedISBNs = new Set<string>();

    for (let batch = 0; batch < totalBatches; batch++) {
        const booksInThisBatch = Math.min(booksPerBatch, totalBooks - totalCreated);
        const booksData = [];

        for (let i = 0; i < booksInThisBatch; i++) {
            let isbn;
            do {
                isbn = DataGenerator.generateISBN();
            } while (usedISBNs.has(isbn));
            usedISBNs.add(isbn);

            booksData.push({
                isbn,
                title: DataGenerator.generateBookTitle(),
                author: DataGenerator.generateAuthorName(),
                shelf: DataGenerator.generateShelf(),
                total_quantity: DataGenerator.generateQuantity()
            });
        }

        await prisma.book.createMany({ data: booksData, skipDuplicates: true });
        totalCreated += booksInThisBatch;

        if (totalCreated % CONFIG.PROGRESS_INTERVAL === 0) {
            const progress = ((totalCreated / totalBooks) * 100).toFixed(1);
            console.log(`📚 Books: ${totalCreated}/${totalBooks} (${progress}%)`);
        }
    }

    console.log(`✅ Created ${totalCreated} books successfully!`);
    return totalCreated;
}

async function seedUsersInBatches(totalUsers: number) {
    console.log(`\n👥 Generating ${totalUsers} users...`);

    const usersPerBatch = CONFIG.BATCH_SIZE;
    const totalBatches = Math.ceil(totalUsers / usersPerBatch);

    let totalCreated = 0;
    const usedEmails = new Set<string>();

    // Date range for user registrations (last 3 years)
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 3);
    const endDate = new Date();

    for (let batch = 0; batch < totalBatches; batch++) {
        const usersInThisBatch = Math.min(usersPerBatch, totalUsers - totalCreated);
        const usersData = [];

        for (let i = 0; i < usersInThisBatch; i++) {
            const name = DataGenerator.generateUserName();
            let email;
            do {
                email = DataGenerator.generateEmail(name, totalCreated + i);
            } while (usedEmails.has(email));
            usedEmails.add(email);

            usersData.push({
                email,
                name,
                registered_at: DataGenerator.generateRandomDate(startDate, endDate)
            });
        }

        await prisma.user.createMany({ data: usersData, skipDuplicates: true });
        totalCreated += usersInThisBatch;

        if (totalCreated % CONFIG.PROGRESS_INTERVAL === 0) {
            const progress = ((totalCreated / totalUsers) * 100).toFixed(1);
            console.log(`👤 Users: ${totalCreated}/${totalUsers} (${progress}%)`);
        }
    }

    console.log(`✅ Created ${totalCreated} users successfully!`);
    return totalCreated;
}

async function seedBorrowsInBatches(totalBorrows: number) {
    console.log(`\n📖 Generating ${totalBorrows} borrow records...`);

    // Get all user emails and book ISBNs for random selection
    console.log("📋 Fetching users and books for borrow generation...");
    const users = await prisma.user.findMany({ select: { email: true } });
    const books = await prisma.book.findMany({ select: { isbn: true } });

    if (users.length === 0 || books.length === 0) {
        throw new Error("Cannot create borrows: No users or books found in database");
    }

    console.log(`Found ${users.length} users and ${books.length} books`);

    const borrowsPerBatch = CONFIG.BATCH_SIZE;
    const totalBatches = Math.ceil(totalBorrows / borrowsPerBatch);

    let totalCreated = 0;

    // Date ranges for different borrow scenarios
    const now = new Date();
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);

    for (let batch = 0; batch < totalBatches; batch++) {
        const borrowsInThisBatch = Math.min(borrowsPerBatch, totalBorrows - totalCreated);
        const borrowsData = [];

        for (let i = 0; i < borrowsInThisBatch; i++) {
            const userIndex = Math.floor(Math.random() * users.length);
            const bookIndex = Math.floor(Math.random() * books.length);
            const user = users[userIndex];
            const book = books[bookIndex];

            if (!user || !book) {
                console.warn(`Skipping borrow creation: user or book not found at indices ${userIndex}, ${bookIndex}`);
                continue;
            }

            // Generate borrow date (random date in last 3 years)
            const borrowDate = DataGenerator.generateRandomDate(threeYearsAgo, now);

            // Due date is typically 30 days after borrow date
            const dueDate = new Date(borrowDate);
            dueDate.setDate(dueDate.getDate() + 30);

            // Determine if this borrow should be returned
            const borrowScenario = Math.random();
            let returnDate: Date | null = null;

            if (borrowScenario < 0.7) { // 70% of borrows are returned
                if (borrowScenario < 0.5) {
                    // 50% returned on time (before due date)
                    const maxReturnDate = new Date(Math.min(dueDate.getTime(), now.getTime()));
                    returnDate = DataGenerator.generateRandomDate(borrowDate, maxReturnDate);
                } else {
                    // 20% returned late (after due date but before now)
                    const minReturnDate = dueDate;
                    const maxReturnDate = new Date(Math.min(dueDate.getTime() + (15 * 24 * 60 * 60 * 1000), now.getTime())); // Up to 15 days late
                    if (maxReturnDate > minReturnDate) {
                        returnDate = DataGenerator.generateRandomDate(minReturnDate, maxReturnDate);
                    } else {
                        returnDate = null; // Keep as active if logic doesn't work out
                    }
                }
            }
            // 30% are still active (not returned)

            // Only include return_date if the book was actually returned
            const borrowRecord: any = {
                user_email: user.email,
                book_isbn: book.isbn,
                borrow_date: borrowDate,
                due_date: dueDate
            };

            if (returnDate) {
                borrowRecord.return_date = returnDate;
            }

            borrowsData.push(borrowRecord);
        }

        await prisma.borrow.createMany({ data: borrowsData, skipDuplicates: true });
        totalCreated += borrowsInThisBatch;

        if (totalCreated % CONFIG.PROGRESS_INTERVAL === 0) {
            const progress = ((totalCreated / totalBorrows) * 100).toFixed(1);
            console.log(`📚 Borrows: ${totalCreated}/${totalBorrows} (${progress}%)`);
        }
    }

    console.log(`✅ Created ${totalCreated} borrow records successfully!`);
    return totalCreated;
}

async function main() {
    const startTime = Date.now();

    try {
        console.log("🚀 Starting PERFORMANCE database seeding...");
        console.log(`📊 Target: ${CONFIG.BOOKS_COUNT} books, ${CONFIG.USERS_COUNT} users, ${CONFIG.BORROWS_COUNT} borrows`);

        // Clear existing data
        console.log("\n🧹 Clearing existing data...");
        await prisma.borrow.deleteMany();
        await prisma.user.deleteMany();
        await prisma.book.deleteMany();
        console.log("✅ Database cleared successfully!");

        // Seed in optimal order (Books → Users → Borrows)
        await seedBooksInBatches(CONFIG.BOOKS_COUNT);
        await seedUsersInBatches(CONFIG.USERS_COUNT);
        await seedBorrowsInBatches(CONFIG.BORROWS_COUNT);

        // Performance summary
        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000; // seconds

        console.log("\n🎉 PERFORMANCE seeding completed successfully!");
        console.log(`⏱️  Total time: ${duration.toFixed(2)} seconds`);
        console.log(`🚀 Records per second: ${((CONFIG.BOOKS_COUNT + CONFIG.USERS_COUNT + CONFIG.BORROWS_COUNT) / duration).toFixed(0)}`);

        // Final database statistics
        console.log("\n📊 Final Database Statistics:");
        const finalStats = await Promise.all([
            prisma.book.count(),
            prisma.user.count(),
            prisma.borrow.count(),
            prisma.borrow.count({ where: { return_date: null } }),
            prisma.borrow.count({ where: { return_date: null, due_date: { lt: new Date() } } }),
            prisma.borrow.count({ where: { return_date: { not: null } } })
        ]);

        const [totalBooks, totalUsers, totalBorrows, activeBorrows, overdueBorrows, returnedBorrows] = finalStats;

        console.log(`📚 Total Books: ${totalBooks}`);
        console.log(`👥 Total Users: ${totalUsers}`);
        console.log(`📖 Total Borrows: ${totalBorrows}`);
        console.log(`🔄 Active Borrows: ${activeBorrows}`);
        console.log(`⚠️  Overdue Borrows: ${overdueBorrows}`);
        console.log(`✅ Returned Borrows: ${returnedBorrows}`);

        // Database size estimation
        const estimatedSizeMB = Math.round(((totalBooks * 0.2) + (totalUsers * 0.1) + (totalBorrows * 0.15)) * 1024) / 1024;
        console.log(`💾 Estimated DB size: ~${estimatedSizeMB.toFixed(1)} MB`);

        console.log("\n🎯 Performance testing data ready!");
    } catch (error) {
        console.error("❌ Error during performance seeding:", error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

main();