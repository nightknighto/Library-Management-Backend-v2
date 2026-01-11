-- most borrowing users
SELECT CAST(COUNT(*) AS INT), users.email
FROM users
JOIN borrows ON borrows.user_email = users.email
WHERE borrow_date > $1
GROUP BY users.email
ORDER BY COUNT(*) DESC
LIMIT 5