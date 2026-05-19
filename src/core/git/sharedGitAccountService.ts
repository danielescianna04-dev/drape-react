// v2 stub: la "shared pool" globale di git accounts (visibile a tutti gli utenti)
// è stata rimossa in v2 perché era un info leak. In v2 ogni utente vede solo i propri account.
// Manteniamo l'API per compat caller, ma tutti i metodi sono no-op / return null/empty.

import type { GitProvider } from './gitAccountService';

export interface SharedGitAccount {
  id: string;
  provider: GitProvider;
  username: string;
  displayName?: string;
  avatarUrl: string;
  email?: string;
  serverUrl?: string;
  addedBy: string;
  addedAt: Date;
}

export const sharedGitAccountService = {
  async saveSharedAccount(): Promise<SharedGitAccount | null> {
    return null;
  },
  async getSharedAccounts(): Promise<SharedGitAccount[]> {
    return [];
  },
  async deleteSharedAccount(): Promise<void> {
    /* no-op */
  },
  async getSharedAccount(): Promise<SharedGitAccount | null> {
    return null;
  },
};
