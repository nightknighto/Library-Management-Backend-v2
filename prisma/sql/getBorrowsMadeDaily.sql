-- how many borrows made daily
SELECT DATE(borrow_date),
	CAST(COUNT(*) AS INT) AS borrows_made
FROM borrows
where borrow_date > $1
GROUP BY DATE(borrow_date)
