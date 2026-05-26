import { useCallback, useState } from 'react';
import { appwriteApi, type AppwriteCredentials } from '../../lib/api/appwriteApi';
import { supabase } from '../../lib/supabase/client';

type ProvisionState = {
  loading: boolean;
  error: string | null;
  credentials: AppwriteCredentials | null;
};

/**
 * Hook per provisionare (o riusare) il database Appwrite per un progetto Bynot.
 *
 * Flow trasparente per l'utente:
 *   1. Click "Connetti database" nella UI
 *   2. Backend Bynot chiama Appwrite Management API
 *   3. Database creato (o riusato se già esiste)
 *   4. Credenziali ritornate e salvate in projects.appwrite_* su Supabase
 *
 * Nessun signup utente Appwrite. Tutto sotto il cofano.
 */
export function useProvisionDatabase(projectId: string) {
  const [state, setState] = useState<ProvisionState>({
    loading: false,
    error: null,
    credentials: null,
  });

  const provision = useCallback(async () => {
    setState({ loading: true, error: null, credentials: null });
    try {
      const credentials = await appwriteApi.provision(projectId);
      setState({ loading: false, error: null, credentials });
      return credentials;
    } catch (err: any) {
      const msg = err?.message ?? 'Provision failed';
      setState({ loading: false, error: msg, credentials: null });
      throw err;
    }
  }, [projectId]);

  /**
   * Recupera le credenziali Appwrite esistenti da Supabase senza chiamare il backend.
   * Utile per leggere stato cache-friendly senza extra round-trip.
   */
  const loadFromDb = useCallback(async (): Promise<AppwriteCredentials | null> => {
    const { data, error } = await supabase
      .from('projects')
      .select('appwrite_database_id, appwrite_endpoint, appwrite_project_id')
      .eq('id', projectId)
      .single();
    if (error || !data?.appwrite_database_id) return null;
    const creds: AppwriteCredentials = {
      databaseId: data.appwrite_database_id,
      endpoint: data.appwrite_endpoint ?? '',
      projectId: data.appwrite_project_id ?? '',
    };
    setState({ loading: false, error: null, credentials: creds });
    return creds;
  }, [projectId]);

  return { ...state, provision, loadFromDb };
}
