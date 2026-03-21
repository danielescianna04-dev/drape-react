const express = require('express');
const router = express.Router();
const db = require('../db');

// GET all items
router.get('/', (req, res) => {
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
router.get('/:id', (req, res) => {
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
router.post('/', (req, res) => {
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
router.put('/:id', (req, res) => {
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
router.delete('/:id', (req, res) => {
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

module.exports = router;
