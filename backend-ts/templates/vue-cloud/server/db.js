import Database from 'better-sqlite3';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, '..', 'data.db');

const isNew = !existsSync(DB_PATH);
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Seed data on first run
if (isNew || db.prepare('SELECT COUNT(*) as count FROM items').get().count === 0) {
  const insert = db.prepare(
    'INSERT INTO items (title, description, status) VALUES (?, ?, ?)'
  );

  const seedData = [
    ['Welcome to Cloud Mode', 'Your SQLite database is ready. This is your first item.', 'active'],
    ['Build something amazing', 'Start creating your API-powered features.', 'active'],
    ['Deploy anywhere', 'Your backend works with any hosting provider.', 'completed'],
  ];

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insert.run(...item);
    }
  });

  insertMany(seedData);
}

export default db;
