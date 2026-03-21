import { NextRequest, NextResponse } from 'next/server';
import db, { type Item } from '@/lib/db';

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/items/:id — get a single item
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item | undefined;

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error('Error fetching item:', error);
    return NextResponse.json({ error: 'Failed to fetch item' }, { status: 500 });
  }
}

// PUT /api/items/:id — update an item
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const { title, description, status } = body;

    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (title !== undefined && (typeof title !== 'string' || title.trim().length === 0)) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    }

    const stmt = db.prepare(
      'UPDATE items SET title = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    );
    stmt.run(
      title !== undefined ? title.trim() : existing.title,
      description !== undefined ? description.trim() : existing.description,
      status !== undefined ? status : existing.status,
      id
    );

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item;
    return NextResponse.json(item);
  } catch (error) {
    console.error('Error updating item:', error);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  }
}

// DELETE /api/items/:id — delete an item
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;

    const existing = db.prepare('SELECT * FROM items WHERE id = ?').get(id) as Item | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    db.prepare('DELETE FROM items WHERE id = ?').run(id);
    return NextResponse.json({ success: true, id: Number(id) });
  } catch (error) {
    console.error('Error deleting item:', error);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  }
}
