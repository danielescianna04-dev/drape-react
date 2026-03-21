import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import type { Item } from '../../../lib/db';

export const GET: APIRoute = async ({ url }) => {
  try {
    const status = url.searchParams.get('status');
    let items: Item[];

    if (status) {
      items = db.prepare('SELECT * FROM items WHERE status = ? ORDER BY created_at DESC').all(status) as Item[];
    } else {
      items = db.prepare('SELECT * FROM items ORDER BY created_at DESC').all() as Item[];
    }

    return new Response(JSON.stringify(items), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to fetch items:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch items' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { title, description, status } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Title is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const result = db
      .prepare('INSERT INTO items (title, description, status) VALUES (?, ?, ?)')
      .run(title.trim(), description?.trim() || '', status || 'active');

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid) as Item;

    return new Response(JSON.stringify(item), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to create item:', error);
    return new Response(JSON.stringify({ error: 'Failed to create item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
