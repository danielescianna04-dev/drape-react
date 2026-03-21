import { createSignal, createResource, For, Show } from 'solid-js';
import { Title } from '@solidjs/meta';

interface Item {
  id: number;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

async function fetchItems(): Promise<Item[]> {
  const res = await fetch('/api/items');
  if (!res.ok) throw new Error('Failed to fetch items');
  return res.json();
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function Dashboard() {
  const [items, { mutate, refetch }] = createResource(fetchItems);
  const [showModal, setShowModal] = createSignal(false);
  const [editingItem, setEditingItem] = createSignal<Item | null>(null);
  const [formTitle, setFormTitle] = createSignal('');
  const [formDescription, setFormDescription] = createSignal('');
  const [formStatus, setFormStatus] = createSignal('active');
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal('');

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

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!formTitle().trim()) {
      setError('Title is required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const editing = editingItem();
      if (editing) {
        const res = await fetch(`/api/items/${editing.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle(),
            description: formDescription(),
            status: formStatus(),
          }),
        });
        if (!res.ok) throw new Error('Failed to update item');
        const updated: Item = await res.json();
        mutate((prev) => prev?.map((i) => (i.id === updated.id ? updated : i)));
      } else {
        const res = await fetch('/api/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle(),
            description: formDescription(),
            status: formStatus(),
          }),
        });
        if (!res.ok) throw new Error('Failed to create item');
        const created: Item = await res.json();
        mutate((prev) => [created, ...(prev || [])]);
      }
      closeModal();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  async function deleteItem(id: number) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    try {
      const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete item');
      mutate((prev) => prev?.filter((i) => i.id !== id));
    } catch (e) {
      console.error('Delete failed:', e);
    }
  }

  async function toggleStatus(item: Item) {
    const newStatus = item.status === 'active' ? 'completed' : 'active';
    try {
      const res = await fetch(`/api/items/${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      const updated: Item = await res.json();
      mutate((prev) => prev?.map((i) => (i.id === updated.id ? updated : i)));
    } catch (e) {
      console.error('Status update failed:', e);
    }
  }

  const activeCount = () => (items() || []).filter((i) => i.status === 'active').length;
  const completedCount = () => (items() || []).filter((i) => i.status === 'completed').length;
  const totalCount = () => (items() || []).length;

  return (
    <>
      <Title>Dashboard - Cloud Mode</Title>
      <section class="pt-28 pb-16 px-4 min-h-screen">
        <div class="max-w-6xl mx-auto">
          {/* Header */}
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <div class="flex items-center gap-3 mb-2">
                <h1 class="text-3xl font-bold text-white">Dashboard</h1>
                <span class="px-3 py-1 text-sm font-medium rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  {totalCount()} items
                </span>
              </div>
              <p class="text-slate-300">Manage your items with full CRUD operations powered by SQLite.</p>
            </div>
            <button
              onClick={openCreateModal}
              class="inline-flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/25 hover:-translate-y-0.5 active:translate-y-0"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
              Add Item
            </button>
          </div>

          {/* Stats */}
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <div class="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl p-4">
              <div class="text-2xl font-bold text-white">{totalCount()}</div>
              <div class="text-sm text-slate-300">Total Items</div>
            </div>
            <div class="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl p-4">
              <div class="text-2xl font-bold text-green-400">{activeCount()}</div>
              <div class="text-sm text-slate-300">Active</div>
            </div>
            <div class="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl p-4">
              <div class="text-2xl font-bold text-blue-400">{completedCount()}</div>
              <div class="text-sm text-slate-300">Completed</div>
            </div>
          </div>

          {/* Items Grid */}
          <Show when={!items.loading} fallback={
            <div class="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-12 text-center">
              <div class="text-lg text-slate-300">Loading items...</div>
            </div>
          }>
            <Show when={totalCount() > 0} fallback={
              <div class="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-12 text-center">
                <div class="text-4xl mb-4">&#128466;</div>
                <h3 class="text-lg font-semibold text-white mb-2">No items yet</h3>
                <p class="text-slate-300 mb-6">Create your first item to get started.</p>
                <button
                  onClick={openCreateModal}
                  class="inline-flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all duration-300"
                >
                  Create First Item
                </button>
              </div>
            }>
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <For each={items()}>
                  {(item) => (
                    <div class="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl p-5 hover:bg-white/[0.08] transition-all duration-300 hover:-translate-y-0.5 group">
                      <div class="flex items-start justify-between mb-3">
                        <h3 class="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors line-clamp-1">
                          {item.title}
                        </h3>
                        <button
                          onClick={() => toggleStatus(item)}
                          class={`shrink-0 ml-2 px-2.5 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer ${
                            item.status === 'active'
                              ? 'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20'
                              : 'bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20'
                          }`}
                        >
                          {item.status}
                        </button>
                      </div>

                      <Show when={item.description}>
                        <p class="text-sm text-slate-300 mb-4 line-clamp-2">{item.description}</p>
                      </Show>

                      <div class="flex items-center justify-between mt-auto pt-3 border-t border-white/5">
                        <span class="text-xs text-slate-300">{formatDate(item.created_at)}</span>
                        <div class="flex items-center gap-1">
                          <button
                            onClick={() => openEditModal(item)}
                            class="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
                            title="Edit"
                          >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => deleteItem(item.id)}
                            class="p-1.5 rounded-lg text-slate-300 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            title="Delete"
                          >
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </Show>
        </div>
      </section>

      {/* Modal */}
      <Show when={showModal()}>
        <div class="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={closeModal}>
          <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
          <div
            class="relative w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="flex items-center justify-between mb-6">
              <h2 class="text-xl font-bold text-white">
                {editingItem() ? 'Edit Item' : 'New Item'}
              </h2>
              <button onClick={closeModal} class="p-1 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <Show when={error()}>
              <div class="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error()}
              </div>
            </Show>

            <form onSubmit={handleSubmit}>
              <div class="space-y-4">
                <div>
                  <label class="block text-sm font-medium text-slate-300 mb-1.5">Title</label>
                  <input
                    type="text"
                    value={formTitle()}
                    onInput={(e) => setFormTitle(e.currentTarget.value)}
                    placeholder="Enter item title..."
                    class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-400 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-colors"
                  />
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
                  <textarea
                    value={formDescription()}
                    onInput={(e) => setFormDescription(e.currentTarget.value)}
                    placeholder="Enter description..."
                    rows="3"
                    class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-slate-400 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-colors resize-none"
                  ></textarea>
                </div>
                <div>
                  <label class="block text-sm font-medium text-slate-300 mb-1.5">Status</label>
                  <select
                    value={formStatus()}
                    onChange={(e) => setFormStatus(e.currentTarget.value)}
                    class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-colors"
                  >
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>
              </div>
              <div class="flex items-center gap-3 mt-6">
                <button
                  type="button"
                  onClick={closeModal}
                  class="flex-1 px-8 py-3 rounded-xl font-semibold bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 transition-all duration-300 text-center text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading()}
                  class="flex-1 px-8 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all duration-300 text-center disabled:opacity-50"
                >
                  {loading() ? 'Saving...' : editingItem() ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </Show>
    </>
  );
}
