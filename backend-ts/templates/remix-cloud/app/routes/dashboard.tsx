import { useState, useCallback } from 'react';
import type { LoaderFunctionArgs, ActionFunctionArgs, MetaFunction } from '@remix-run/node';
import { json } from '@remix-run/node';
import { useLoaderData, useRevalidator } from '@remix-run/react';
import db from '~/lib/db.server';
import type { Item } from '~/lib/db.server';

export const meta: MetaFunction = () => [
  { title: 'Dashboard - Cloud Mode' },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const items = db.prepare('SELECT * FROM items ORDER BY created_at DESC').all() as Item[];
  return json({ items });
}

export async function action({ request }: ActionFunctionArgs) {
  const formData = await request.formData();
  const intent = formData.get('intent') as string;

  if (intent === 'create') {
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const status = formData.get('status') as string;

    if (!title?.trim()) {
      return json({ error: 'Title is required' }, { status: 400 });
    }

    db.prepare('INSERT INTO items (title, description, status) VALUES (?, ?, ?)')
      .run(title.trim(), description?.trim() || '', status || 'active');

    return json({ success: true });
  }

  if (intent === 'update') {
    const id = formData.get('id') as string;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const status = formData.get('status') as string;

    db.prepare(`
      UPDATE items
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          status = COALESCE(?, status),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title?.trim() || null,
      description?.trim() ?? null,
      status || null,
      id
    );

    return json({ success: true });
  }

  if (intent === 'delete') {
    const id = formData.get('id') as string;
    db.prepare('DELETE FROM items WHERE id = ?').run(id);
    return json({ success: true });
  }

  if (intent === 'toggle') {
    const id = formData.get('id') as string;
    const currentStatus = formData.get('currentStatus') as string;
    const newStatus = currentStatus === 'active' ? 'completed' : 'active';
    db.prepare('UPDATE items SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newStatus, id);
    return json({ success: true });
  }

  return json({ error: 'Unknown intent' }, { status: 400 });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function Dashboard() {
  const { items } = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formStatus, setFormStatus] = useState('active');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const activeCount = items.filter((i) => i.status === 'active').length;
  const completedCount = items.filter((i) => i.status === 'completed').length;

  function openCreateModal() {
    setEditingItem(null);
    setFormTitle('');
    setFormDescription('');
    setFormStatus('active');
    setError('');
    setShowModal(true);
  }

  function openEditModal(item: Item) {
    setEditingItem(item);
    setFormTitle(item.title);
    setFormDescription(item.description);
    setFormStatus(item.status);
    setError('');
    setShowModal(true);
  }

  function closeModal() {
    setShowModal(false);
    setEditingItem(null);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formTitle.trim()) {
      setError('Title is required');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.set('title', formTitle);
      formData.set('description', formDescription);
      formData.set('status', formStatus);

      if (editingItem) {
        formData.set('intent', 'update');
        formData.set('id', String(editingItem.id));
      } else {
        formData.set('intent', 'create');
      }

      await fetch('/dashboard', {
        method: 'POST',
        body: formData,
      });

      closeModal();
      revalidator.revalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function deleteItem(id: number) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    const formData = new FormData();
    formData.set('intent', 'delete');
    formData.set('id', String(id));
    await fetch('/dashboard', { method: 'POST', body: formData });
    revalidator.revalidate();
  }

  async function toggleStatus(item: Item) {
    const formData = new FormData();
    formData.set('intent', 'toggle');
    formData.set('id', String(item.id));
    formData.set('currentStatus', item.status);
    await fetch('/dashboard', { method: 'POST', body: formData });
    revalidator.revalidate();
  }

  return (
    <section className="pt-28 pb-16 px-4 min-h-screen">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold text-white">Dashboard</h1>
              <span className="px-3 py-1 text-sm font-medium rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                {items.length} items
              </span>
            </div>
            <p className="text-slate-300">Manage your items with full CRUD operations powered by SQLite.</p>
          </div>
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/25 hover:-translate-y-0.5 active:translate-y-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
            Add Item
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl p-4">
            <div className="text-2xl font-bold text-white">{items.length}</div>
            <div className="text-sm text-slate-300">Total Items</div>
          </div>
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl p-4">
            <div className="text-2xl font-bold text-green-400">{activeCount}</div>
            <div className="text-sm text-slate-300">Active</div>
          </div>
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl p-4">
            <div className="text-2xl font-bold text-blue-400">{completedCount}</div>
            <div className="text-sm text-slate-300">Completed</div>
          </div>
        </div>

        {/* Items Grid */}
        {items.length === 0 ? (
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-12 text-center">
            <div className="text-4xl mb-4">&#128466;</div>
            <h3 className="text-lg font-semibold text-white mb-2">No items yet</h3>
            <p className="text-slate-300 mb-6">Create your first item to get started.</p>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all duration-300"
            >
              Create First Item
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl p-5 hover:bg-white/[0.08] transition-all duration-300 hover:-translate-y-0.5 group"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors line-clamp-1">
                    {item.title}
                  </h3>
                  <button
                    onClick={() => toggleStatus(item)}
                    className={`shrink-0 ml-2 px-2.5 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer ${
                      item.status === 'active'
                        ? 'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20'
                        : 'bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20'
                    }`}
                  >
                    {item.status}
                  </button>
                </div>

                {item.description && (
                  <p className="text-sm text-slate-300 mb-4 line-clamp-2">{item.description}</p>
                )}

                <div className="flex items-center justify-between mt-auto pt-3 border-t border-white/5">
                  <span className="text-xs text-slate-300">{formatDate(item.created_at)}</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(item)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                      title="Edit"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => deleteItem(item.id)}
                      className="p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
          <div
            className="relative w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">
                {editingItem ? 'Edit Item' : 'New Item'}
              </h2>
              <button onClick={closeModal} className="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Title</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Enter item title..."
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-400 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Enter description..."
                    rows={3}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-400 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-colors resize-none"
                  ></textarea>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-colors"
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 px-8 py-3 rounded-xl font-semibold bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 transition-all duration-300 text-center text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-8 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all duration-300 text-center disabled:opacity-50"
                >
                  {loading ? 'Saving...' : editingItem ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}
