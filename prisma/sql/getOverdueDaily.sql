SELECT DATE(borrow_date), CAST(COUNT(*) AS INT) AS due_count
FROM borrows
WHERE borrow_date > $1 AND
	return_date IS NULL AND due_date < CURRENT_TIMESTAMP
GROUP BY DATE(borrow_date)