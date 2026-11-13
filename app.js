const express = require('express');
const connectDatabase = require('./database');
const createReadersRouter = require('./routes/readers');
const createBooksRouter = require('./routes/books');
const createLoansRouter = require('./routes/loans');

function createApp(db) {
  const app = express();
  app.use(express.json());

  app.get('/', (req, res) => {
    res.json({ message: 'PageTurn Library API is running' });
  });

  app.use('/readers', createReadersRouter(db));
  app.use('/books', createBooksRouter(db));
  app.use('/loans', createLoansRouter(db));

  // Consistent JSON error responses
  app.use((err, req, res, next) => {
    if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'A record with this unique value already exists' });
    }
    if (err && err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return res.status(409).json({ error: 'This record is linked to another record and cannot be deleted' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

async function startServer() {
  const db = await connectDatabase();
  const app = createApp(db);
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`PageTurn Library API running at http://localhost:${port}`));
}

if (require.main === module) {
  startServer().catch((err) => {
    console.error('Could not start the server:', err.message);
    process.exit(1);
  });
}

module.exports = { createApp };
