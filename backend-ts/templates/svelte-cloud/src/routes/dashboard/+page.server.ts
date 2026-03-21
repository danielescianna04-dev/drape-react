import type { PageServerLoad } from './$types';
import db from '$lib/server/db';
import type { Item } from '$lib/server/db';

export const load: PageServerLoad = async () => {
  const items = db.prepare('SELECT * FROM items ORDER BY created_at DESC').all() as Item[];
  return { items };
};
