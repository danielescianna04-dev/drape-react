import type { APIRoute } from 'astro';
import { sql } from '../../../lib/db';

export const GET: APIRoute = async ({ params }) => {
  try {
    const [item] = await sql`SELECT * FROM items WHERE id = ${params.id}`;

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

    const [existing] = await sql`SELECT * FROM items WHERE id = ${params.id}`;
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

    const [item] = await sql`
      UPDATE items SET
        title = ${title !== undefined ? title.trim() : existing.title},
        description = ${description !== undefined ? description.trim() : existing.description},
        status = ${status !== undefined ? status : existing.status},
        updated_at = NOW()
      WHERE id = ${params.id}
      RETURNING *
    `;

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
    const [existing] = await sql`SELECT * FROM items WHERE id = ${params.id}`;
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await sql`DELETE FROM items WHERE id = ${params.id}`;

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
