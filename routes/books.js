const express = require('express');

const requiredBookFields = ['book_name', 'author', 'genre'];

function validateBook(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }

  const book = {};
  for (const field of requiredBookFields) {
    if (typeof body[field] !== 'string' || !body[field].trim()) {
      return { error: `${field} is required and cannot be empty` };
    }
    book[field] = body[field].trim();
  }

  return book;
}

function isValidBookId(id) {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
}

function handleBookDatabaseError(error, res, next) {
  const message = typeof error.message === 'string' ? error.message : '';
  const isForeignKeyError = error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ||
    (error.code === 'SQLITE_CONSTRAINT' && message.includes('FOREIGN KEY constraint failed'));

  if (isForeignKeyError) {
    return res.status(409).json({
      error: 'This book cannot be deleted because existing loans refer to it'
    });
  }

  next(error);
}

function createBooksRouter(db) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    const { genre, search } = req.query;
    if (genre !== undefined && typeof genre !== 'string') {
      return res.status(400).json({ error: 'genre must be a single string' });
    }
    if (search !== undefined && typeof search !== 'string') {
      return res.status(400).json({ error: 'search must be a single string' });
    }

    const genreFilter = genre ? genre.trim() : '';
    const searchTerm = search ? search.trim() : '';

    try {
      let sql = 'SELECT * FROM books';
      const conditions = [];
      const params = [];

      if (genreFilter) {
        conditions.push('LOWER(genre) = LOWER(?)');
        params.push(genreFilter);
      }
      if (searchTerm) {
        conditions.push('LOWER(book_name) LIKE LOWER(?)');
        params.push(`%${searchTerm}%`);
      }
      if (conditions.length) sql += ` WHERE ${conditions.join(' AND ')}`;
      sql += ' ORDER BY book_id';

      res.json(await db.all(sql, params));
    } catch (error) {
      next(error);
    }
  });

  router.get('/summary', async (req, res, next) => {
    try {
      const summary = await db.all(
        'SELECT genre, COUNT(*) AS book_count FROM books GROUP BY genre ORDER BY genre'
      );
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    if (!isValidBookId(req.params.id)) {
      return res.status(400).json({ error: 'Book ID must be a positive integer' });
    }

    try {
      const book = await db.get(
        'SELECT * FROM books WHERE book_id = ?',
        Number(req.params.id)
      );
      if (!book) return res.status(404).json({ error: 'Book not found' });
      res.json(book);
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    const book = validateBook(req.body);
    if (book.error) return res.status(400).json({ error: book.error });

    try {
      const result = await db.run(
        'INSERT INTO books (book_name, author, genre) VALUES (?, ?, ?)',
        book.book_name,
        book.author,
        book.genre
      );
      res.status(201).json(
        await db.get('SELECT * FROM books WHERE book_id = ?', result.lastID)
      );
    } catch (error) {
      next(error);
    }
  });

  router.put('/:id', async (req, res, next) => {
    if (!isValidBookId(req.params.id)) {
      return res.status(400).json({ error: 'Book ID must be a positive integer' });
    }

    const book = validateBook(req.body);
    if (book.error) return res.status(400).json({ error: book.error });

    try {
      const result = await db.run(
        'UPDATE books SET book_name = ?, author = ?, genre = ? WHERE book_id = ?',
        book.book_name,
        book.author,
        book.genre,
        Number(req.params.id)
      );
      if (!result.changes) return res.status(404).json({ error: 'Book not found' });

      res.json(
        await db.get('SELECT * FROM books WHERE book_id = ?', Number(req.params.id))
      );
    } catch (error) {
      next(error);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    if (!isValidBookId(req.params.id)) {
      return res.status(400).json({ error: 'Book ID must be a positive integer' });
    }

    try {
      const result = await db.run(
        'DELETE FROM books WHERE book_id = ?',
        Number(req.params.id)
      );
      if (!result.changes) return res.status(404).json({ error: 'Book not found' });
      res.json({ message: 'Book deleted successfully' });
    } catch (error) {
      handleBookDatabaseError(error, res, next);
    }
  });

  return router;
}

module.exports = createBooksRouter;
