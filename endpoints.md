
## API Endpoints

Base URL: `/api/v1`

### Authentication
Some endpoints require authentication. Include the JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

### Books Endpoints

#### POST `/api/v1/books`
Create a new book
- **Input**: 
  ```json
  {
    "isbn": "string",
    "title": "string", 
    "author": "string",
    "shelf": "string",
    "total_quantity": number
  }
  ```
- **Output**: `{ "message": "Book created successfully" }`
- **Errors**: `400` if ISBN already exists

#### GET `/api/v1/books`
Get all books with optional search and pagination
- **Query Params**: `title?`, `author?`, `isbn?`, `page?`, `limit?`
- **Output**: Array of book objects
- **Example**: `/api/v1/books?title=Harry&page=1&limit=10`

#### GET `/api/v1/books/:isbn`
Get a specific book by ISBN
- **Output**: Book object or `404` if not found

#### PUT `/api/v1/books/:isbn`
Update a book (rate limited)
- **Input**: 
  ```json
  {
    "title": "string",
    "author": "string", 
    "shelf": "string",
    "total_quantity": number
  }
  ```
- **Output**: Updated book object or `404` if not found

#### DELETE `/api/v1/books/:isbn`
Delete a book
- **Output**: `{ "message": "Book deleted successfully" }` or `404` if not found

### Users Endpoints

#### POST `/api/v1/users/register`
Register a new user
- **Input**: 
  ```json
  {
    "email": "string",
    "name": "string"
  }
  ```
- **Output**: `{ "message": "User registered successfully" }`
- **Errors**: `400` if email already exists

#### POST `/api/v1/users/login`
Login user
- **Input**: 
  ```json
  {
    "email": "string"
  }
  ```
- **Output**: `{ "token": "jwt-token" }`
- **Errors**: `404` if user not found

#### GET `/api/v1/users`
Get all users with pagination
- **Query Params**: `page?`, `limit?`
- **Output**: Array of user objects
- **Example**: `/api/v1/users?page=1&limit=20`

#### PUT `/api/v1/users`
Update current user (requires authentication, rate limited)
- **Input**: 
  ```json
  {
    "name": "string"
  }
  ```
- **Output**: Updated user object or `404` if not found

#### DELETE `/api/v1/users/:email`
Delete a user by email
- **Output**: `{ "message": "User deleted successfully" }` or `404` if not found

#### GET `/api/v1/users/borrows`
Get current user's borrowed books (requires authentication)
- **Output**: 
  ```json
  {
    "email": "string",
    "name": "string",
    "activeBorrows": [
      {
        "bookTitle": "string",
        "due_date": "date",
        "status": "On Time" | "Overdue"
      }
    ]
  }
  ```

### Borrowing Endpoints

#### POST `/api/v1/borrows/borrow/:isbn`
Borrow a book (requires authentication)
- **Output**: `{ "message": "Book borrowed successfully" }`
- **Errors**: 
  - `400` if book not available
  - `400` if user already has this book borrowed

#### POST `/api/v1/borrows/return/:isbn`
Return a book (requires authentication)
- **Output**: `{ "message": "Book returned successfully" }`
- **Errors**: `400` if no active borrow record found

#### GET `/api/v1/borrows/due`
Get overdue books with pagination
- **Query Params**: `page?`, `limit?`
- **Output**: 
  ```json
  [
    {
      "userEmail": "string",
      "bookTitle": "string", 
      "due_date": "date",
      "bookIsbn": "string"
    }
  ]
  ```

### Statistics Endpoints

#### GET `/api/v1/stats/borrows`
Get borrowing statistics
- **Query Params**: `from?` (date), `format?` (json|csv)
- **Output**: 
  ```json
  {
    "borrows": "daily_borrow_stats",
    "returns": "daily_return_stats", 
    "mostPopularBooks": "popular_books_data",
    "mostBorrowingUsers": "active_users_data"
  }
  ```
- **CSV Output**: Downloads CSV file when `format=csv`

#### GET `/api/v1/stats/overdue`
Get overdue statistics
- **Query Params**: `from?` (date), `format?` (json|csv)
- **Output**: 
  ```json
  {
    "overdue": "daily_overdue_stats",
    "mostOverdueUsers": "overdue_users_data"
  }
  ```
- **CSV Output**: Downloads CSV file when `format=csv`

### Rate Limiting
Some endpoints have rate limiting enabled to prevent abuse:
- PUT `/api/v1/books/:isbn`
- PUT `/api/v1/users`

### Error Responses
All endpoints may return standard HTTP error codes:
- `400` - Bad Request (validation errors, business logic errors)
- `401` - Unauthorized (missing or invalid authentication)
- `404` - Not Found (resource doesn't exist)
- `429` - Too Many Requests (rate limit exceeded)
- `500` - Internal Server Error


