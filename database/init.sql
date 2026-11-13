PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS readers (
  reader_id INTEGER PRIMARY KEY AUTOINCREMENT,
  reader_name TEXT NOT NULL CHECK (TRIM(reader_name) <> ''),
  email TEXT NOT NULL UNIQUE CHECK (TRIM(email) <> '')
);

CREATE TABLE IF NOT EXISTS books (
  book_id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_name TEXT NOT NULL CHECK (TRIM(book_name) <> ''),
  author TEXT NOT NULL CHECK (TRIM(author) <> ''),
  genre TEXT NOT NULL CHECK (TRIM(genre) <> '')
);

CREATE TABLE IF NOT EXISTS loans (
  loan_id INTEGER PRIMARY KEY AUTOINCREMENT,
  reader_id INTEGER NOT NULL,
  book_id INTEGER NOT NULL,
  borrow_date TEXT NOT NULL DEFAULT (date('now')),
  return_date TEXT,
  status TEXT NOT NULL DEFAULT 'BORROWED' CHECK (status IN ('BORROWED', 'RETURNED')),
  FOREIGN KEY (reader_id) REFERENCES readers(reader_id) ON DELETE RESTRICT,
  FOREIGN KEY (book_id) REFERENCES books(book_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_books_genre ON books(genre);
CREATE INDEX IF NOT EXISTS idx_loans_reader_id ON loans(reader_id);
CREATE INDEX IF NOT EXISTS idx_loans_book_id ON loans(book_id);
