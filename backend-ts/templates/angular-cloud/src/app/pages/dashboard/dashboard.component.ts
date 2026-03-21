import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { ApiService, Item } from '../../services/api.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  template: `
    <section class="pt-28 pb-16 px-4 min-h-screen">
      <div class="max-w-6xl mx-auto">
        <!-- Header -->
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <div class="flex items-center gap-3 mb-2">
              <h1 class="text-3xl font-bold text-white">Dashboard</h1>
              <span class="px-3 py-1 text-sm font-medium rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                {{ items().length }} items
              </span>
            </div>
            <p class="text-gray-400">Manage your items with full CRUD operations powered by SQLite.</p>
          </div>
          <button
            (click)="openCreateModal()"
            class="inline-flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/25 hover:-translate-y-0.5 active:translate-y-0"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            Add Item
          </button>
        </div>

        <!-- Stats -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div class="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl p-4">
            <div class="text-2xl font-bold text-white">{{ items().length }}</div>
            <div class="text-sm text-gray-400">Total Items</div>
          </div>
          <div class="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl p-4">
            <div class="text-2xl font-bold text-green-400">{{ activeCount() }}</div>
            <div class="text-sm text-gray-400">Active</div>
          </div>
          <div class="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl p-4">
            <div class="text-2xl font-bold text-blue-400">{{ completedCount() }}</div>
            <div class="text-sm text-gray-400">Completed</div>
          </div>
        </div>

        <!-- Empty State -->
        @if (items().length === 0) {
          <div class="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-12 text-center">
            <div class="text-4xl mb-4">&#128466;</div>
            <h3 class="text-lg font-semibold text-white mb-2">No items yet</h3>
            <p class="text-gray-400 mb-6">Create your first item to get started.</p>
            <button
              (click)="openCreateModal()"
              class="inline-flex items-center gap-2 px-8 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all duration-300"
            >
              Create First Item
            </button>
          </div>
        } @else {
          <!-- Items Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            @for (item of items(); track item.id) {
              <div class="bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl p-5 hover:bg-white/[0.08] transition-all duration-300 hover:-translate-y-0.5 group">
                <div class="flex items-start justify-between mb-3">
                  <h3 class="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors line-clamp-1">
                    {{ item.title }}
                  </h3>
                  <button
                    (click)="toggleStatus(item)"
                    class="shrink-0 ml-2 px-2.5 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer"
                    [ngClass]="{
                      'bg-green-500/10 text-green-400 border border-green-500/20 hover:bg-green-500/20': item.status === 'active',
                      'bg-blue-500/10 text-blue-400 border border-blue-500/20 hover:bg-blue-500/20': item.status === 'completed'
                    }"
                  >
                    {{ item.status }}
                  </button>
                </div>

                @if (item.description) {
                  <p class="text-sm text-gray-400 mb-4 line-clamp-2">{{ item.description }}</p>
                }

                <div class="flex items-center justify-between mt-auto pt-3 border-t border-white/5">
                  <span class="text-xs text-gray-400">{{ formatDate(item.created_at) }}</span>
                  <div class="flex items-center gap-1">
                    <button
                      (click)="openEditModal(item)"
                      class="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
                      title="Edit"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      (click)="deleteItem(item.id)"
                      class="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      title="Delete"
                    >
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </section>

    <!-- Modal -->
    @if (showModal()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4" (click)="closeModal()">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
        <div
          class="relative w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl rounded-2xl p-6"
          (click)="$event.stopPropagation()"
        >
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-xl font-bold text-white">
              {{ editingItem() ? 'Edit Item' : 'New Item' }}
            </h2>
            <button (click)="closeModal()" class="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          @if (error()) {
            <div class="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {{ error() }}
            </div>
          }

          <form (ngSubmit)="handleSubmit()">
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1.5">Title</label>
                <input
                  type="text"
                  [(ngModel)]="formTitle"
                  name="title"
                  placeholder="Enter item title..."
                  class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-colors"
                />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1.5">Description</label>
                <textarea
                  [(ngModel)]="formDescription"
                  name="description"
                  placeholder="Enter description..."
                  rows="3"
                  class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/25 transition-colors resize-none"
                ></textarea>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-400 mb-1.5">Status</label>
                <select
                  [(ngModel)]="formStatus"
                  name="status"
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
                (click)="closeModal()"
                class="flex-1 px-8 py-3 rounded-xl font-semibold bg-white/5 backdrop-blur-xl border border-white/10 hover:bg-white/10 transition-all duration-300 text-center text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                [disabled]="loading()"
                class="flex-1 px-8 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all duration-300 text-center disabled:opacity-50"
              >
                {{ loading() ? 'Saving...' : editingItem() ? 'Update' : 'Create' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .line-clamp-1 {
      overflow: hidden;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
    }
    .line-clamp-2 {
      overflow: hidden;
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
    }
  `],
})
export class DashboardComponent implements OnInit {
  items = signal<Item[]>([]);
  showModal = signal(false);
  editingItem = signal<Item | null>(null);
  loading = signal(false);
  error = signal('');

  formTitle = '';
  formDescription = '';
  formStatus = 'active';

  activeCount = computed(() => this.items().filter(i => i.status === 'active').length);
  completedCount = computed(() => this.items().filter(i => i.status === 'completed').length);

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadItems();
  }

  loadItems() {
    this.api.getItems().subscribe({
      next: (items) => this.items.set(items),
      error: (err) => console.error('Failed to load items:', err),
    });
  }

  openCreateModal() {
    this.editingItem.set(null);
    this.formTitle = '';
    this.formDescription = '';
    this.formStatus = 'active';
    this.error.set('');
    this.showModal.set(true);
  }

  openEditModal(item: Item) {
    this.editingItem.set(item);
    this.formTitle = item.title;
    this.formDescription = item.description;
    this.formStatus = item.status;
    this.error.set('');
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
    this.editingItem.set(null);
    this.error.set('');
  }

  handleSubmit() {
    if (!this.formTitle.trim()) {
      this.error.set('Title is required');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    const editing = this.editingItem();
    if (editing) {
      this.api.updateItem(editing.id, {
        title: this.formTitle,
        description: this.formDescription,
        status: this.formStatus,
      }).subscribe({
        next: (updated) => {
          this.items.update(items => items.map(i => i.id === updated.id ? updated : i));
          this.closeModal();
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set('Failed to update item');
          this.loading.set(false);
        },
      });
    } else {
      this.api.createItem({
        title: this.formTitle,
        description: this.formDescription,
        status: this.formStatus,
      }).subscribe({
        next: (created) => {
          this.items.update(items => [created, ...items]);
          this.closeModal();
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set('Failed to create item');
          this.loading.set(false);
        },
      });
    }
  }

  deleteItem(id: number) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    this.api.deleteItem(id).subscribe({
      next: () => {
        this.items.update(items => items.filter(i => i.id !== id));
      },
      error: (err) => console.error('Failed to delete item:', err),
    });
  }

  toggleStatus(item: Item) {
    const newStatus = item.status === 'active' ? 'completed' : 'active';
    this.api.updateItem(item.id, { status: newStatus }).subscribe({
      next: (updated) => {
        this.items.update(items => items.map(i => i.id === updated.id ? updated : i));
      },
      error: (err) => console.error('Failed to update status:', err),
    });
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
}
