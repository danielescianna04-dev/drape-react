import { useDb, type Item } from '../../utils/db';

export default defineEventHandler(async (event) => {
  const db = useDb();
  try {
    const id = getRouterParam(event, 'id');
    const body = await readBody(event);
    const { title, description, status } = body;

    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item | undefined;
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Item not found' });
    }

    if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
      throw createError({ statusCode: 400, statusMessage: 'Title cannot be empty' });
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

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item;
    return item;
  } catch (error: any) {
    if (error.statusCode) throw error;
    console.error('Error updating item:', error);
    throw createError({ statusCode: 500, statusMessage: 'Failed to update item' });
  }
});
