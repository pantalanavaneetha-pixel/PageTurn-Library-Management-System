const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const fs = require('fs');
const path = require('path');

async function connectDatabase(filename = path.join(__dirname, 'database', 'pageturn.db')) {
  const db = await open({ filename, driver: sqlite3.Database });
  await db.exec('PRAGMA foreign_keys = ON;');
  const schema = fs.readFileSync(path.join(__dirname, 'database', 'init.sql'), 'utf8');
  await db.exec(schema);

  const bookColumns = await db.all('PRAGMA table_info(books)');
  if (!bookColumns.some((column) => column.name === 'author')) {
    await db.exec(
      "ALTER TABLE books ADD COLUMN author TEXT NOT NULL DEFAULT 'Unknown' " +
      "CHECK (TRIM(author) <> '')"
    );
  }

  return db;
}

module.exports = connectDatabase;
