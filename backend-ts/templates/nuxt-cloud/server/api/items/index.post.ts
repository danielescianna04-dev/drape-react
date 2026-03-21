import { useDb, type Item } from '../../utils/db';

export default defineEventHandler(async (event) => {
  const db = useDb();
  try {
    const body = await readBody(event);
    const { title, description, status } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Title is required' });
    }

    const stmt = db.prepare(
      'INSERT INTO items (title, description, status) VALUES (?, ?, ?)'
    );
    const result = stmt.run(
      title.trim(),
      (description || '').trim(),
      status || 'active'
    );

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid) as Item;

    setResponseStatus(event, 201);
    return item;
  } catch (error: any) {
    if (error.statusCode) throw error;
    console.error('Error creating item:', error);
    throw createError({ statusCode: 500, statusMessage: 'Failed to create item' });
  }
});
