# Library Management System Backend

## Features

Books
- Add a book with details like title, author, ISBN, available quantity, and shelf location.
- Update a book’s details.
- Delete a book.
- List all books.
- Search for a book by title, author, or ISBN.

Borrowers:
- Register a borrower with details like name, email, and registered date (Keep the user
details as simple as possible).
- Update borrower’s details.
- Delete a borrower.
- List all borrowers.

Borrowing Process:
- A borrower can check out a book. The system should keep track of which books are
checked out and by whom.
- A borrower can return a book.
- A borrower can check the books they currently have.
- The system should keep track of due dates for the books and list books that are overdue.

Bonus Features:
1. The system can show analytical reports of the borrowing process in a specific period and
export the borrowing process data in CSV and JSON formats.
2. Exports all overdue borrows of the last month.
3. Exports all borrowing processes of the last month.
4. Implement rate limiting in some endpoints to prevent abuse.
5. Implement very basic authentication for the API.
6. Add unit tests for one module

## Database Schema

![Database Schema](./docs/database.png)

The database schema is defined using Prisma ORM.

The draw.io file used is here: [database.drawio](./docs/database.drawio)

## Endpoint Documentation

Endpoints are documented in this Excalidraw file: [API Documentation](./docs/endpoints.excalidraw)

![API Documentation](./docs/endpoints.png)

For detailed endpoint documentation, refer to [endpoints.md](./endpoints.md)

## Development

The project uses a local SQLite database (no external server required).

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Generate the Prisma client, create the SQLite database, and seed it:

   ```bash
   pnpm prisma:generate
   pnpm prisma:push
   pnpm prisma:seed
   ```

3. Start the dev server:

   ```bash
   pnpm dev
   ```

### Testing

Run tests with:

```bash
npm test
```