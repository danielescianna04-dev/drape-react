import { supabase } from '../../lib/supabase/client';

// Supported Git providers
export type GitProvider =
  | 'github'
  | 'github-enterprise'
  | 'gitlab'
  | 'gitlab-server'
  | 'bitbucket'
  | 'bitbucket-server'
  | 'gitea';

export interface GitProviderConfig {
  id: GitProvider;
  name: string;
  icon: string;
  color: string;
  apiUrl: string;
  authUrl?: string;
  requiresServerUrl?: boolean;
  requiresUsername?: boolean;
}

export const GIT_PROVIDERS: GitProviderConfig[] = [
  { id: 'github', name: 'GitHub', icon: 'logo-github', color: '#24292e', apiUrl: 'https://api.github.com' },
  { id: 'github-enterprise', name: 'GitHub Enterprise', icon: 'logo-github', color: '#24292e', apiUrl: '', requiresServerUrl: true },
  { id: 'gitlab', name: 'GitLab', icon: 'git-branch', color: '#FC6D26', apiUrl: 'https://gitlab.com/api/v4' },
  { id: 'gitlab-server', name: 'GitLab Server', icon: 'git-branch', color: '#FC6D26', apiUrl: '', requiresServerUrl: true },
  { id: 'bitbucket', name: 'Bitbucket', icon: 'logo-bitbucket', color: '#0052CC', apiUrl: 'https://api.bitbucket.org/2.0', requiresUsername: true },
  { id: 'bitbucket-server', name: 'Bitbucket Server', icon: 'logo-bitbucket', color: '#0052CC', apiUrl: '', requiresServerUrl: true, requiresUsername: true },
  { id: 'gitea', name: 'Gitea', icon: 'git-network', color: '#609926', apiUrl: '', requiresServerUrl: true },
];

export interface GitAccount {
  id: string;
  provider: GitProvider;
  username: string;
  displayName?: string;
  avatarUrl: string;
  email?: string;
  serverUrl?: string;
  addedAt: Date;
}

// Simple in-memory cache
const accountsCache: { data: GitAccount[] | null; userId: string | null; timestamp: number } = {
  data: null,
  userId: null,
  timestamp: 0,
};
const CACHE_TTL_MS = 30000;

type GitAccountRow = {
  id: string;
  user_id: string;
  provider: string;
  username: string;
  avatar_url: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: string | null;
  server_url: string | null;
  is_default: boolean;
  metadata: any;
  created_at: string;
};

function rowToAccount(row: GitAccountRow): GitAccount {
  const meta = (row.metadata ?? {}) as { displayName?: string; email?: string };
  return {
    id: row.id,
    provider: row.provider as GitProvider,
    username: row.username,
    displayName: meta.displayName,
    avatarUrl: row.avatar_url ?? '',
    email: meta.email,
    serverUrl: row.server_url ?? undefined,
    addedAt: new Date(row.created_at),
  };
}

async function fetchProviderUserInfo(
  provider: GitProvider,
  token: string,
  serverUrl?: string,
): Promise<{ username: string; displayName?: string; avatarUrl: string; email?: string }> {
  const cfg = GIT_PROVIDERS.find((p) => p.id === provider);
  if (!cfg) throw new Error(`Unknown provider: ${provider}`);
  const apiUrl = cfg.requiresServerUrl ? serverUrl ?? '' : cfg.apiUrl;
  if (!apiUrl) throw new Error('API URL missing');

  if (provider === 'github' || provider === 'github-enterprise') {
    const res = await fetch(`${apiUrl}/user`, { headers: { Authorization: `token ${token}` } });
    if (!res.ok) throw new Error(`GitHub auth failed: ${res.status}`);
    const u = await res.json();
    return { username: u.login, displayName: u.name, avatarUrl: u.avatar_url, email: u.email };
  }
  if (provider === 'gitlab' || provider === 'gitlab-server') {
    const res = await fetch(`${apiUrl}/user`, { headers: { 'PRIVATE-TOKEN': token } });
    if (!res.ok) throw new Error(`GitLab auth failed: ${res.status}`);
    const u = await res.json();
    return { username: u.username, displayName: u.name, avatarUrl: u.avatar_url, email: u.email };
  }
  if (provider === 'bitbucket' || provider === 'bitbucket-server') {
    const res = await fetch(`${apiUrl}/user`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Bitbucket auth failed: ${res.status}`);
    const u = await res.json();
    return {
      username: u.username ?? u.nickname ?? '',
      displayName: u.display_name,
      avatarUrl: u.links?.avatar?.href ?? '',
    };
  }
  // gitea + fallback
  const res = await fetch(`${apiUrl}/user`, { headers: { Authorization: `token ${token}` } });
  if (!res.ok) throw new Error(`Auth failed: ${res.status}`);
  const u = await res.json();
  return {
    username: u.login ?? u.username ?? '',
    displayName: u.full_name,
    avatarUrl: u.avatar_url ?? '',
    email: u.email,
  };
}

export const gitAccountService = {
  getProviderConfig(provider: GitProvider): GitProviderConfig | undefined {
    return GIT_PROVIDERS.find((p) => p.id === provider);
  },

  detectProviderFromUrl(url: string): GitProvider | null {
    if (!url) return null;
    const lower = url.toLowerCase();
    if (lower.includes('github.com')) return 'github';
    if (lower.includes('gitlab.com')) return 'gitlab';
    if (lower.includes('bitbucket.org')) return 'bitbucket';
    return null;
  },

  invalidateAccountsCache() {
    accountsCache.data = null;
    accountsCache.userId = null;
    accountsCache.timestamp = 0;
  },

  async saveAccount(
    provider: GitProvider,
    token: string,
    userId: string,
    serverUrl?: string,
  ): Promise<GitAccount | null> {
    try {
      const info = await fetchProviderUserInfo(provider, token, serverUrl);

      const { data, error } = await supabase
        .from('git_accounts')
        .upsert(
          {
            user_id: userId,
            provider,
            username: info.username,
            avatar_url: info.avatarUrl,
            access_token: token,
            server_url: serverUrl ?? null,
            metadata: { displayName: info.displayName, email: info.email },
          },
          { onConflict: 'user_id,provider,username,server_url' },
        )
        .select('*')
        .single();
      if (error) throw error;

      this.invalidateAccountsCache();
      return rowToAccount(data as GitAccountRow);
    } catch (e) {
      console.error('[gitAccountService] saveAccount:', e);
      return null;
    }
  },

  async getAllAccounts(userId: string): Promise<GitAccount[]> {
    const now = Date.now();
    if (accountsCache.userId === userId && accountsCache.data && now - accountsCache.timestamp < CACHE_TTL_MS) {
      return accountsCache.data;
    }
    const { data, error } = await supabase
      .from('git_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[gitAccountService] getAllAccounts:', error);
      return [];
    }
    const accounts = (data ?? []).map((r) => rowToAccount(r as GitAccountRow));
    accountsCache.data = accounts;
    accountsCache.userId = userId;
    accountsCache.timestamp = now;
    return accounts;
  },

  async getAccounts(userId: string): Promise<GitAccount[]> {
    return this.getAllAccounts(userId);
  },

  async getToken(account: GitAccount, userId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('git_accounts')
      .select('access_token')
      .eq('id', account.id)
      .eq('user_id', userId)
      .single();
    if (error || !data) return null;
    return data.access_token;
  },

  async getDefaultToken(userId: string): Promise<{ token: string; account: GitAccount } | null> {
    const { data, error } = await supabase
      .from('git_accounts')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return { token: data.access_token, account: rowToAccount(data as GitAccountRow) };
  },

  async getTokenForRepo(userId: string, repoUrl: string): Promise<{ token: string; account: GitAccount } | null> {
    const provider = this.detectProviderFromUrl(repoUrl);
    if (!provider) return this.getDefaultToken(userId);
    const { data, error } = await supabase
      .from('git_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', provider)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (error || !data) return this.getDefaultToken(userId);
    return { token: data.access_token, account: rowToAccount(data as GitAccountRow) };
  },

  async deleteAccount(account: GitAccount, userId: string): Promise<void> {
    const { error } = await supabase
      .from('git_accounts')
      .delete()
      .eq('id', account.id)
      .eq('user_id', userId);
    if (error) throw error;
    this.invalidateAccountsCache();
  },

  async fetchUserInfo(provider: GitProvider, token: string, serverUrl?: string) {
    return fetchProviderUserInfo(provider, token, serverUrl);
  },
};
