import { Router } from 'express';
import sql from '../db.js';

const router = Router();

// GET /api/items — list all items
router.get('/', async (req, res) => {
  try {
    const items = await sql`SELECT * FROM items ORDER BY created_at DESC`;
    res.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// POST /api/items — create a new item
router.post('/', async (req, res) => {
  try {
    const { title, description, status } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const [item] = await sql`
      INSERT INTO items (title, description, status)
      VALUES (${title.trim()}, ${(description || '').trim()}, ${status || 'active'})
      RETURNING *
    `;
    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating item:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// PUT /api/items/:id — update an item
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, status } = req.body;

    const [existing] = await sql`SELECT * FROM items WHERE id = ${id}`;
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
      return res.status(400).json({ error: 'Title cannot be empty' });
    }

    const [item] = await sql`
      UPDATE items SET
        title = ${title !== undefined ? title.trim() : existing.title},
        description = ${description !== undefined ? description.trim() : existing.description},
        status = ${status !== undefined ? status : existing.status},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    res.json(item);
  } catch (error) {
    console.error('Error updating item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE /api/items/:id — delete an item
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await sql`SELECT * FROM items WHERE id = ${id}`;
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }

    await sql`DELETE FROM items WHERE id = ${id}`;
    res.json({ success: true, id: Number(id) });
  } catch (error) {
    console.error('Error deleting item:', error);
    res.status(500).json({ error: 'Failed to delete item' });
  }
});

export default router;
