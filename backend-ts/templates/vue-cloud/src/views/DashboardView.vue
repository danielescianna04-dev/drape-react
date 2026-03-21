<script setup lang="ts">
import { ref, onMounted } from 'vue'
import NavBar from '../components/NavBar.vue'
import FooterSection from '../components/FooterSection.vue'
import { api, type Item, type CreateItemInput } from '../lib/api'

const items = ref<Item[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const showModal = ref(false)
const editingItem = ref<Item | null>(null)
const submitting = ref(false)

const formData = ref<CreateItemInput>({
  title: '',
  description: '',
  status: 'active',
})

const statusColors: Record<string, { bg: string; text: string }> = {
  active: { bg: 'bg-green-500/10 border-green-500/20', text: 'text-green-400' },
  completed: { bg: 'bg-blue-500/10 border-blue-500/20', text: 'text-blue-400' },
  archived: { bg: 'bg-gray-500/10 border-gray-500/20', text: 'text-gray-400' },
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function getStatusColors(status: string) {
  return statusColors[status] || statusColors.active
}

async function fetchItems() {
  try {
    error.value = null
    const data = await api.getItems()
    items.value = data
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to load items'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingItem.value = null
  formData.value = { title: '', description: '', status: 'active' }
  showModal.value = true
}

function openEdit(item: Item) {
  editingItem.value = item
  formData.value = { title: item.title, description: item.description, status: item.status }
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  editingItem.value = null
  formData.value = { title: '', description: '', status: 'active' }
}

async function handleSubmit() {
  if (!formData.value.title.trim()) return

  submitting.value = true
  try {
    if (editingItem.value) {
      const updated = await api.updateItem(editingItem.value.id, formData.value)
      items.value = items.value.map((i) => (i.id === updated.id ? updated : i))
    } else {
      const created = await api.createItem(formData.value)
      items.value = [created, ...items.value]
    }
    closeModal()
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Operation failed'
  } finally {
    submitting.value = false
  }
}

async function handleDelete(id: number) {
  try {
    await api.deleteItem(id)
    items.value = items.value.filter((i) => i.id !== id)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Failed to delete item'
  }
}

onMounted(fetchItems)
</script>

<template>
  <div class="min-h-screen bg-bg-primary">
    <NavBar />

    <main class="pt-24 pb-16 px-4 sm:px-6 lg:px-8">
      <div class="max-w-6xl mx-auto">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 class="text-3xl sm:text-4xl font-extrabold text-text-primary">Dashboard</h1>
            <p class="text-text-secondary mt-1">
              {{ items.length }} {{ items.length === 1 ? 'item' : 'items' }} in your database
            </p>
          </div>
          <button
            @click="openCreate"
            class="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-2xl bg-gradient-to-r from-accent-purple via-accent-indigo to-accent-blue hover:opacity-90 transition-all duration-200 shadow-2xl shadow-accent-purple/25 hover:shadow-accent-purple/40"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Add Item
          </button>
        </div>

        <!-- Error Banner -->
        <div
          v-if="error"
          class="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-between"
        >
          <span>{{ error }}</span>
          <button @click="error = null" class="text-red-400 hover:text-red-300">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Loading -->
        <div v-if="loading" class="flex items-center justify-center py-20">
          <div class="w-8 h-8 border-2 border-accent-purple/30 border-t-accent-purple rounded-full animate-spin" />
        </div>

        <!-- Empty State -->
        <div v-else-if="items.length === 0" class="text-center py-20">
          <div class="w-16 h-16 rounded-2xl bg-gradient-to-r from-accent-purple to-accent-blue flex items-center justify-center mx-auto mb-4 opacity-50">
            <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
            </svg>
          </div>
          <h3 class="text-lg font-medium text-text-primary mb-1">No items yet</h3>
          <p class="text-text-secondary mb-6">Get started by creating your first item.</p>
          <button
            @click="openCreate"
            class="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white rounded-2xl bg-gradient-to-r from-accent-purple to-accent-blue hover:opacity-90 transition-all duration-200"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Create First Item
          </button>
        </div>

        <!-- Items Grid -->
        <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          <div
            v-for="item in items"
            :key="item.id"
            class="group p-5 rounded-2xl border border-border-subtle bg-bg-card hover:bg-bg-card-hover hover:border-border-hover transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-black/20"
          >
            <!-- Status + Date -->
            <div class="flex items-center justify-between mb-3">
              <span
                :class="[getStatusColors(item.status).bg, getStatusColors(item.status).text]"
                class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border"
              >
                {{ item.status }}
              </span>
              <span class="text-xs text-text-muted">{{ formatDate(item.created_at) }}</span>
            </div>

            <!-- Title -->
            <h3 class="text-base font-semibold text-text-primary mb-2 line-clamp-1">{{ item.title }}</h3>

            <!-- Description -->
            <p class="text-sm text-text-secondary leading-relaxed mb-4 line-clamp-2 min-h-[2.5rem]">
              {{ item.description || 'No description' }}
            </p>

            <!-- Actions -->
            <div class="flex items-center gap-2 pt-3 border-t border-border-subtle">
              <button
                @click="openEdit(item)"
                class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary rounded-lg border border-border-subtle hover:border-accent-purple/50 hover:text-accent-purple hover:bg-accent-purple/5 transition-all duration-200"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
              <button
                @click="handleDelete(item.id)"
                class="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-text-secondary rounded-lg border border-border-subtle hover:border-red-500/50 hover:text-red-400 hover:bg-red-500/5 transition-all duration-200"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>

    <!-- Modal -->
    <Teleport to="body">
      <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeModal" />

        <!-- Modal Content -->
        <div class="relative w-full max-w-md rounded-2xl bg-bg-secondary border border-border-subtle p-6 shadow-2xl">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-lg font-semibold text-text-primary">
              {{ editingItem ? 'Edit Item' : 'New Item' }}
            </h2>
            <button
              @click="closeModal"
              class="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-card transition-colors"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <form @submit.prevent="handleSubmit" class="space-y-4">
            <!-- Title -->
            <div>
              <label class="block text-sm font-medium text-text-secondary mb-1.5">
                Title <span class="text-red-400">*</span>
              </label>
              <input
                v-model="formData.title"
                type="text"
                placeholder="Enter item title..."
                required
                class="w-full px-4 py-2.5 rounded-xl bg-bg-card border border-border-subtle text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/25 transition-all"
              />
            </div>

            <!-- Description -->
            <div>
              <label class="block text-sm font-medium text-text-secondary mb-1.5">Description</label>
              <textarea
                v-model="formData.description"
                placeholder="Enter description..."
                rows="3"
                class="w-full px-4 py-2.5 rounded-xl bg-bg-card border border-border-subtle text-text-primary placeholder-text-muted focus:outline-none focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/25 transition-all resize-none"
              />
            </div>

            <!-- Status -->
            <div>
              <label class="block text-sm font-medium text-text-secondary mb-1.5">Status</label>
              <select
                v-model="formData.status"
                class="w-full px-4 py-2.5 rounded-xl bg-bg-card border border-border-subtle text-text-primary focus:outline-none focus:border-accent-purple/50 focus:ring-1 focus:ring-accent-purple/25 transition-all"
              >
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                <option value="archived">Archived</option>
              </select>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-3 pt-2">
              <button
                type="button"
                @click="closeModal"
                class="flex-1 px-4 py-2.5 text-sm font-medium text-text-secondary rounded-xl border border-border-subtle hover:bg-bg-card transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                :disabled="submitting || !formData.title.trim()"
                class="flex-1 px-4 py-2.5 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-accent-purple to-accent-blue hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {{ submitting ? 'Saving...' : editingItem ? 'Update' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <FooterSection />
  </div>
</template>
