import { supabaseAdmin } from '../lib/supabase';

const BUCKET = 'project-files';

/**
 * Convenzione storage path: {user_id}/{project_id}/{relative_path}
 * RLS policies sul bucket garantiscono che ogni utente veda solo i propri file.
 */

function storageKey(userId: string, projectId: string, path: string): string {
  // Normalize path (no leading slash, no ..)
  const clean = path.replace(/^\/+/, '').replace(/\.\./g, '');
  return `${userId}/${projectId}/${clean}`;
}

export interface ProjectFileMeta {
  path: string;
  size: number;
  hash?: string;
  mime?: string;
  updatedAt: string;
}

export class SupabaseStorageService {
  /**
   * Upload (o overwrite) un singolo file di progetto.
   * Aggiorna anche il record `files` su Postgres per metadata.
   */
  async uploadFile(
    userId: string,
    projectId: string,
    path: string,
    content: Buffer | Uint8Array | string,
    mime?: string,
  ): Promise<void> {
    const key = storageKey(userId, projectId, path);
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf8') : Buffer.from(content);

    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(key, buffer, {
      contentType: mime ?? 'application/octet-stream',
      upsert: true,
    });
    if (uploadError) throw uploadError;

    // Upsert files row
    const { error: dbError } = await supabaseAdmin
      .from('files')
      .upsert(
        {
          project_id: projectId,
          user_id: userId,
          path,
          storage_key: key,
          size_bytes: buffer.length,
          mime_type: mime ?? null,
        },
        { onConflict: 'project_id,path' },
      );
    if (dbError) throw dbError;
  }

  /**
   * Scarica un file come Buffer.
   */
  async downloadFile(userId: string, projectId: string, path: string): Promise<Buffer> {
    const key = storageKey(userId, projectId, path);
    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(key);
    if (error) throw error;
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  /**
   * Lista i file di un progetto (da Postgres, è più veloce di listare Storage).
   */
  async listFiles(userId: string, projectId: string): Promise<ProjectFileMeta[]> {
    const { data, error } = await supabaseAdmin
      .from('files')
      .select('path, size_bytes, hash, mime_type, updated_at')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .order('path');
    if (error) throw error;
    return (data ?? []).map((r) => ({
      path: r.path,
      size: r.size_bytes ?? 0,
      hash: r.hash ?? undefined,
      mime: r.mime_type ?? undefined,
      updatedAt: r.updated_at,
    }));
  }

  /**
   * Cancella un singolo file.
   */
  async deleteFile(userId: string, projectId: string, path: string): Promise<void> {
    const key = storageKey(userId, projectId, path);
    const { error: storageError } = await supabaseAdmin.storage.from(BUCKET).remove([key]);
    if (storageError) throw storageError;
    await supabaseAdmin
      .from('files')
      .delete()
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .eq('path', path);
  }

  /**
   * Cancella tutti i file di un progetto (per delete progetto).
   */
  async deleteProjectFiles(userId: string, projectId: string): Promise<void> {
    const { data } = await supabaseAdmin
      .from('files')
      .select('storage_key')
      .eq('user_id', userId)
      .eq('project_id', projectId);
    const keys = (data ?? []).map((r) => r.storage_key).filter(Boolean) as string[];
    if (keys.length > 0) {
      await supabaseAdmin.storage.from(BUCKET).remove(keys);
    }
    await supabaseAdmin
      .from('files')
      .delete()
      .eq('user_id', userId)
      .eq('project_id', projectId);
  }

  /**
   * Genera un URL firmato per download client-side (es. Sandpack).
   */
  async createSignedUrl(
    userId: string,
    projectId: string,
    path: string,
    expiresInSec = 3600,
  ): Promise<string> {
    const key = storageKey(userId, projectId, path);
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(key, expiresInSec);
    if (error) throw error;
    return data.signedUrl;
  }
}

export const supabaseStorageService = new SupabaseStorageService();
