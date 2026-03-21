import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync } from 'fs';

export interface Item {
  id: number;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

const DB_PATH = join(process.cwd(), 'data.db');
const isNew = !existsSync(DB_PATH);

let _db: Database.Database | null = null;

export function useDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);

    // Enable WAL mode for better performance
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');

    // Initialize schema
    _db.exec(`
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
    if (isNew || (_db.prepare('SELECT COUNT(*) as count FROM items').get() as { count: number }).count === 0) {
      const insert = _db.prepare(
        'INSERT INTO items (title, description, status) VALUES (?, ?, ?)'
      );

      const seedData = [
        ['Welcome to Cloud Mode', 'Your SQLite database is ready. This is your first item.', 'active'],
        ['Build something amazing', 'Start creating your API-powered features.', 'active'],
        ['Deploy anywhere', 'Your backend works with any hosting provider.', 'completed'],
      ];

      const insertMany = _db.transaction((items: string[][]) => {
        for (const item of items) {
          insert.run(...item);
        }
      });

      insertMany(seedData);
    }
  }

  return _db;
}
