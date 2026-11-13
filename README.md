# PageTurn Library

A simple backend-only library lending management system built with Node.js, Express, and SQLite.

## 1. Requirements

- Node.js 18 or later
- npm

## 2. Install and run

The Node.js application is in the repository root. From the repository root,
install dependencies and start the application:

```bash
npm install
npm run dev
```

The API runs at `http://localhost:3000`.

To run the automated tests:

```bash
npm test
```

The SQLite database file is created automatically at `database/pageturn.db` the first time the server starts.

## 3. API endpoints

### Readers

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/readers` | Get all readers |
| GET | `/readers/:id` | Get one reader |
| POST | `/readers` | Add a reader |
| PUT | `/readers/:id` | Update a reader |
| DELETE | `/readers/:id` | Delete a reader if no loan refers to them |

Reader JSON example:

```json
{
  "reader_name": "Asha",
  "email": "asha@example.com"
}
```

Reader names and emails cannot be blank, and emails must have a valid format.
The API trims surrounding spaces, returns `409` for duplicate emails, and
prevents deleting readers who have existing loans.

### Books

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/books` | Get all books |
| GET | `/books/:id` | Get one book |
| POST | `/books` | Add a book |
| PUT | `/books/:id` | Update a book |
| DELETE | `/books/:id` | Delete a book if no loan refers to it |
| GET | `/books?genre=Fantasy` | Filter books by genre |
| GET | `/books?search=Hobbit` | Search book names |
| GET | `/books/summary` | Count books in each genre using SQL `GROUP BY` |

Book JSON example:

```json
{
  "book_name": "The Hobbit",
  "author": "J. R. R. Tolkien",
  "genre": "Fantasy"
}
```

All three book fields are required, must be non-empty strings, and are trimmed
before they are saved.

### Loans

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/loans` | Get all loans |
| GET | `/loans/:id` | Get one loan |
| POST | `/loans` | Create a loan |
| PUT | `/loans/:id/return` | Mark a borrowed loan as returned |
| DELETE | `/loans/:id` | Delete a loan |
| PATCH | `/loans/:id/return` | Mark a loan as returned |
| GET | `/loans/details` | JOIN loans, readers, and books to show loan and record details |

Loan JSON example:

```json
{
  "reader_id": 1,
  "book_id": 1
}
```

The borrow date is set automatically, `return_date` starts as `NULL`, and a new
loan starts with status `BORROWED`. Returning it changes the status to
`RETURNED` and sets the return date.

## 4. Test and make requests

Run the automated tests with `npm test`. You can also send HTTP requests using
curl from a terminal.

Example: add a book:

```bash
curl -X POST http://localhost:3000/books -H "Content-Type: application/json" -d "{\"book_name\":\"The Hobbit\",\"author\":\"J. R. R. Tolkien\",\"genre\":\"Fantasy\"}"
```

Example: view genre counts:

```bash
curl http://localhost:3000/books/summary
```

## 5. Project structure

```text
app.js
database.js
routes/
├── books.js
├── loans.js
└── readers.js
package.json
README.md
.gitignore
database/
└── init.sql
test/
├── app.test.js
├── books.test.js
├── loans.test.js
└── readers.test.js
```

- `app.js`: connects the API routers and starts the Express server.
- `routes/books.js`: validates and handles the Books API endpoints.
- `routes/loans.js`: validates and handles the Loans API endpoints.
- `routes/readers.js`: validates and handles the Readers API endpoints.
- `database.js`: opens SQLite and creates the tables from the SQL file.
- `database/init.sql`: defines readers, books, loans, and indexes.
- `test/`: automated API tests; the Readers tests use a temporary database.
