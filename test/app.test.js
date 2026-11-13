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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pageturn-test-'));
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

async function request(route, options = {}) {
  return fetch(`${baseUrl}${route}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
}

test('GET /books/summary returns 200 and [] when there are no books', async () => {
  const response = await request('/books/summary');
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test('Books can be added and genre summary returns correct counts', async () => {
  let response = await request('/books', { method: 'POST', body: JSON.stringify({ book_name: 'The Hobbit', author: 'J. R. R. Tolkien', genre: 'Fantasy' }) });
  assert.equal(response.status, 201);
  response = await request('/books', { method: 'POST', body: JSON.stringify({ book_name: 'Dune', author: 'Frank Herbert', genre: 'Science Fiction' }) });
  assert.equal(response.status, 201);
  response = await request('/books', { method: 'POST', body: JSON.stringify({ book_name: 'The Lord of the Rings', author: 'J. R. R. Tolkien', genre: 'Fantasy' }) });
  assert.equal(response.status, 201);

  const summaryResponse = await request('/books/summary');
  assert.equal(summaryResponse.status, 200);
  assert.deepEqual(await summaryResponse.json(), [
    { genre: 'Fantasy', book_count: 2 },
    { genre: 'Science Fiction', book_count: 1 }
  ]);
});

test('POST /books rejects missing or blank values', async () => {
  const response = await request('/books', { method: 'POST', body: JSON.stringify({ book_name: '   ', author: 'J. R. R. Tolkien', genre: 'Fantasy' }) });
  assert.equal(response.status, 400);
});

test('Loan details JOIN returns reader and book names', async () => {
  const readerResponse = await request('/readers', { method: 'POST', body: JSON.stringify({ reader_name: 'Asha', email: 'asha@example.com' }) });
  assert.equal(readerResponse.status, 201);
  const reader = await readerResponse.json();
  const bookResponse = await request('/books', { method: 'POST', body: JSON.stringify({ book_name: 'Clean Code', author: 'Robert C. Martin', genre: 'Technology' }) });
  assert.equal(bookResponse.status, 201);
  const book = await bookResponse.json();

  const loanResponse = await request('/loans', { method: 'POST', body: JSON.stringify({ reader_id: reader.reader_id, book_id: book.book_id }) });
  assert.equal(loanResponse.status, 201);
  const detailsResponse = await request('/loans/details');
  assert.equal(detailsResponse.status, 200);
  const details = await detailsResponse.json();
  assert.ok(details.some((row) => row.reader_name === 'Asha' && row.book_name === 'Clean Code'));
});
