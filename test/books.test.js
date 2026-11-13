const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');
const connectDatabase = require('../database');
const { createApp } = require('../app');

let db;
let server;
let baseUrl;
let tempDir;

test.before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pageturn-books-test-'));
  db = await connectDatabase(path.join(tempDir, 'test.db'));
  server = createApp(db).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (db) await db.close();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
});

test.beforeEach(async () => {
  await db.exec(
    'DELETE FROM loans; DELETE FROM books; DELETE FROM readers; ' +
    "DELETE FROM sqlite_sequence WHERE name IN ('loans', 'books', 'readers')"
  );
});

async function request(route, { method = 'GET', body } = {}) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };

  if (body !== undefined) options.body = JSON.stringify(body);
  return fetch(`${baseUrl}${route}`, options);
}

async function addBook(overrides = {}) {
  const response = await request('/books', {
    method: 'POST',
    body: {
      book_name: 'Atomic Habits',
      author: 'James Clear',
      genre: 'Self-help',
      ...overrides
    }
  });
  assert.equal(response.status, 201);
  return response.json();
}

test('POST /books creates a trimmed book', async () => {
  const response = await request('/books', {
    method: 'POST',
    body: {
      book_name: '  Atomic Habits  ',
      author: '  James Clear ',
      genre: ' Self-help  '
    }
  });

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    book_id: 1,
    book_name: 'Atomic Habits',
    author: 'James Clear',
    genre: 'Self-help'
  });
});

test('POST /books rejects a missing book name', async () => {
  const response = await request('/books', {
    method: 'POST',
    body: { author: 'James Clear', genre: 'Self-help' }
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /book_name/i);
});

test('POST /books rejects a missing author', async () => {
  const response = await request('/books', {
    method: 'POST',
    body: { book_name: 'Atomic Habits', genre: 'Self-help' }
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /author/i);
});

test('POST /books rejects a missing genre', async () => {
  const response = await request('/books', {
    method: 'POST',
    body: { book_name: 'Atomic Habits', author: 'James Clear' }
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /genre/i);
});

test('POST /books rejects blank, whitespace-only, and non-string values', async () => {
  const invalidBodies = [
    { book_name: '', author: 'James Clear', genre: 'Self-help' },
    { book_name: '   ', author: 'James Clear', genre: 'Self-help' },
    { book_name: 'Atomic Habits', author: '  ', genre: 'Self-help' },
    { book_name: 'Atomic Habits', author: 'James Clear', genre: '\t ' },
    { book_name: 42, author: 'James Clear', genre: 'Self-help' }
  ];

  for (const body of invalidBodies) {
    const response = await request('/books', { method: 'POST', body });
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
});

test('GET /books returns an empty array when there are no books', async () => {
  const response = await request('/books');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test('GET /books returns all stored books', async () => {
  const firstBook = await addBook();
  const secondBook = await addBook({
    book_name: 'Dune',
    author: 'Frank Herbert',
    genre: 'Science Fiction'
  });

  const response = await request('/books');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [firstBook, secondBook]);
});

test('GET /books filters by genre without regard to case', async () => {
  const fictionBook = await addBook({ genre: 'Fiction' });
  await addBook({ book_name: 'Dune', author: 'Frank Herbert', genre: 'Science Fiction' });

  const response = await request('/books?genre=fIcTiOn');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [fictionBook]);
});

test('GET /books trims spaces around genre and book-name search values', async () => {
  const book = await addBook({ book_name: 'The Alchemist', genre: 'Fiction' });

  const genreResponse = await request('/books?genre=%20Fiction%20');
  assert.equal(genreResponse.status, 200);
  assert.deepEqual(await genreResponse.json(), [book]);

  const searchResponse = await request('/books?search=%20alchemist%20');
  assert.equal(searchResponse.status, 200);
  assert.deepEqual(await searchResponse.json(), [book]);
});

test('GET /books returns an empty array when no genre matches', async () => {
  await addBook({ genre: 'Fiction' });

  const response = await request('/books?genre=Nonfiction');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test('GET /books combines genre and book-name search filters', async () => {
  const matchingBook = await addBook({ book_name: 'The Alchemist', genre: 'Fiction' });
  await addBook({ book_name: 'The Alchemist', genre: 'Adventure' });
  await addBook({ book_name: 'Dune', genre: 'Fiction' });

  const response = await request('/books?genre=Fiction&search=alchemist');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [matchingBook]);
});

test('GET /books ignores empty query values and rejects repeated values', async () => {
  const firstBook = await addBook();
  const secondBook = await addBook({ book_name: 'Dune', author: 'Frank Herbert' });

  const emptyGenreResponse = await request('/books?genre=%20%20');
  assert.equal(emptyGenreResponse.status, 200);
  assert.deepEqual(await emptyGenreResponse.json(), [firstBook, secondBook]);

  const emptySearchResponse = await request('/books?search=%20%20');
  assert.equal(emptySearchResponse.status, 200);
  assert.deepEqual(await emptySearchResponse.json(), [firstBook, secondBook]);

  const repeatedValueResponse = await request('/books?genre=Fiction&genre=Fantasy');
  assert.equal(repeatedValueResponse.status, 400);
  assert.match((await repeatedValueResponse.json()).error, /genre/i);
});

test('GET /books/:id returns a matching book and validates its ID', async () => {
  const book = await addBook();

  const response = await request(`/books/${book.book_id}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), book);

  const invalidIdResponse = await request('/books/not-a-number');
  assert.equal(invalidIdResponse.status, 400);
});

test('GET /books/:id returns 404 when the book does not exist', async () => {
  const response = await request('/books/999');

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Book not found' });
});

test('PUT /books/:id updates a book and trims its fields', async () => {
  const book = await addBook();

  const response = await request(`/books/${book.book_id}`, {
    method: 'PUT',
    body: {
      book_name: '  Deep Work ',
      author: ' Cal Newport  ',
      genre: ' Productivity '
    }
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ...book,
    book_name: 'Deep Work',
    author: 'Cal Newport',
    genre: 'Productivity'
  });
});

test('PUT /books/:id rejects missing or blank update fields', async () => {
  const book = await addBook();
  const invalidBodies = [
    { author: 'James Clear', genre: 'Self-help' },
    { book_name: 'Atomic Habits', genre: 'Self-help' },
    { book_name: 'Atomic Habits', author: 'James Clear' },
    { book_name: ' ', author: 'James Clear', genre: 'Self-help' },
    { book_name: 'Atomic Habits', author: '\t', genre: 'Self-help' },
    { book_name: 'Atomic Habits', author: 'James Clear', genre: '  ' }
  ];

  for (const body of invalidBodies) {
    const response = await request(`/books/${book.book_id}`, { method: 'PUT', body });
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
});

test('PUT /books/:id returns 404 when the book does not exist', async () => {
  const response = await request('/books/999', {
    method: 'PUT',
    body: { book_name: 'Deep Work', author: 'Cal Newport', genre: 'Productivity' }
  });

  assert.equal(response.status, 404);
});

test('DELETE /books/:id deletes a book and returns 404 for a missing book', async () => {
  const book = await addBook();

  const deleteResponse = await request(`/books/${book.book_id}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(await deleteResponse.json(), { message: 'Book deleted successfully' });

  const getResponse = await request(`/books/${book.book_id}`);
  assert.equal(getResponse.status, 404);

  const missingResponse = await request('/books/999', { method: 'DELETE' });
  assert.equal(missingResponse.status, 404);

  const invalidIdResponse = await request('/books/invalid', { method: 'DELETE' });
  assert.equal(invalidIdResponse.status, 400);
});

test('DELETE /books/:id returns 409 when a loan refers to the book', async () => {
  const readerResponse = await request('/readers', {
    method: 'POST',
    body: { reader_name: 'Borrowing Reader', email: 'borrower@example.com' }
  });
  assert.equal(readerResponse.status, 201);
  const reader = await readerResponse.json();
  const book = await addBook();

  const loanResponse = await request('/loans', {
    method: 'POST',
    body: { reader_id: reader.reader_id, book_id: book.book_id }
  });
  assert.equal(loanResponse.status, 201);

  const response = await request(`/books/${book.book_id}`, { method: 'DELETE' });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /loans/i);
});

test('GET /books/summary returns an empty array when there are no books', async () => {
  const response = await request('/books/summary');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test('GET /books/summary returns SQL genre counts', async () => {
  await addBook({ genre: 'Fiction' });
  await addBook({ book_name: 'The Alchemist', author: 'Paulo Coelho', genre: 'Fiction' });
  await addBook({ book_name: 'Dune', author: 'Frank Herbert', genre: 'Science Fiction' });

  const response = await request('/books/summary');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [
    { genre: 'Fiction', book_count: 2 },
    { genre: 'Science Fiction', book_count: 1 }
  ]);
});

test('database initialization adds author to an existing books table', async () => {
  const legacyFilename = path.join(tempDir, 'legacy.db');

  await new Promise((resolve, reject) => {
    const legacyDb = new sqlite3.Database(legacyFilename);
    legacyDb.exec(
      'CREATE TABLE books (' +
      'book_id INTEGER PRIMARY KEY AUTOINCREMENT, ' +
      'book_name TEXT NOT NULL, genre TEXT NOT NULL); ' +
      "INSERT INTO books (book_name, genre) VALUES ('Old Book', 'Classic')",
      (error) => {
        legacyDb.close((closeError) => {
          if (error) return reject(error);
          if (closeError) return reject(closeError);
          resolve();
        });
      }
    );
  });

  const legacyDb = await connectDatabase(legacyFilename);
  try {
    const book = await legacyDb.get('SELECT * FROM books WHERE book_id = 1');
    assert.equal(book.author, 'Unknown');
  } finally {
    await legacyDb.close();
  }
});
