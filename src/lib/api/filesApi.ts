import { api } from './client';

export interface ProjectFileMeta {
  path: string;
  size: number;
  hash?: string;
  mime?: string;
  updatedAt: string;
}

export const filesApi = {
  list(projectId: string): Promise<{ files: ProjectFileMeta[] }> {
    return api.get(`/api/files/${projectId}`);
  },

  /**
   * Upload (o overwrite) un singolo file di progetto.
   * @param encoding 'utf8' per testo, 'base64' per binari
   */
  upload(
    projectId: string,
    path: string,
    content: string,
    options: { mime?: string; encoding?: 'utf8' | 'base64' } = {},
  ): Promise<{ ok: true; path: string; size: number }> {
    return api.post(`/api/files/${projectId}`, {
      path,
      content,
      mime: options.mime,
      encoding: options.encoding ?? 'utf8',
    });
  },

  /**
   * Scarica contenuto file (utf8 di default).
   */
  download(
    projectId: string,
    path: string,
    encoding: 'utf8' | 'base64' = 'utf8',
  ): Promise<{ path: string; content: string; encoding: 'utf8' | 'base64' }> {
    return api.get(
      `/api/files/${projectId}/content?path=${encodeURIComponent(path)}&encoding=${encoding}`,
    );
  },

  /**
   * URL firmato (1h) — usato dal client Sandpack per download diretto.
   */
  signedUrl(projectId: string, path: string): Promise<{ url: string }> {
    return api.get(
      `/api/files/${projectId}/signed-url?path=${encodeURIComponent(path)}`,
    );
  },

  delete(projectId: string, path?: string): Promise<{ ok: true }> {
    const suffix = path ? `?path=${encodeURIComponent(path)}` : '';
    return api.del(`/api/files/${projectId}${suffix}`);
  },
};
