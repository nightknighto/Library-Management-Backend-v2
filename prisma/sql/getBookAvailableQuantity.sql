SELECT books.*, CAST(books.total_quantity - COUNT(borrows.id) AS INT) AS "available_quantity"
FROM books
LEFT JOIN borrows ON books.isbn = borrows.book_isbn AND borrows.return_date IS NULL
WHERE books.isbn = $1
GROUP BY books.isbn