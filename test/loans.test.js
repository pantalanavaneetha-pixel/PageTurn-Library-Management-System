const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const connectDatabase = require('../database');
const { createApp } = require('../app');

let db;
let server;
let baseUrl;
let tempDir;

test.before(async () => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pageturn-loans-test-'));
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

async function addReader() {
  const response = await request('/readers', {
    method: 'POST',
    body: { reader_name: 'Asha', email: 'asha@example.com' }
  });
  assert.equal(response.status, 201);
  return response.json();
}

async function addBook() {
  const response = await request('/books', {
    method: 'POST',
    body: {
      book_name: 'The Hobbit',
      author: 'J. R. R. Tolkien',
      genre: 'Fantasy'
    }
  });
  assert.equal(response.status, 201);
  return response.json();
}

async function addLoan(readerId, bookId) {
  const response = await request('/loans', {
    method: 'POST',
    body: { reader_id: readerId, book_id: bookId }
  });
  assert.equal(response.status, 201);
  return response.json();
}

test('POST /loans creates a borrowed loan with automatic dates', async () => {
  const reader = await addReader();
  const book = await addBook();

  const response = await request('/loans', {
    method: 'POST',
    body: { reader_id: reader.reader_id, book_id: book.book_id }
  });

  assert.equal(response.status, 201);
  const loan = await response.json();
  assert.equal(loan.loan_id, 1);
  assert.equal(loan.reader_id, reader.reader_id);
  assert.equal(loan.book_id, book.book_id);
  assert.match(loan.borrow_date, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(loan.return_date, null);
  assert.equal(loan.status, 'BORROWED');
});

test('POST /loans rejects a missing reader ID', async () => {
  const response = await request('/loans', {
    method: 'POST',
    body: { book_id: 1 }
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /reader_id/i);
});

test('POST /loans rejects a missing book ID', async () => {
  const response = await request('/loans', {
    method: 'POST',
    body: { reader_id: 1 }
  });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /book_id/i);
});

test('POST /loans rejects invalid IDs', async () => {
  const response = await request('/loans', {
    method: 'POST',
    body: { reader_id: -1, book_id: 'not-an-id' }
  });

  assert.equal(response.status, 400);
});

test('POST /loans returns 400 when the reader does not exist', async () => {
  const book = await addBook();

  const response = await request('/loans', {
    method: 'POST',
    body: { reader_id: 999, book_id: book.book_id }
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Reader does not exist' });
});

test('POST /loans returns 400 when the book does not exist', async () => {
  const reader = await addReader();

  const response = await request('/loans', {
    method: 'POST',
    body: { reader_id: reader.reader_id, book_id: 999 }
  });

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: 'Book does not exist' });
});

test('GET /loans returns an empty array when there are no loans', async () => {
  const response = await request('/loans');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test('GET /loans returns all loans', async () => {
  const reader = await addReader();
  const book = await addBook();
  const firstLoan = await addLoan(reader.reader_id, book.book_id);
  const secondLoan = await addLoan(reader.reader_id, book.book_id);

  const response = await request('/loans');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [firstLoan, secondLoan]);
});

test('GET /loans/:id returns a loan and validates the ID', async () => {
  const reader = await addReader();
  const book = await addBook();
  const loan = await addLoan(reader.reader_id, book.book_id);

  const response = await request(`/loans/${loan.loan_id}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), loan);

  const invalidIdResponse = await request('/loans/not-an-id');
  assert.equal(invalidIdResponse.status, 400);

  const invalidReturnIdResponse = await request('/loans/not-an-id/return', {
    method: 'PUT'
  });
  assert.equal(invalidReturnIdResponse.status, 400);

  const invalidDeleteIdResponse = await request('/loans/not-an-id', {
    method: 'DELETE'
  });
  assert.equal(invalidDeleteIdResponse.status, 400);
});

test('GET /loans/:id returns 404 when the loan does not exist', async () => {
  const response = await request('/loans/999');

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Loan not found' });
});

test('PUT /loans/:id/return sets status and return date', async () => {
  const reader = await addReader();
  const book = await addBook();
  const loan = await addLoan(reader.reader_id, book.book_id);
  const today = await db.get("SELECT date('now') AS today");

  const response = await request(`/loans/${loan.loan_id}/return`, { method: 'PUT' });

  assert.equal(response.status, 200);
  const returnedLoan = await response.json();
  assert.equal(returnedLoan.status, 'RETURNED');
  assert.equal(returnedLoan.return_date, today.today);
});

test('PUT /loans/:id/return returns 404 when the loan does not exist', async () => {
  const response = await request('/loans/999/return', { method: 'PUT' });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Loan not found' });
});

test('PUT /loans/:id/return rejects an already-returned loan', async () => {
  const reader = await addReader();
  const book = await addBook();
  const loan = await addLoan(reader.reader_id, book.book_id);

  const firstResponse = await request(`/loans/${loan.loan_id}/return`, { method: 'PUT' });
  assert.equal(firstResponse.status, 200);

  const secondResponse = await request(`/loans/${loan.loan_id}/return`, { method: 'PUT' });
  assert.equal(secondResponse.status, 409);
  assert.match((await secondResponse.json()).error, /already been returned/i);
});

test('PATCH /loans/:id/return remains supported', async () => {
  const reader = await addReader();
  const book = await addBook();
  const loan = await addLoan(reader.reader_id, book.book_id);

  const response = await request(`/loans/${loan.loan_id}/return`, { method: 'PATCH' });

  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, 'RETURNED');
});

test('DELETE /loans/:id deletes a loan and returns 404 when it does not exist', async () => {
  const reader = await addReader();
  const book = await addBook();
  const loan = await addLoan(reader.reader_id, book.book_id);

  const deleteResponse = await request(`/loans/${loan.loan_id}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(await deleteResponse.json(), { message: 'Loan deleted successfully' });

  const missingResponse = await request('/loans/999', { method: 'DELETE' });
  assert.equal(missingResponse.status, 404);
});

test('GET /loans/details returns an empty array when there are no loans', async () => {
  const response = await request('/loans/details');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test('GET /loans/details joins loan, reader, and book fields', async () => {
  const reader = await addReader();
  const book = await addBook();
  const loan = await addLoan(reader.reader_id, book.book_id);

  const response = await request('/loans/details');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [{
    loan_id: loan.loan_id,
    reader_id: reader.reader_id,
    reader_name: reader.reader_name,
    book_id: book.book_id,
    book_name: book.book_name,
    borrow_date: loan.borrow_date,
    return_date: null,
    status: 'BORROWED'
  }]);
});
