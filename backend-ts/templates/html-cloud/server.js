const express = require('express');
const { toNodeHandler } = require('better-auth/node');
const { auth } = require('./auth.js');
const sql = require('./db.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Better Auth handler — must come before express.json()
app.all('/api/auth/*', toNodeHandler(auth));

// Body parsing
app.use(express.json());

// Serve static files
app.use(express.static(__dirname));

// API Routes

// GET all items
app.get('/api/items', async (req, res) => {
  try {
    const { status } = req.query;
    let items;
    if (status) {
      items = await sql`SELECT * FROM items WHERE status = ${status} ORDER BY created_at DESC`;
    } else {
      items = await sql`SELECT * FROM items ORDER BY created_at DESC`;
    }
    res.json(items);
  } catch (error) {
    console.error('Failed to fetch items:', error);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

// GET single item
app.get('/api/items/:id', async (req, res) => {
  try {
    const [item] = await sql`SELECT * FROM items WHERE id = ${req.params.id}`;
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
app.post('/api/items', async (req, res) => {
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
    console.error('Failed to create item:', error);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

// PUT update item
app.put('/api/items/:id', async (req, res) => {
  try {
    const { title, description, status } = req.body;
    const [existing] = await sql`SELECT * FROM items WHERE id = ${req.params.id}`;
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
      WHERE id = ${req.params.id}
      RETURNING *
    `;
    res.json(item);
  } catch (error) {
    console.error('Failed to update item:', error);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

// DELETE item
app.delete('/api/items/:id', async (req, res) => {
  try {
    const [existing] = await sql`SELECT * FROM items WHERE id = ${req.params.id}`;
    if (!existing) {
      return res.status(404).json({ error: 'Item not found' });
    }
    await sql`DELETE FROM items WHERE id = ${req.params.id}`;
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
