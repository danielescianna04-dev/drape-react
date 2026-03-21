import { useDb, type Item } from '../../utils/db';

export default defineEventHandler((event) => {
  const db = useDb();
  try {
    const id = getRouterParam(event, 'id');
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item | undefined;

    if (!item) {
      throw createError({ statusCode: 404, statusMessage: 'Item not found' });
    }

    return item;
  } catch (error: any) {
    if (error.statusCode) throw error;
    console.error('Error fetching item:', error);
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch item' });
  }
});
