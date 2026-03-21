export interface Item {
  id: number;
  title: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface CreateItemInput {
  title: string;
  description?: string;
  status?: string;
}

export interface UpdateItemInput {
  title?: string;
  description?: string;
  status?: string;
}

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001/api' : '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export const api = {
  getItems: () => request<Item[]>('/items'),

  createItem: (data: CreateItemInput) =>
    request<Item>('/items', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateItem: (id: number, data: UpdateItemInput) =>
    request<Item>(`/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteItem: (id: number) =>
    request<{ success: boolean; id: number }>(`/items/${id}`, {
      method: 'DELETE',
    }),
};
