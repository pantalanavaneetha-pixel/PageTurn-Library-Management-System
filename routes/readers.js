const express = require('express');

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateReader(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object' };
  }

  const { reader_name, email } = body;

  if (typeof reader_name !== 'string' || !reader_name.trim()) {
    return { error: 'reader_name is required and cannot be empty' };
  }

  if (typeof email !== 'string' || !email.trim()) {
    return { error: 'email is required and cannot be empty' };
  }

  const trimmedEmail = email.trim();
  if (!emailPattern.test(trimmedEmail)) {
    return { error: 'email must be a valid email address' };
  }

  return {
    reader_name: reader_name.trim(),
    email: trimmedEmail
  };
}

function isValidReaderId(id) {
  return /^[1-9]\d*$/.test(id) && Number.isSafeInteger(Number(id));
}

function handleDatabaseError(error, res, next) {
  const message = typeof error.message === 'string' ? error.message : '';
  const isUniqueEmailError = error.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
    (error.code === 'SQLITE_CONSTRAINT' &&
      message.includes('UNIQUE constraint failed: readers.email'));
  if (isUniqueEmailError) {
    return res.status(409).json({ error: 'A reader with this email already exists' });
  }

  const isReaderForeignKeyError = error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' ||
    (error.code === 'SQLITE_CONSTRAINT' &&
      message.includes('FOREIGN KEY constraint failed'));
  if (isReaderForeignKeyError) {
    return res.status(409).json({
      error: 'This reader cannot be deleted because existing loans refer to them'
    });
  }

  next(error);
}

function createReadersRouter(db) {
  const router = express.Router();

  router.get('/', async (req, res, next) => {
    try {
      res.json(await db.all('SELECT * FROM readers ORDER BY reader_id'));
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req, res, next) => {
    if (!isValidReaderId(req.params.id)) {
      return res.status(400).json({ error: 'Reader ID must be a positive integer' });
    }

    try {
      const reader = await db.get(
        'SELECT * FROM readers WHERE reader_id = ?',
        Number(req.params.id)
      );
      if (!reader) return res.status(404).json({ error: 'Reader not found' });
      res.json(reader);
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req, res, next) => {
    const reader = validateReader(req.body);
    if (reader.error) return res.status(400).json({ error: reader.error });

    try {
      const result = await db.run(
        'INSERT INTO readers (reader_name, email) VALUES (?, ?)',
        reader.reader_name,
        reader.email
      );
      res.status(201).json(
        await db.get('SELECT * FROM readers WHERE reader_id = ?', result.lastID)
      );
    } catch (error) {
      handleDatabaseError(error, res, next);
    }
  });

  router.put('/:id', async (req, res, next) => {
    if (!isValidReaderId(req.params.id)) {
      return res.status(400).json({ error: 'Reader ID must be a positive integer' });
    }

    const reader = validateReader(req.body);
    if (reader.error) return res.status(400).json({ error: reader.error });

    try {
      const result = await db.run(
        'UPDATE readers SET reader_name = ?, email = ? WHERE reader_id = ?',
        reader.reader_name,
        reader.email,
        Number(req.params.id)
      );
      if (!result.changes) return res.status(404).json({ error: 'Reader not found' });

      res.json(
        await db.get('SELECT * FROM readers WHERE reader_id = ?', Number(req.params.id))
      );
    } catch (error) {
      handleDatabaseError(error, res, next);
    }
  });

  router.delete('/:id', async (req, res, next) => {
    if (!isValidReaderId(req.params.id)) {
      return res.status(400).json({ error: 'Reader ID must be a positive integer' });
    }

    try {
      const result = await db.run(
        'DELETE FROM readers WHERE reader_id = ?',
        Number(req.params.id)
      );
      if (!result.changes) return res.status(404).json({ error: 'Reader not found' });
      res.json({ message: 'Reader deleted successfully' });
    } catch (error) {
      handleDatabaseError(error, res, next);
    }
  });

  return router;
}

module.exports = createReadersRouter;
