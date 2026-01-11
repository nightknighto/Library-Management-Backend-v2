-- most popular books in specific period
SELECT CAST(COUNT(*) AS INT), books.title
FROM books
JOIN borrows ON borrows.book_isbn = books.isbn
WHERE borrow_date > $1
GROUP BY books.isbn
ORDER BY COUNT(*) DESC
LIMIT 5