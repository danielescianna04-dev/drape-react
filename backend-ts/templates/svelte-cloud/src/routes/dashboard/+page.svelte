<script lang="ts">
  import type { PageData } from './$types';

  interface Item {
    id: number;
    title: string;
    description: string;
    status: string;
    created_at: string;
    updated_at: string;
  }

  let { data }: { data: PageData } = $props();

  let items = $state<Item[]>(data.items as Item[]);
  let showModal = $state(false);
  let editingItem = $state<Item | null>(null);
  let formTitle = $state('');
  let formDescription = $state('');
  let formStatus = $state('active');
  let loading = $state(false);
  let error = $state('');

  function openCreateModal() {
    editingItem = null;
    formTitle = '';
    formDescription = '';
    formStatus = 'active';
    error = '';
    showModal = true;
  }

  function openEditModal(item: Item) {
    editingItem = item;
    formTitle = item.title;
    formDescription = item.description;
    formStatus = item.status;
    error = '';
    showModal = true;
  }

  function closeModal() {
    showModal = false;
    editingItem = null;
    error = '';
  }

  async function handleSubmit() {
    if (!formTitle.trim()) {
      error = 'Title is required';
      return;
    }

    loading = true;
    error = '';

    try {
      if (editingItem) {
        const res = await fetch(`/api/items/${editingItem.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle,
            description: formDescription,
            status: formStatus,
          }),
        });

        if (!res.ok) throw new Error('Failed to update item');
        const updated: Item = await res.json();
        items = items.map((i) => (i.id === updated.id ? updated : i));
      } else {
        const res = await fetch('/api/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle,
            description: formDescription,
            status: formStatus,
          }),
        });

        if (!res.ok) throw new Error('Failed to create item');
        const created: Item = await res.json();
        items = [created, ...items];
      }

      closeModal();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Something went wrong';
    } finally {
      loading = false;
    }
  }

  async function deleteItem(id: number) {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete item');
      items = items.filter((i) => i.id !== id);
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
      items = items.map((i) => (i.id === updated.id ? updated : i));
    } catch (e) {
      console.error('Status update failed:', e);
    }
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  let activeCount = $derived(items.filter((i) => i.status === 'active').length);
  let completedCount = $derived(items.filter((i) => i.status === 'completed').length);
</script>

<svelte:head>
  <title>Dashboard - Cloud Mode</title>
</svelte:head>

<section class="pt-28 pb-16 px-4 min-h-screen">
  <div class="max-w-6xl mx-auto">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
      <div>
        <div class="flex items-center gap-3 mb-2">
          <h1 class="text-3xl font-bold text-white">Dashboard</h1>
          <span class="px-3 py-1 text-sm font-medium rounded-full bg-primary-500/10 text-primary-400 border border-primary-500/20">
            {items.length} items
          </span>
        </div>
        <p class="text-surface-200">Manage your items with full CRUD operations powered by SQLite.</p>
      </div>
      <button onclick={openCreateModal} class="btn-primary flex items-center gap-2">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        Add Item
      </button>
    </div>

    <!-- Stats -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      <div class="glass rounded-xl p-4">
        <div class="text-2xl font-bold text-white">{items.length}</div>
        <div class="text-sm text-surface-200">Total Items</div>
      </div>
      <div class="glass rounded-xl p-4">
        <div class="text-2xl font-bold text-green-400">{activeCount}</div>
        <div class="text-sm text-surface-200">Active</div>
      </div>
      <div class="glass rounded-xl p-4">
        <div class="text-2xl font-bold text-blue-400">{completedCount}</div>
        <div class="text-sm text-surface-200">Completed</div>
      </div>
    </div>

    <!-- Items Grid -->
    {#if items.length === 0}
      <div class="glass rounded-2xl p-12 text-center">
        <div class="text-4xl mb-4">&#128466;</div>
        <h3 class="text-lg font-semibold text-white mb-2">No items yet</h3>
        <p class="text-surface-200 mb-6">Create your first item to get started.</p>
        <button onclick={openCreateModal} class="btn-primary">Create First Item</button>
      </div>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each items as item (item.id)}
          <div class="glass rounded-xl p-5 hover:bg-white/[0.08] transition-all duration-300 hover:-translate-y-0.5 group">
            <div class="flex items-start justify-between mb-3">
              <h3 class="text-lg font-semibold text-white group-hover:text-primary-400 transition-colors line-clamp-1">
                {item.title}
              </h3>
              <button
                onclick={() => toggleStatus(item)}
                class="shrink-0 ml-2 px-2.5 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer {item.status === 'active'
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20'
                  : 'bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20'}"
              >
                {item.status}
              </button>
            </div>

            {#if item.description}
              <p class="text-sm text-surface-200 mb-4 line-clamp-2">{item.description}</p>
            {/if}

            <div class="flex items-center justify-between mt-auto pt-3 border-t border-white/5">
              <span class="text-xs text-surface-200">{formatDate(item.created_at)}</span>
              <div class="flex items-center gap-1">
                <button
                  onclick={() => openEditModal(item)}
                  class="p-1.5 rounded-lg text-surface-200 hover:text-white hover:bg-white/10 transition-colors"
                  title="Edit"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
                <button
                  onclick={() => deleteItem(item.id)}
                  class="p-1.5 rounded-lg text-surface-200 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Delete"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>

<!-- Modal -->
{#if showModal}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4" onclick={closeModal}>
    <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="relative w-full max-w-md glass rounded-2xl p-6" onclick|stopPropagation>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-xl font-bold text-white">
          {editingItem ? 'Edit Item' : 'New Item'}
        </h2>
        <button onclick={closeModal} class="p-1 rounded-lg text-surface-200 hover:text-white hover:bg-white/10 transition-colors">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {#if error}
        <div class="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      {/if}

      <form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
        <div class="space-y-4">
          <div>
            <label for="title" class="block text-sm font-medium text-surface-200 mb-1.5">Title</label>
            <input
              id="title"
              type="text"
              bind:value={formTitle}
              placeholder="Enter item title..."
              class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-surface-200/50 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/25 transition-colors"
            />
          </div>

          <div>
            <label for="description" class="block text-sm font-medium text-surface-200 mb-1.5">Description</label>
            <textarea
              id="description"
              bind:value={formDescription}
              placeholder="Enter description..."
              rows="3"
              class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-surface-200/50 focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/25 transition-colors resize-none"
            ></textarea>
          </div>

          <div>
            <label for="status" class="block text-sm font-medium text-surface-200 mb-1.5">Status</label>
            <select
              id="status"
              bind:value={formStatus}
              class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white focus:outline-none focus:border-primary-500/50 focus:ring-1 focus:ring-primary-500/25 transition-colors"
            >
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </div>
        </div>

        <div class="flex items-center gap-3 mt-6">
          <button type="button" onclick={closeModal} class="flex-1 btn-secondary text-center">Cancel</button>
          <button type="submit" disabled={loading} class="flex-1 btn-primary text-center disabled:opacity-50">
            {loading ? 'Saving...' : editingItem ? 'Update' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
