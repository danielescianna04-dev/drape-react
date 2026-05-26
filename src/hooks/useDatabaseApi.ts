import { useCallback } from 'react';
import { getSystemConfig } from '../core/config/systemConfig';
import { getAuthHeaders } from '../core/api/getAuthToken';

const API_URL = getSystemConfig().backend.apiUrl;

interface DatabaseFile {
  path: string;
  fullPath: string;
}

interface TableInfo {
  name: string;
  rowCount: number;
  /** Bynot Cloud system tables (users, sessions) are read-only. */
  system?: boolean;
}

interface RowsResult {
  rows: Record<string, any>[];
  columns: string[];
  total: number;
  /** Total ignoring virtual-table filters (only set for `users` table). */
  totalAll?: number;
  /** True when the default anonymous-user filter was applied. */
  anonymousFilterApplied?: boolean;
}

interface SchemaTable {
  name: string;
  sql: string;
  columns: { cid: number; name: string; type: string; notnull: number; dflt_value: any; pk: number }[];
  foreignKeys: { id: number; seq: number; table: string; from: string; to: string }[];
  rowCount: number;
}

interface Filter {
  column: string;
  op: 'eq' | 'neq' | 'gt' | 'lt' | 'like';
  value: string;
}

async function apiFetch(path: string, options?: RequestInit) {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...headers, ...options?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || body.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

export function useDatabaseApi(projectId: string | undefined) {
  const discover = useCallback(async (): Promise<{ databases: DatabaseFile[]; pgDetected: boolean; supabaseDetected?: boolean; supabaseUrl?: string; bynotCloudDetected?: boolean; containerReady?: boolean }> => {
    if (!projectId) throw new Error('No project');
    return apiFetch(`/db/discover/${projectId}`);
  }, [projectId]);

  const getTables = useCallback(async (dbPath: string): Promise<TableInfo[]> => {
    if (!projectId) throw new Error('No project');
    const data = await apiFetch(`/db/tables/${projectId}?db=${encodeURIComponent(dbPath)}`);
    return data.tables;
  }, [projectId]);

  const getRows = useCallback(async (dbPath: string, table: string, page = 0, limit = 50, filter?: Filter, opts?: { includeAnonymous?: boolean }): Promise<RowsResult> => {
    if (!projectId) throw new Error('No project');
    let url = `/db/rows/${projectId}?db=${encodeURIComponent(dbPath)}&table=${encodeURIComponent(table)}&page=${page}&limit=${limit}`;
    if (filter) {
      url += `&filterCol=${encodeURIComponent(filter.column)}&filterOp=${filter.op}&filterVal=${encodeURIComponent(filter.value)}`;
    }
    if (opts?.includeAnonymous) url += `&includeAnonymous=true`;
    return apiFetch(url);
  }, [projectId]);

  const getSchema = useCallback(async (dbPath: string): Promise<SchemaTable[]> => {
    if (!projectId) throw new Error('No project');
    const data = await apiFetch(`/db/schema/${projectId}?db=${encodeURIComponent(dbPath)}`);
    return data.schema;
  }, [projectId]);

  const updateCell = useCallback(async (dbPath: string, table: string, rowid: number, column: string, value: any) => {
    if (!projectId) throw new Error('No project');
    return apiFetch(`/db/update/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({ db: dbPath, table, rowid, column, value }),
    });
  }, [projectId]);

  const insertRow = useCallback(async (dbPath: string, table: string, values: Record<string, any>) => {
    if (!projectId) throw new Error('No project');
    return apiFetch(`/db/insert/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({ db: dbPath, table, values }),
    });
  }, [projectId]);

  const deleteRow = useCallback(async (dbPath: string, table: string, rowid: number) => {
    if (!projectId) throw new Error('No project');
    return apiFetch(`/db/delete/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({ db: dbPath, table, rowid }),
    });
  }, [projectId]);

  const createTable = useCallback(async (
    name: string,
    scope: 'shared' | 'mine' | 'junction',
    purpose?: string,
    fields?: { name: string; type: 'text' | 'number' | 'boolean' | 'date' | 'image' | 'reference'; references?: string }[],
    seedable?: boolean,
  ) => {
    if (!projectId) throw new Error('No project');
    return apiFetch(`/db/create-table/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({ name, scope, purpose, fields, seedable }),
    });
  }, [projectId]);

  const executeQuery = useCallback(async (dbPath: string, sql: string) => {
    if (!projectId) throw new Error('No project');
    return apiFetch(`/db/query/${projectId}`, {
      method: 'POST',
      body: JSON.stringify({ db: dbPath, sql }),
    });
  }, [projectId]);

  const exportCsv = useCallback(async (dbPath: string, table: string): Promise<string> => {
    if (!projectId) throw new Error('No project');
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_URL}/db/export/${projectId}?db=${encodeURIComponent(dbPath)}&table=${encodeURIComponent(table)}`, {
      headers,
    });
    return res.text();
  }, [projectId]);

  return { discover, getTables, getRows, getSchema, updateCell, insertRow, deleteRow, executeQuery, exportCsv, createTable };
}
