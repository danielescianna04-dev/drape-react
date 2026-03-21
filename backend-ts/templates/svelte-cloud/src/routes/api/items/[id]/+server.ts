import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import type { Item } from '$lib/server/db';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(params.id) as Item | undefined;

    if (!item) {
      return json({ error: 'Item not found' }, { status: 404 });
    }

    return json(item);
  } catch (error) {
    console.error('Failed to fetch item:', error);
    return json({ error: 'Failed to fetch item' }, { status: 500 });
  }
};

export const PUT: RequestHandler = async ({ params, request }) => {
  try {
    const body = await request.json();
    const { title, description, status } = body;

    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(params.id) as Item | undefined;
    if (!existing) {
      return json({ error: 'Item not found' }, { status: 404 });
    }

    if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
      return json({ error: 'Title cannot be empty' }, { status: 400 });
    }

    db.prepare(`
      UPDATE items
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          status = COALESCE(?, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title?.trim() ?? null,
      description?.trim() ?? null,
      status ?? null,
      params.id
    );

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(params.id) as Item;
    return json(item);
  } catch (error) {
    console.error('Failed to update item:', error);
    return json({ error: 'Failed to update item' }, { status: 500 });
  }
};

export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(params.id) as Item | undefined;
    if (!existing) {
      return json({ error: 'Item not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM items WHERE id = ?').run(params.id);
    return json({ success: true });
  } catch (error) {
    console.error('Failed to delete item:', error);
    return json({ error: 'Failed to delete item' }, { status: 500 });
  }
};
