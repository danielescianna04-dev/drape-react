const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Database setup
const dbPath = path.join(__dirname, 'data.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

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

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// API Routes

// GET all items
app.get('/api/items', (req, res) => {
  try {
    const { status } = req.query;
    let items;
    if (status) {
      items = db.prepare('SELECT * FROM items WHERE status = ? ORDER BY created_at DESC').all(status);
    } else {
      items = db.prepare('SELECT * FROM items ORDER BY created_at DESC').all();
    }
    res.json(items);
  } catch (error) {
    console.error('Failed to fetch items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// GET single item
app.get('/api/items/:id', (req, res) => {
  try {
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }
    res.json(item);
  } catch (error) {
    console.error('Failed to fetch item:', error);
    res.status(500).json({ error: 'Failed to fetch item' });
  }
});

// POST create item
app.post('/api/items', (req, res) => {
  try {
    const { title, description, status } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const result = db
      .prepare('INSERT INTO items (title, description, status) VALUES (?, ?, ?)')
      .run(title.trim(), description?.trim() || '', status || 'active');
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
  } catch (error) {
    console.error('Failed to create item:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// PUT update item
app.put('/api/items/:id', (req, res) => {
  try {
    const { title, description, status } = req.body;
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }
    if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
      return res.status(400).json({ error: 'Title cannot be empty' });
    }
    db.prepare(`
      UPDATE items
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          status = COALESCE(?, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title?.trim() ?? null,
      description?.trim() ?? null,
      status ?? null,
      req.params.id
    );
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
    res.json(item);
  } catch (error) {
    console.error('Failed to update item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE item
app.delete('/api/items/:id', (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(req.params.id);
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }
    db.prepare('DELETE FROM items WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
