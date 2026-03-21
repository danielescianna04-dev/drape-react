import type { LoaderFunctionArgs, ActionFunctionArgs } from '@remix-run/node';
import { json } from '@remix-run/node';
import db from '~/lib/db.server';
import type { Item } from '~/lib/db.server';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const status = url.searchParams.get('status');

  try {
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
}

export async function action({ request }: ActionFunctionArgs) {
  const method = request.method;

  if (method === 'POST') {
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
  }

  if (method === 'PUT') {
    try {
      const body = await request.json();
      const { id, title, description, status } = body;

      if (!id) {
        return json({ error: 'ID is required' }, { status: 400 });
      }

      const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item | undefined;
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
        id
      );

      const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item;
      return json(item);
    } catch (error) {
      console.error('Failed to update item:', error);
      return json({ error: 'Failed to update item' }, { status: 500 });
    }
  }

  if (method === 'DELETE') {
    try {
      const body = await request.json();
      const { id } = body;

      if (!id) {
        return json({ error: 'ID is required' }, { status: 400 });
      }

      const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item | undefined;
      if (!existing) {
        return json({ error: 'Item not found' }, { status: 404 });
      }

      db.prepare('DELETE FROM items WHERE id = ?').run(id);
      return json({ success: true });
    } catch (error) {
      console.error('Failed to delete item:', error);
      return json({ error: 'Failed to delete item' }, { status: 500 });
    }
  }

  return json({ error: 'Method not allowed' }, { status: 405 });
}
