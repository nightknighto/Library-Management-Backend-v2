-- how many returns made daily
SELECT DATE(return_date),
	CAST(COUNT(*) AS INT) AS return_count
FROM borrows
where return_date > $1
GROUP BY DATE(return_date)