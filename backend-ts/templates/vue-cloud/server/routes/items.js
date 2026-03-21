import { Router } from 'express';
import db from '../db.js';

const router = Router();

// GET /api/items — list all items
router.get('/', (req, res) => {
  try {
    const items = db.prepare('SELECT * FROM items ORDER BY created_at DESC').all();
    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// POST /api/items — create a new item
router.post('/', (req, res) => {
  try {
    const { title, description, status } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const stmt = db.prepare(
      'INSERT INTO items (title, description, status) VALUES (?, ?, ?)'
    );
    const result = stmt.run(
      title.trim(),
      (description || '').trim(),
      status || 'active'
    );

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// PUT /api/items/:id — update an item
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status } = req.body;

    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
      return res.status(400).json({ error: 'Title cannot be empty' });
    }

    const stmt = db.prepare(
      'UPDATE items SET title = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    );
    stmt.run(
      title !== undefined ? title.trim() : existing.title,
      description !== undefined ? description.trim() : existing.description,
      status !== undefined ? status : existing.status,
      id
    );

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    res.json(item);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE /api/items/:id — delete an item
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    db.prepare('DELETE FROM items WHERE id = ?').run(id);
    res.json({ success: true, id: Number(id) });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

export default router;
