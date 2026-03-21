import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import type { Item } from '$lib/server/db';

export const GET: RequestHandler = async ({ url }) => {
  try {
    const status = url.searchParams.get('status');
    let items: Item[];

    if (status) {
      items = db.prepare('SELECT * FROM items WHERE status = ? ORDER BY created_at DESC').all(status) as Item[];
    } else {
      items = db.prepare('SELECT * FROM items ORDER BY created_at DESC').all() as Item[];
    }

    return json(items);
  } catch (error) {
    console.error('Failed to fetch items:', error);
    return json({ error: 'Failed to fetch items' }, { status: 500 });
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { title, description, status } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return json({ error: 'Title is required' }, { status: 400 });
    }

    const result = db
      .prepare('INSERT INTO items (title, description, status) VALUES (?, ?, ?)')
      .run(title.trim(), description?.trim() || '', status || 'active');

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid) as Item;

    return json(item, { status: 201 });
  } catch (error) {
    console.error('Failed to create item:', error);
    return json({ error: 'Failed to create item' }, { status: 500 });
  }
};
