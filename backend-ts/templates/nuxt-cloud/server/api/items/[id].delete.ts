import { useDb, type Item } from '../../utils/db';

export default defineEventHandler((event) => {
  const db = useDb();
  try {
    const id = getRouterParam(event, 'id');

    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item | undefined;
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Item not found' });
    }

    db.prepare('DELETE FROM items WHERE id = ?').run(id);
    return { success: true, id: Number(id) };
  } catch (error: any) {
    if (error.statusCode) throw error;
    console.error('Error deleting item:', error);
    throw createError({ statusCode: 500, statusMessage: 'Failed to delete item' });
  }
});
