/**
 * Types for the Drape Cloud SDK. Ship alongside drape-cloud.js so
 * TypeScript projects get autocompletion without an extra build.
 */

export interface DrapeConfig {
  apiUrl: string;
  projectKey: string;
}

export type FilterScalar = string | number | boolean | null;

export interface FilterOperators {
  eq?: FilterScalar;
  neq?: FilterScalar;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
  like?: string;
  ilike?: string;
  in?: FilterScalar[];
}

export type Filter = Record<string, FilterScalar | FilterOperators>;

export interface ListOptions {
  where?: Filter;
  orderBy?: string;
  limit?: number;
  offset?: number;
  /** When true, only return rows the signed-in end user owns. */
  mine?: boolean;
}

export interface DrapeRow<T = Record<string, unknown>> {
  id: string;
  project_id: string;
  table_name: string;
  end_user_id: string | null;
  data: T;
  created_at: string;
  updated_at: string;
}

export interface ListResult<T = Record<string, unknown>> {
  rows: DrapeRow<T>[];
  limit: number;
  offset: number;
}

export interface EndUser {
  id: string;
  projectId: string;
  email: string | null;
  displayName: string | null;
  isAnonymous: boolean;
  anonymousId: string | null;
  createdAt: string;
}

export interface Session {
  token: string;
  projectId: string;
  endUserId: string;
  expiresAt: string;
}

export class DrapeError extends Error {
  code: string;
  status: number;
}

export interface TableApi<T = Record<string, unknown>> {
  list(opts?: ListOptions): Promise<ListResult<T>>;
  get(id: string): Promise<{ row: DrapeRow<T> }>;
  insert(data: Partial<T>, opts?: { mine?: boolean }): Promise<{ row: DrapeRow<T> }>;
  update(id: string, data: Partial<T>): Promise<{ row: DrapeRow<T> }>;
  delete(id: string): Promise<{ deleted: boolean }>;
}

export interface DrapeClient {
  table<T = Record<string, unknown>>(name: string): TableApi<T>;
  auth: {
    signUp(email: string, password: string, opts?: { displayName?: string }): Promise<{ user: EndUser; session: Session }>;
    signIn(email: string, password: string): Promise<{ user: EndUser; session: Session }>;
    signOut(): Promise<void>;
    user(): EndUser | null;
    refresh(): Promise<EndUser | null>;
  };
  /**
   * Build a publicly-shareable URL for a path inside the app. Use for QR
   * codes, "share link" buttons and any URL you hand to another device.
   * Transparently carries the preview token (?pt=) during dev mode so the
   * link works when scanned off-device; returns origin + path unchanged in
   * production.
   */
  publicUrl(path: string): string;
}

export function createDrape(config: DrapeConfig): DrapeClient;
