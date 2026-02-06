import { collection, doc, setDoc, getDocs, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { GitProvider } from './gitAccountService';

const COLLECTION = 'shared-git-accounts';

export interface SharedGitAccount {
  id: string;
  provider: GitProvider;
  username: string;
  displayName?: string;
  avatarUrl: string;
  email?: string;
  serverUrl?: string;
  addedBy: string; // userId who added this account
  addedAt: Date;
}

export const sharedGitAccountService = {
  // Save account to Firebase (visible to all users)
  async saveSharedAccount(
    provider: GitProvider,
    username: string,
    avatarUrl: string,
    addedBy: string,
    options?: {
      displayName?: string;
      email?: string;
      serverUrl?: string;
    }
  ): Promise<SharedGitAccount> {
    const id = `${provider}-${username}`;
    const account: SharedGitAccount = {
      id,
      provider,
      username,
      avatarUrl,
      displayName: options?.displayName,
      email: options?.email,
      serverUrl: options?.serverUrl,
      addedBy,
      addedAt: new Date(),
    };

    await setDoc(doc(db, COLLECTION, id), {
      ...account,
      addedAt: account.addedAt.toISOString(),
    });

    return account;
  },

  // Get all shared accounts (visible to all users)
  async getSharedAccounts(): Promise<SharedGitAccount[]> {
    try {
      const q = query(collection(db, COLLECTION), orderBy('addedAt', 'desc'));
      const snapshot = await getDocs(q);

      const accounts: SharedGitAccount[] = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          id: doc.id,
          addedAt: new Date(data.addedAt),
        } as SharedGitAccount;
      });

      return accounts;
    } catch (error) {
      console.error('❌ [SharedGitAccount] Error loading:', error);
      return [];
    }
  },

  // Get shared accounts by provider
  async getSharedAccountsByProvider(provider: GitProvider): Promise<SharedGitAccount[]> {
    const accounts = await this.getSharedAccounts();
    return accounts.filter(a => a.provider === provider);
  },

  // Check if account exists in shared accounts
  async hasSharedAccount(provider: GitProvider, username: string): Promise<boolean> {
    const accounts = await this.getSharedAccounts();
    return accounts.some(a => a.provider === provider && a.username === username);
  },

  // Delete shared account (only the user who added it can delete)
  async deleteSharedAccount(provider: GitProvider, username: string, userId: string): Promise<boolean> {
    const id = `${provider}-${username}`;
    const accounts = await this.getSharedAccounts();
    const account = accounts.find(a => a.id === id);

    if (!account) {
      return false;
    }

    // Only the user who added it can delete
    if (account.addedBy !== userId) {
      return false;
    }

    await deleteDoc(doc(db, COLLECTION, id));
    return true;
  },
};
