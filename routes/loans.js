const express = require('express');

function parsePositiveId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function createLoansRouter(db) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      res.json(await db.all('SELECT * FROM loans ORDER BY loan_id'));
    } catch (error) {
      next(error);
    }
  });

  router.get('/details', async (req, res, next) => {
    try {
      const loans = await db.all(`
        SELECT loans.loan_id,
               readers.reader_id,
               readers.reader_name,
               books.book_id,
               books.book_name,
               loans.borrow_date,
               loans.return_date,
               loans.status
        FROM loans
        JOIN readers ON loans.reader_id = readers.reader_id
        JOIN books ON loans.book_id = books.book_id
        ORDER BY loans.loan_id
      `);
      res.json(loans);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    const loanId = parsePositiveId(req.params.id);
    if (loanId === null) {
      return res.status(400).json({ error: 'Loan ID must be a positive integer' });
    }

    try {
      const loan = await db.get('SELECT * FROM loans WHERE loan_id = ?', loanId);
      if (!loan) return res.status(404).json({ error: 'Loan not found' });
      res.json(loan);
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    const readerId = parsePositiveId(req.body && req.body.reader_id);
    if (readerId === null) {
      return res.status(400).json({
        error: 'reader_id is required and must be a positive integer'
      });
    }

    const bookId = parsePositiveId(req.body && req.body.book_id);
    if (bookId === null) {
      return res.status(400).json({
        error: 'book_id is required and must be a positive integer'
      });
    }

    try {
      const reader = await db.get(
        'SELECT reader_id FROM readers WHERE reader_id = ?',
        readerId
      );
      if (!reader) return res.status(400).json({ error: 'Reader does not exist' });

      const book = await db.get(
        'SELECT book_id FROM books WHERE book_id = ?',
        bookId
      );
      if (!book) return res.status(400).json({ error: 'Book does not exist' });

      const result = await db.run(
        `INSERT INTO loans (reader_id, book_id, borrow_date, return_date, status)
         VALUES (?, ?, date('now'), NULL, 'BORROWED')`,
        readerId,
        bookId
      );
      res.status(201).json(
        await db.get('SELECT * FROM loans WHERE loan_id = ?', result.lastID)
      );
    } catch (error) {
      next(error);
    }
  });

  async function returnLoan(req, res, next) {
    const loanId = parsePositiveId(req.params.id);
    if (loanId === null) {
      return res.status(400).json({ error: 'Loan ID must be a positive integer' });
    }

    try {
      const loan = await db.get('SELECT * FROM loans WHERE loan_id = ?', loanId);
      if (!loan) return res.status(404).json({ error: 'Loan not found' });
      if (loan.status !== 'BORROWED') {
        return res.status(409).json({ error: 'Loan has already been returned' });
      }

      const result = await db.run(
        "UPDATE loans SET status = 'RETURNED', return_date = date('now') " +
        "WHERE loan_id = ? AND status = 'BORROWED'",
        loanId
      );
      if (!result.changes) {
        const currentLoan = await db.get(
          'SELECT loan_id FROM loans WHERE loan_id = ?',
          loanId
        );
        if (!currentLoan) return res.status(404).json({ error: 'Loan not found' });
        return res.status(409).json({ error: 'Loan has already been returned' });
      }

      res.json(await db.get('SELECT * FROM loans WHERE loan_id = ?', loanId));
    } catch (error) {
      next(error);
    }
  }

  router.put('/:id/return', returnLoan);
  router.patch('/:id/return', returnLoan);

  router.delete('/:id', async (req, res, next) => {
    const loanId = parsePositiveId(req.params.id);
    if (loanId === null) {
      return res.status(400).json({ error: 'Loan ID must be a positive integer' });
    }

    try {
      const result = await db.run('DELETE FROM loans WHERE loan_id = ?', loanId);
      if (!result.changes) return res.status(404).json({ error: 'Loan not found' });
      res.json({ message: 'Loan deleted successfully' });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = createLoansRouter;
