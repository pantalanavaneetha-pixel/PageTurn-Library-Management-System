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
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pageturn-readers-test-'));
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

test('GET /readers returns an empty array when there are no readers', async () => {
  const response = await request('/readers');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);
});

test('POST /readers creates a trimmed reader and GET returns all readers', async () => {
  const createResponse = await request('/readers', {
    method: 'POST',
    body: { reader_name: '  Navaneetha  ', email: '  navaneetha@example.com  ' }
  });

  assert.equal(createResponse.status, 201);
  const reader = await createResponse.json();
  assert.deepEqual(reader, {
    reader_id: 1,
    reader_name: 'Navaneetha',
    email: 'navaneetha@example.com'
  });

  const listResponse = await request('/readers');
  assert.equal(listResponse.status, 200);
  assert.deepEqual(await listResponse.json(), [reader]);
});

test('POST /readers rejects missing, blank, and invalid input', async () => {
  const invalidBodies = [
    {},
    { reader_name: '   ', email: 'reader@example.com' },
    { reader_name: 'Reader', email: '   ' },
    { reader_name: 'Reader', email: 'not-an-email' }
  ];

  for (const body of invalidBodies) {
    const response = await request('/readers', { method: 'POST', body });
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json()).error, 'string');
  }
});

test('POST /readers rejects duplicate email addresses', async () => {
  const body = { reader_name: 'Reader One', email: 'reader@example.com' };
  await request('/readers', { method: 'POST', body });

  const response = await request('/readers', {
    method: 'POST',
    body: { reader_name: 'Reader Two', email: body.email }
  });

  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /email already exists/i);
});

test('GET /readers/:id returns a reader and validates the ID', async () => {
  const createResponse = await request('/readers', {
    method: 'POST',
    body: { reader_name: 'Reader', email: 'reader@example.com' }
  });
  const reader = await createResponse.json();

  const response = await request(`/readers/${reader.reader_id}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), reader);

  const missingResponse = await request('/readers/999');
  assert.equal(missingResponse.status, 404);
  assert.deepEqual(await missingResponse.json(), { error: 'Reader not found' });

  const invalidIdResponse = await request('/readers/not-a-number');
  assert.equal(invalidIdResponse.status, 400);
});

test('PUT /readers/:id updates a reader and rejects invalid or duplicate values', async () => {
  const firstResponse = await request('/readers', {
    method: 'POST',
    body: { reader_name: 'First Reader', email: 'first@example.com' }
  });
  const firstReader = await firstResponse.json();

  await request('/readers', {
    method: 'POST',
    body: { reader_name: 'Second Reader', email: 'second@example.com' }
  });

  const updateResponse = await request(`/readers/${firstReader.reader_id}`, {
    method: 'PUT',
    body: { reader_name: '  Updated Reader ', email: ' updated@example.com ' }
  });
  assert.equal(updateResponse.status, 200);
  assert.deepEqual(await updateResponse.json(), {
    ...firstReader,
    reader_name: 'Updated Reader',
    email: 'updated@example.com'
  });

  const invalidResponse = await request(`/readers/${firstReader.reader_id}`, {
    method: 'PUT',
    body: { reader_name: 'Updated Reader', email: 'invalid' }
  });
  assert.equal(invalidResponse.status, 400);

  const duplicateResponse = await request(`/readers/${firstReader.reader_id}`, {
    method: 'PUT',
    body: { reader_name: 'Updated Reader', email: 'second@example.com' }
  });
  assert.equal(duplicateResponse.status, 409);

  const invalidIdResponse = await request('/readers/0', {
    method: 'PUT',
    body: { reader_name: 'Updated Reader', email: 'updated@example.com' }
  });
  assert.equal(invalidIdResponse.status, 400);

  const missingReaderResponse = await request('/readers/999', {
    method: 'PUT',
    body: { reader_name: 'Updated Reader', email: 'updated@example.com' }
  });
  assert.equal(missingReaderResponse.status, 404);
});

test('DELETE /readers/:id deletes a reader and returns 404 when it does not exist', async () => {
  const createResponse = await request('/readers', {
    method: 'POST',
    body: { reader_name: 'Reader', email: 'reader@example.com' }
  });
  const reader = await createResponse.json();

  const deleteResponse = await request(`/readers/${reader.reader_id}`, { method: 'DELETE' });
  assert.equal(deleteResponse.status, 200);
  assert.deepEqual(await deleteResponse.json(), { message: 'Reader deleted successfully' });

  const getResponse = await request(`/readers/${reader.reader_id}`);
  assert.equal(getResponse.status, 404);

  const missingResponse = await request('/readers/999', { method: 'DELETE' });
  assert.equal(missingResponse.status, 404);

  const invalidIdResponse = await request('/readers/invalid', { method: 'DELETE' });
  assert.equal(invalidIdResponse.status, 400);
});

test('DELETE /readers/:id is rejected when a loan refers to the reader', async () => {
  const createResponse = await request('/readers', {
    method: 'POST',
    body: { reader_name: 'Borrowing Reader', email: 'borrower@example.com' }
  });
  const reader = await createResponse.json();

  const book = await db.run(
    'INSERT INTO books (book_name, author, genre) VALUES (?, ?, ?)',
    'Test Book',
    'Test Author',
    'Test Genre'
  );
  await db.run(
    'INSERT INTO loans (reader_id, book_id) VALUES (?, ?)',
    reader.reader_id,
    book.lastID
  );

  const response = await request(`/readers/${reader.reader_id}`, { method: 'DELETE' });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /existing loans/i);

  const getResponse = await request(`/readers/${reader.reader_id}`);
  assert.equal(getResponse.status, 200);
});
