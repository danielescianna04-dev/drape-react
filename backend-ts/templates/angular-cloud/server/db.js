const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(process.cwd(), 'data.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

// Create tables
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

// Seed with sample data if empty
const count = db.prepare('SELECT COUNT(*) as count FROM items').get();
if (count.count === 0) {
  const insert = db.prepare('INSERT INTO items (title, description, status) VALUES (?, ?, ?)');
  const seedData = [
    ['Build landing page', 'Design and implement the main landing page with hero section', 'active'],
    ['Setup CI/CD pipeline', 'Configure GitHub Actions for automated testing and deployment', 'completed'],
    ['Database schema design', 'Plan and implement the database models for the application', 'completed'],
    ['API documentation', 'Write comprehensive API docs with examples', 'active'],
    ['User authentication', 'Implement login, signup, and session management', 'active'],
  ];
  for (const [title, description, status] of seedData) {
    insert.run(title, description, status);
  }
}

module.exports = db;
