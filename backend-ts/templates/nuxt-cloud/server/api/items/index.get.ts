import { useDb, type Item } from '../../utils/db';

export default defineEventHandler(() => {
  const db = useDb();
  try {
    const items = db.prepare('SELECT * FROM items ORDER BY created_at DESC').all() as Item[];
    return items;
  } catch (error) {
    console.error('Error fetching items:', error);
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch items' });
  }
});
