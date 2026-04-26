// Skills (Plugins) API client. Mirrors backend `/skills` endpoints.

import { config } from '../../config/config';
import { getAuthHeaders } from './getAuthToken';

export type SkillCategory = 'design' | 'build' | 'review' | 'ops' | 'data' | 'other';

export interface SkillExample {
  prompt: string;
  outcome?: string;
}

export interface Skill {
  id: string;
  slash: string;
  name: string;
  description: string;
  category: SkillCategory;
  body: string;
  tags: string[];
  examples: SkillExample[];
  ownerUid: string | null;
  authorUsername: string | null;
  isOfficial: boolean;
  isPrivate: boolean;
  sourceMarketplaceId: string | null;
  installCount: number;
  likeCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface SkillDraftInput {
  slash: string;
  name: string;
  description: string;
  category: SkillCategory;
  body: string;
  tags?: string[];
  examples?: SkillExample[];
}

const BASE = `${config.apiUrl}/skills`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = { raw: text }; }
  }
  if (!res.ok) {
    const msg = body?.error || body?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body as T;
}

export const skillsApi = {
  listMine(): Promise<{ skills: Skill[] }> {
    return request('/mine');
  },

  listMarketplace(opts: { search?: string; category?: SkillCategory; limit?: number } = {}): Promise<{ skills: Skill[] }> {
    const qs = new URLSearchParams();
    if (opts.search) qs.set('search', opts.search);
    if (opts.category) qs.set('category', opts.category);
    if (opts.limit) qs.set('limit', String(opts.limit));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request(`/marketplace${suffix}`);
  },

  get(id: string, opts: { fromMarketplace?: boolean } = {}): Promise<{ skill: Skill }> {
    const suffix = opts.fromMarketplace ? '?source=marketplace' : '';
    return request(`/${encodeURIComponent(id)}${suffix}`);
  },

  create(input: SkillDraftInput): Promise<{ skill: Skill }> {
    return request('/', { method: 'POST', body: JSON.stringify(input) });
  },

  update(id: string, patch: Partial<SkillDraftInput>): Promise<{ skill: Skill }> {
    return request(`/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  },

  delete(id: string): Promise<{ success: true }> {
    return request(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  publish(id: string): Promise<{ skill: Skill }> {
    return request(`/${encodeURIComponent(id)}/publish`, { method: 'POST' });
  },

  install(marketplaceId: string): Promise<{ skill: Skill }> {
    return request(`/marketplace/${encodeURIComponent(marketplaceId)}/install`, { method: 'POST' });
  },
};

export const SKILL_CATEGORIES: { id: SkillCategory; label: string; icon: string }[] = [
  { id: 'build',  label: 'Build',   icon: 'construct-outline' },
  { id: 'design', label: 'Design',  icon: 'color-palette-outline' },
  { id: 'review', label: 'Review',  icon: 'shield-checkmark-outline' },
  { id: 'ops',    label: 'Ops',     icon: 'settings-outline' },
  { id: 'data',   label: 'Data',    icon: 'analytics-outline' },
  { id: 'other',  label: 'Altro',   icon: 'ellipsis-horizontal' },
];
