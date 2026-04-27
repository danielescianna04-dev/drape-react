/**
 * MCP marketplace API client. Mirrors `skillsApi` but with the MCP-specific
 * shape (command/args/env vs prompt body) and extra mutations for env values
 * + enabled toggle.
 */

import { config } from '../../config/config';
import { getAuthToken } from './getAuthToken';

export type McpCategory = 'productivity' | 'dev' | 'data' | 'design' | 'web' | 'other';

export interface McpEnvDecl {
  name: string;
  label?: string;
  description?: string;
  isSecret?: boolean;
  placeholder?: string;
  required?: boolean;
}

export interface McpServer {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: McpCategory;
  command: string;
  args: string[];
  env: McpEnvDecl[];
  envValues: Record<string, string>;
  tags: string[];
  ownerUid: string | null;
  authorUsername: string | null;
  isOfficial: boolean;
  isPrivate: boolean;
  sourceMarketplaceId: string | null;
  installCount: number;
  isEnabled: boolean;
  createdAt: number;
  updatedAt: number;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${config.apiUrl}${path}`, { ...(init || {}), headers: { ...headers, ...(init?.headers as any) } });
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const mcpApi = {
  async listMine(): Promise<{ mcps: McpServer[] }> {
    return jsonOrThrow(await authedFetch('/mcps/mine'));
  },

  async listMarketplace(opts?: { search?: string; category?: McpCategory; limit?: number }): Promise<{ mcps: McpServer[] }> {
    const params = new URLSearchParams();
    if (opts?.search) params.set('search', opts.search);
    if (opts?.category) params.set('category', opts.category);
    if (opts?.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return jsonOrThrow(await authedFetch(`/mcps/marketplace${qs ? `?${qs}` : ''}`));
  },

  async get(id: string, opts?: { fromMarketplace?: boolean }): Promise<{ mcp: McpServer }> {
    const qs = opts?.fromMarketplace ? '?source=marketplace' : '';
    return jsonOrThrow(await authedFetch(`/mcps/${encodeURIComponent(id)}${qs}`));
  },

  async install(marketplaceId: string): Promise<{ mcp: McpServer }> {
    return jsonOrThrow(await authedFetch(`/mcps/marketplace/${encodeURIComponent(marketplaceId)}/install`, {
      method: 'POST',
    }));
  },

  async setEnvValues(id: string, envValues: Record<string, string>): Promise<{ mcp: McpServer }> {
    return jsonOrThrow(await authedFetch(`/mcps/${encodeURIComponent(id)}/env`, {
      method: 'PATCH',
      body: JSON.stringify({ envValues }),
    }));
  },

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    await jsonOrThrow(await authedFetch(`/mcps/${encodeURIComponent(id)}/enabled`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }));
  },

  async remove(id: string): Promise<void> {
    await jsonOrThrow(await authedFetch(`/mcps/${encodeURIComponent(id)}`, { method: 'DELETE' }));
  },
};
