import { api } from './client';

export interface AppwriteCredentials {
  databaseId: string;
  endpoint: string;
  projectId: string;
}

export const appwriteApi = {
  /**
   * Provisiona (o riusa) il database Appwrite per il progetto Bynot.
   * Idempotent — chiamabile più volte senza side effect.
   */
  provision(projectId: string): Promise<AppwriteCredentials> {
    return api.post<AppwriteCredentials>('/api/appwrite/provision', { projectId });
  },

  /**
   * Crea una collection Appwrite con schema dichiarativo.
   */
  createCollection(projectId: string, schema: {
    id: string;
    name: string;
    attributes: Array<{
      key: string;
      type: 'string' | 'integer' | 'boolean' | 'datetime' | 'email' | 'url' | 'enum';
      required?: boolean;
      default?: unknown;
      array?: boolean;
      size?: number;
      elements?: string[];
    }>;
    indexes?: Array<{ key: string; type: 'key' | 'fulltext' | 'unique'; attributes: string[] }>;
  }): Promise<{ ok: true }> {
    return api.post<{ ok: true }>('/api/appwrite/collections', { projectId, schema });
  },

  /**
   * Cancella il database Appwrite di un progetto.
   */
  deleteDatabase(projectId: string): Promise<{ ok: true }> {
    return api.del<{ ok: true }>(`/api/appwrite/database/${projectId}`);
  },
};
