import { supabase } from '../../lib/supabase/client';
import type { WorkstationInfo } from '../../shared/types';

/**
 * v2 workstationService — backed by Supabase `projects` table.
 * I file operativi (read/write/list/search) puntavano al backend Docker in v1.
 * In v2 questi metodi sono stub HTTP che il nuovo backend Express implementerà
 * usando Supabase Storage come file system. Per ora ritornano valori safe.
 */

type FileSearchResult = { file: string; line: number; content: string };

export const workstationService = {
  async saveWorkstation(workstation: WorkstationInfo): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) throw new Error('Not authenticated');

    const { error } = await supabase.from('projects').insert({
      user_id: userId,
      name: (workstation as any).name ?? 'Untitled',
      description: null,
      template: (workstation as any).language ?? null,
    });
    if (error) throw error;
  },

  async getWorkstations(): Promise<WorkstationInfo[]> {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return [];

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[workstationService] getWorkstations:', error);
      return [];
    }
    return (data ?? []) as unknown as WorkstationInfo[];
  },

  async deleteWorkstation(workstationId: string): Promise<void> {
    const { error } = await supabase.from('projects').delete().eq('id', workstationId);
    if (error) throw error;
  },

  async saveProjectWithId(
    projectId: string,
    name: string,
    userId: string,
    template?: string,
  ): Promise<void> {
    const { error } = await supabase
      .from('projects')
      .upsert(
        { id: projectId, user_id: userId, name, template: template ?? null },
        { onConflict: 'id' },
      );
    if (error) throw error;
  },

  async createEmptyWorkstation(name: string): Promise<WorkstationInfo> {
    const workstation: WorkstationInfo = {
      id: 'ws-' + Date.now(),
      name,
      url: '',
      status: 'idle',
      repositoryUrl: '',
      language: 'text',
      createdAt: new Date(),
      files: [],
    };
    await this.saveWorkstation(workstation);
    return workstation;
  },

  // ============================================================
  // File operations — TODO v2: route via nuovo backend Express che usa Supabase Storage.
  // Stub temporanei: nessuna operazione, ritornano valori safe.
  // ============================================================

  async getWorkstationFiles(
    _projectId: string,
    _repositoryUrl?: string,
    _gitToken?: string,
  ): Promise<string[]> {
    return [];
  },

  async searchInFiles(
    _projectId: string,
    _query: string,
    _repositoryUrl?: string,
  ): Promise<FileSearchResult[]> {
    return [];
  },

  async createFolder(_projectId: string, _path: string): Promise<void> {
    /* stub */
  },

  async saveFileContent(
    _projectId: string,
    _path: string,
    _content: string,
    _repositoryUrl?: string,
  ): Promise<void> {
    /* stub */
  },

  async deleteFile(_projectId: string, _path: string): Promise<void> {
    /* stub */
  },

  async moveFile(_projectId: string, _from: string, _to: string): Promise<void> {
    /* stub */
  },

  getApiUrl(): string {
    return process.env.EXPO_PUBLIC_API_URL ?? '';
  },
};

// Re-export legacy type alias
export type UserProject = WorkstationInfo;
