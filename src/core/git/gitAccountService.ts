import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { collection, doc, setDoc, getDocs, deleteDoc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { encode as btoa, decode as atob } from 'base-64';

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
  icon: string;  // Ionicons name
  color: string;
  apiUrl: string;
  authUrl?: string;
  requiresServerUrl?: boolean;  // For self-hosted instances
}

export const GIT_PROVIDERS: GitProviderConfig[] = [
  {
    id: 'github',
    name: 'GitHub',
    icon: 'logo-github',
    color: '#24292e',
    apiUrl: 'https://api.github.com',
  },
  {
    id: 'github-enterprise',
    name: 'GitHub Enterprise',
    icon: 'logo-github',
    color: '#24292e',
    apiUrl: '',
    requiresServerUrl: true,
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    icon: 'git-branch',
    color: '#FC6D26',
    apiUrl: 'https://gitlab.com/api/v4',
  },
  {
    id: 'gitlab-server',
    name: 'GitLab Server',
    icon: 'git-branch',
    color: '#FC6D26',
    apiUrl: '',
    requiresServerUrl: true,
  },
  {
    id: 'bitbucket',
    name: 'Bitbucket',
    icon: 'logo-bitbucket',
    color: '#0052CC',
    apiUrl: 'https://api.bitbucket.org/2.0',
  },
  {
    id: 'bitbucket-server',
    name: 'Bitbucket Server',
    icon: 'logo-bitbucket',
    color: '#0052CC',
    apiUrl: '',
    requiresServerUrl: true,
  },
  {
    id: 'gitea',
    name: 'Gitea',
    icon: 'git-network',
    color: '#609926',
    apiUrl: '',
    requiresServerUrl: true,
  },
];

export interface GitAccount {
  id: string;
  provider: GitProvider;
  username: string;
  displayName?: string;
  avatarUrl: string;
  email?: string;
  serverUrl?: string;  // For self-hosted instances
  addedAt: Date;
}

const TOKEN_PREFIX = 'git-token-';
const ACCOUNTS_KEY = 'git-accounts';

// Simple obfuscation for tokens stored in Firebase
// Note: This is basic obfuscation, not encryption. Firebase security rules
// ensure only authenticated users can access their own data.
const obfuscateToken = (token: string, userId: string): string => {
  // Base64 encode with userId as salt prefix
  const saltedToken = `${userId.slice(0, 8)}:${token}`;
  return btoa(saltedToken);
};

const deobfuscateToken = (obfuscated: string, userId: string): string | null => {
  try {
    const decoded = atob(obfuscated);
    const prefix = `${userId.slice(0, 8)}:`;
    if (decoded.startsWith(prefix)) {
      return decoded.slice(prefix.length);
    }
    return null;
  } catch {
    return null;
  }
};

// Simple in-memory cache for getAllAccounts (prevents duplicate Firebase calls)
const accountsCache: {
  data: GitAccount[] | null;
  userId: string | null;
  timestamp: number;
} = { data: null, userId: null, timestamp: 0 };
const CACHE_TTL_MS = 30000; // 30 seconds

export const gitAccountService = {
  getProviderConfig(provider: GitProvider): GitProviderConfig | undefined {
    return GIT_PROVIDERS.find(p => p.id === provider);
  },

  async saveAccount(
    provider: GitProvider,
    token: string,
    userId: string,
    serverUrl?: string
  ): Promise<GitAccount | null> {
    try {
      // Fetch user info based on provider
      const userInfo = await this.fetchUserInfo(provider, token, serverUrl);

      const account: GitAccount = {
        id: `${userId}-${provider}-${userInfo.username}`,
        provider,
        username: userInfo.username,
        displayName: userInfo.displayName,
        avatarUrl: userInfo.avatarUrl,
        email: userInfo.email,
        serverUrl,
        addedAt: new Date(),
      };

      // Save token securely (local device)
      const tokenKey = `${TOKEN_PREFIX}${userId}-${provider}-${userInfo.username}`;
      await SecureStore.setItemAsync(tokenKey, token);

      // Save account to local storage
      await this.addAccountToList(account, userId);

      // Save account AND token to Firebase (user-specific path)
      // Token is obfuscated for basic protection
      try {
        const obfuscatedToken = obfuscateToken(token, userId);
        // Build Firebase document, excluding undefined fields (Firestore doesn't allow undefined)
        const firebaseData: Record<string, any> = {
          id: account.id,
          provider: account.provider,
          username: account.username,
          avatarUrl: account.avatarUrl,
          addedAt: account.addedAt.toISOString(),
          encryptedToken: obfuscatedToken,
        };
        // Only add optional fields if they have values
        if (account.displayName) firebaseData.displayName = account.displayName;
        if (account.email) firebaseData.email = account.email;
        if (account.serverUrl) firebaseData.serverUrl = account.serverUrl;

        await setDoc(doc(db, 'users', userId, 'git-accounts', account.id), firebaseData);
        console.log(`✅ [Firebase] Git account + token saved for user ${userId}:`, account.username);
      } catch (firebaseErr) {
        console.warn('⚠️ Could not save to Firebase:', firebaseErr);
      }

      console.log(`✅ ${provider} account saved:`, account.username);
      this.invalidateAccountsCache(); // Clear cache so next getAllAccounts fetches fresh data
      return account;
    } catch (error) {
      console.error(`Error saving ${provider} account:`, error);
      throw error;
    }
  },

  async fetchUserInfo(
    provider: GitProvider,
    token: string,
    serverUrl?: string
  ): Promise<{ username: string; displayName?: string; avatarUrl: string; email?: string }> {
    const config = this.getProviderConfig(provider);
    if (!config) throw new Error(`Unknown provider: ${provider}`);

    const baseUrl = serverUrl || config.apiUrl;

    switch (provider) {
      case 'github':
      case 'github-enterprise': {
        const response = await axios.get(`${baseUrl}/user`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github.v3+json',
          },
        });
        return {
          username: response.data.login,
          displayName: response.data.name,
          avatarUrl: response.data.avatar_url,
          email: response.data.email,
        };
      }

      case 'gitlab':
      case 'gitlab-server': {
        const response = await axios.get(`${baseUrl}/user`, {
          headers: {
            'PRIVATE-TOKEN': token,
          },
        });
        return {
          username: response.data.username,
          displayName: response.data.name,
          avatarUrl: response.data.avatar_url,
          email: response.data.email,
        };
      }

      case 'bitbucket':
      case 'bitbucket-server': {
        const response = await axios.get(`${baseUrl}/user`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        return {
          username: response.data.username || response.data.account_id,
          displayName: response.data.display_name,
          avatarUrl: response.data.links?.avatar?.href || '',
          email: response.data.email,
        };
      }

      case 'gitea': {
        const response = await axios.get(`${baseUrl}/api/v1/user`, {
          headers: {
            Authorization: `token ${token}`,
          },
        });
        return {
          username: response.data.login,
          displayName: response.data.full_name,
          avatarUrl: response.data.avatar_url,
          email: response.data.email,
        };
      }

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  },

  async addAccountToList(account: GitAccount, userId: string): Promise<void> {
    try {
      const accounts = await this.getAccounts(userId);
      const existingIndex = accounts.findIndex(
        a => a.provider === account.provider && a.username === account.username
      );

      if (existingIndex >= 0) {
        accounts[existingIndex] = account;
      } else {
        accounts.push(account);
      }

      await AsyncStorage.setItem(`${ACCOUNTS_KEY}-${userId}`, JSON.stringify(accounts));
    } catch (error) {
      console.error('Error saving account to list:', error);
    }
  },

  async getAccounts(userId: string): Promise<GitAccount[]> {
    try {
      const data = await AsyncStorage.getItem(`${ACCOUNTS_KEY}-${userId}`);
      if (data) {
        const accounts = JSON.parse(data) as GitAccount[];
        return accounts.map(a => ({
          ...a,
          addedAt: new Date(a.addedAt),
        }));
      }
      return [];
    } catch (error) {
      console.error('Error getting accounts:', error);
      return [];
    }
  },

  // Get all accounts for this user only (no shared accounts)
  // Uses local-first strategy: returns local accounts immediately, then syncs Firebase in background
  async getAllAccounts(userId: string): Promise<GitAccount[]> {
    // Check cache first (prevents duplicate Firebase calls on rapid open/close)
    const now = Date.now();
    if (
      accountsCache.data !== null &&
      accountsCache.userId === userId &&
      now - accountsCache.timestamp < CACHE_TTL_MS
    ) {
      console.log(`📥 [Cache] Using cached ${accountsCache.data.length} git accounts (${now - accountsCache.timestamp}ms old)`);
      return accountsCache.data;
    }

    try {
      // LOCAL-FIRST: Get local accounts immediately (fast)
      const localAccounts = await this.getAccounts(userId);
      console.log(`📥 [Local] Loaded ${localAccounts.length} git accounts`);

      // If we have local accounts, return them immediately and sync Firebase in background
      if (localAccounts.length > 0) {
        // Update cache with local accounts
        accountsCache.data = localAccounts;
        accountsCache.userId = userId;
        accountsCache.timestamp = now;

        // Sync Firebase in background (non-blocking)
        this.syncFirebaseInBackground(userId, localAccounts);

        return localAccounts;
      }

      // No local accounts - must wait for Firebase (first-time setup or new device)
      const firebaseAccounts: GitAccount[] = [];
      try {
        const accountsRef = collection(db, 'users', userId, 'git-accounts');
        const snapshot = await getDocs(accountsRef);
        snapshot.forEach(doc => {
          const data = doc.data();
          firebaseAccounts.push({
            ...data,
            id: doc.id,
            addedAt: new Date(data.addedAt),
          } as GitAccount);
        });
        console.log(`📥 [Firebase] Loaded ${firebaseAccounts.length} git accounts for user ${userId}`);

        // Update cache
        accountsCache.data = firebaseAccounts;
        accountsCache.userId = userId;
        accountsCache.timestamp = now;
      } catch (firebaseErr) {
        console.warn('⚠️ Could not load from Firebase:', firebaseErr);
      }

      return firebaseAccounts;
    } catch (error) {
      console.error('Error getting all accounts:', error);
      return [];
    }
  },

  // Background sync with Firebase (non-blocking)
  async syncFirebaseInBackground(userId: string, localAccounts: GitAccount[]): Promise<void> {
    try {
      const firebaseAccounts: GitAccount[] = [];
      const accountsRef = collection(db, 'users', userId, 'git-accounts');
      const snapshot = await getDocs(accountsRef);
      snapshot.forEach(doc => {
        const data = doc.data();
        firebaseAccounts.push({
          ...data,
          id: doc.id,
          addedAt: new Date(data.addedAt),
        } as GitAccount);
      });

      // Merge: prefer Firebase accounts, add any local-only accounts
      const firebaseUsernames = new Set(firebaseAccounts.map(a => `${a.provider}-${a.username}`));
      const mergedAccounts = [...firebaseAccounts];

      // If we have local accounts not in Firebase, sync them
      for (const local of localAccounts) {
        const key = `${local.provider}-${local.username}`;
        if (!firebaseUsernames.has(key)) {
          mergedAccounts.push(local);
          this.syncLocalAccountToFirebase(local, userId).catch(() => {});
        }
      }

      // Update cache with merged results
      const result = mergedAccounts.sort(
        (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
      );
      accountsCache.data = result;
      accountsCache.userId = userId;
      accountsCache.timestamp = Date.now();
      console.log(`📥 [Background] Firebase sync complete: ${result.length} accounts`);
    } catch (err) {
      console.warn('⚠️ Background Firebase sync failed:', err);
    }
  },

  // Invalidate cache (call after adding/removing accounts)
  invalidateAccountsCache() {
    accountsCache.data = null;
    accountsCache.userId = null;
    accountsCache.timestamp = 0;
    console.log('🗑️ [Cache] Accounts cache invalidated');
  },

  async getAccountsByProvider(userId: string, provider: GitProvider): Promise<GitAccount[]> {
    // Use getAllAccounts to include Firebase accounts (cross-device sync)
    const accounts = await this.getAllAccounts(userId);
    return accounts.filter(a => a.provider === provider);
  },

  async getToken(account: GitAccount, userId: string): Promise<string | null> {
    const key = `${TOKEN_PREFIX}${userId}-${account.provider}-${account.username}`;
    try {
      // Try local SecureStore first
      const localToken = await SecureStore.getItemAsync(key);
      if (localToken) {
        return localToken;
      }

      // If not in local, try to get from Firebase
      console.log(`🔍 Token not found locally, checking Firebase for ${account.username}...`);
      const accountId = `${userId}-${account.provider}-${account.username}`;
      const docRef = doc(db, 'users', userId, 'git-accounts', accountId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        if (data.encryptedToken) {
          const token = deobfuscateToken(data.encryptedToken, userId);
          if (token) {
            // Cache locally for faster access next time
            await SecureStore.setItemAsync(key, token);
            console.log(`✅ Token restored from Firebase for ${account.username}`);
            return token;
          }
        }
      }

      console.log(`⚠️ No token found for ${account.username}`);
      return null;
    } catch (error) {
      console.error('Error retrieving token:', error);
      return null;
    }
  },

  async getDefaultAccount(userId: string): Promise<GitAccount | null> {
    const accounts = await this.getAccounts(userId);
    if (accounts.length > 0) {
      // Return most recently added
      return accounts.sort(
        (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
      )[0];
    }
    return null;
  },

  async getDefaultToken(userId: string): Promise<{ token: string; account: GitAccount } | null> {
    const account = await this.getDefaultAccount(userId);
    if (account) {
      const token = await this.getToken(account, userId);
      if (token) {
        return { token, account };
      }
    }
    return null;
  },

  // Get token for a specific repository URL
  async getTokenForRepo(userId: string, repoUrl: string): Promise<{ token: string; account: GitAccount } | null> {
    const provider = this.detectProviderFromUrl(repoUrl);
    if (!provider) return null;

    const accounts = await this.getAccountsByProvider(userId, provider);
    if (accounts.length > 0) {
      const account = accounts[0]; // Use first matching provider account
      const token = await this.getToken(account, userId);
      if (token) {
        return { token, account };
      }
    }
    return null;
  },

  detectProviderFromUrl(url: string): GitProvider | null {
    const lowerUrl = url.toLowerCase();
    if (lowerUrl.includes('github.com')) return 'github';
    if (lowerUrl.includes('gitlab.com')) return 'gitlab';
    if (lowerUrl.includes('bitbucket.org')) return 'bitbucket';
    // For self-hosted, we'd need more context
    return null;
  },

  async deleteAccount(account: GitAccount, userId: string): Promise<void> {
    try {
      // Delete token from secure store
      const key = `${TOKEN_PREFIX}${userId}-${account.provider}-${account.username}`;
      await SecureStore.deleteItemAsync(key);

      // Remove from local accounts list
      const accounts = await this.getAccounts(userId);
      const filtered = accounts.filter(
        a => !(a.provider === account.provider && a.username === account.username)
      );
      await AsyncStorage.setItem(`${ACCOUNTS_KEY}-${userId}`, JSON.stringify(filtered));

      // Delete from Firebase (user-specific path)
      try {
        const accountId = `${userId}-${account.provider}-${account.username}`;
        await deleteDoc(doc(db, 'users', userId, 'git-accounts', accountId));
        console.log(`✅ [Firebase] Git account deleted for user ${userId}`);
      } catch (firebaseErr) {
        console.warn('⚠️ Could not delete from Firebase:', firebaseErr);
      }

      console.log(`✅ Account deleted: ${account.provider}/${account.username}`);
      this.invalidateAccountsCache(); // Clear cache so next getAllAccounts fetches fresh data
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  },

  async validateToken(provider: GitProvider, token: string, serverUrl?: string): Promise<boolean> {
    try {
      await this.fetchUserInfo(provider, token, serverUrl);
      return true;
    } catch {
      return false;
    }
  },

  // Sync all accounts and tokens from Firebase to local storage
  // Call this when user logs in to restore their accounts on new device
  async syncFromFirebase(userId: string): Promise<void> {
    try {
      console.log(`🔄 Syncing Git accounts from Firebase for user ${userId}...`);
      const accountsRef = collection(db, 'users', userId, 'git-accounts');
      const snapshot = await getDocs(accountsRef);

      const accounts: GitAccount[] = [];
      let tokensRestored = 0;

      for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const account: GitAccount = {
          id: docSnap.id,
          provider: data.provider,
          username: data.username,
          displayName: data.displayName,
          avatarUrl: data.avatarUrl,
          email: data.email,
          serverUrl: data.serverUrl,
          addedAt: new Date(data.addedAt),
        };
        accounts.push(account);

        // Restore token to local SecureStore
        if (data.encryptedToken) {
          const token = deobfuscateToken(data.encryptedToken, userId);
          if (token) {
            const key = `${TOKEN_PREFIX}${userId}-${account.provider}-${account.username}`;
            await SecureStore.setItemAsync(key, token);
            tokensRestored++;
          }
        }
      }

      // Save accounts to local AsyncStorage
      if (accounts.length > 0) {
        await AsyncStorage.setItem(`${ACCOUNTS_KEY}-${userId}`, JSON.stringify(accounts));
      }

      console.log(`✅ Synced ${accounts.length} accounts, restored ${tokensRestored} tokens from Firebase`);
    } catch (error) {
      console.error('Error syncing from Firebase:', error);
    }
  },

  // Sync a local account (and its token) to Firebase
  // This is called when we find local accounts not in Firebase
  async syncLocalAccountToFirebase(account: GitAccount, userId: string): Promise<void> {
    try {
      console.log(`🔄 [syncLocalAccountToFirebase] Syncing ${account.username} to Firebase...`);

      // Always use consistent ID format: userId-provider-username
      const accountId = `${userId}-${account.provider}-${account.username}`;

      // Get the token from local SecureStore - try both old and new key formats
      const newTokenKey = `${TOKEN_PREFIX}${userId}-${account.provider}-${account.username}`;
      const oldTokenKey = `${TOKEN_PREFIX}${account.provider}-${account.username}`;

      let token = await SecureStore.getItemAsync(newTokenKey);
      if (!token) {
        // Try old format without userId
        token = await SecureStore.getItemAsync(oldTokenKey);
        if (token) {
          console.log(`🔄 [syncLocalAccountToFirebase] Found token with old key format, migrating...`);
          // Migrate to new key format
          await SecureStore.setItemAsync(newTokenKey, token);
          await SecureStore.deleteItemAsync(oldTokenKey);
        }
      }

      if (!token) {
        console.log(`⚠️ [syncLocalAccountToFirebase] No token found for ${account.username}, skipping`);
        return;
      }

      // Build Firebase document, excluding undefined fields
      const obfuscatedToken = obfuscateToken(token, userId);
      const firebaseData: Record<string, any> = {
        id: accountId,
        provider: account.provider,
        username: account.username,
        avatarUrl: account.avatarUrl,
        addedAt: account.addedAt instanceof Date ? account.addedAt.toISOString() : account.addedAt,
        encryptedToken: obfuscatedToken,
      };

      // Only add optional fields if they have values
      if (account.displayName) firebaseData.displayName = account.displayName;
      if (account.email) firebaseData.email = account.email;
      if (account.serverUrl) firebaseData.serverUrl = account.serverUrl;

      await setDoc(doc(db, 'users', userId, 'git-accounts', accountId), firebaseData);
      console.log(`✅ [syncLocalAccountToFirebase] ${account.username} synced to Firebase with ID: ${accountId}`);
    } catch (error) {
      console.error(`❌ [syncLocalAccountToFirebase] Error syncing ${account.username}:`, error);
    }
  },
};
