import { NextRequest, NextResponse } from 'next/server';
import db, { type Item } from '@/lib/db';

// GET /api/items — list all items
export async function GET() {
  try {
    const items = db.prepare('SELECT * FROM items ORDER BY created_at DESC').all() as Item[];
    return NextResponse.json(items);
  } catch (error) {
    console.error('Error fetching items:', error);
    return NextResponse.json({ error: 'Failed to fetch items' }, { status: 500 });
  }
}

// POST /api/items — create a new item
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, description, status } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const stmt = db.prepare(
      'INSERT INTO items (title, description, status) VALUES (?, ?, ?)'
    );
    const result = stmt.run(
      title.trim(),
      (description || '').trim(),
      status || 'active'
    );

    const item = db.prepare('SELECT * FROM items WHERE id = ?').get(result.lastInsertRowid) as Item;
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error('Error creating item:', error);
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 });
  }
}
