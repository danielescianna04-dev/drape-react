import type { APIRoute } from 'astro';
import db from '../../../lib/db';
import type { Item } from '../../../lib/db';

export const GET: APIRoute = async ({ params }) => {
  try {
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(params.id) as Item | undefined;

    if (!item) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(item), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to fetch item:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const PUT: APIRoute = async ({ params, request }) => {
  try {
    const body = await request.json();
    const { title, description, status } = body;

    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(params.id) as Item | undefined;
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
      return new Response(JSON.stringify({ error: 'Title cannot be empty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
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

    return new Response(JSON.stringify(item), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to update item:', error);
    return new Response(JSON.stringify({ error: 'Failed to update item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const DELETE: APIRoute = async ({ params }) => {
  try {
    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(params.id) as Item | undefined;
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    db.prepare('DELETE FROM items WHERE id = ?').run(params.id);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Failed to delete item:', error);
    return new Response(JSON.stringify({ error: 'Failed to delete item' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
