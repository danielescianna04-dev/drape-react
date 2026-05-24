import { supabase } from '../../lib/supabase/client';
import type { WorkstationInfo, ProjectFolder } from '../../shared/types';

/**
 * v2 ProjectService — backed by Supabase `projects` table.
 * "Workstation" concept from v1 (1 Docker container = 1 workstation) is replaced
 * by Bynot projects in v2. Folders TBD (no schema yet).
 */

async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export class ProjectService {
  // Projects (ex-workstations)
  static async saveWorkstation(workstation: WorkstationInfo): Promise<string> {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error('User not authenticated');

    const { data, error } = await supabase
      .from('projects')
      .insert({
        user_id: userId,
        name: (workstation as any).name ?? 'Untitled',
        description: (workstation as any).description ?? null,
        template: (workstation as any).template ?? null,
      })
      .select('id')
      .single();
    if (error) throw error;
    return data.id;
  }

  static async loadWorkstations(): Promise<WorkstationInfo[]> {
    const userId = await getCurrentUserId();
    if (!userId) return [];

    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) {
      console.error('[ProjectService] loadWorkstations:', error);
      return [];
    }
    return (data ?? []) as unknown as WorkstationInfo[];
  }

  static async deleteWorkstation(workstationId: string): Promise<void> {
    const { error } = await supabase.from('projects').delete().eq('id', workstationId);
    if (error) throw error;
  }

  static async updateWorkstation(workstationId: string, updates: Partial<WorkstationInfo>): Promise<void> {
    const { error } = await supabase
      .from('projects')
      .update(updates as any)
      .eq('id', workstationId);
    if (error) throw error;
  }

  // Project Folders — TODO v2: add `project_folders` table if needed.
  // For now, stub returns empty array and warns on writes.
  static async saveFolder(_folder: ProjectFolder): Promise<string> {
    console.warn('[ProjectService] saveFolder: project_folders table not yet implemented in v2');
    return '';
  }

  static async loadFolders(): Promise<ProjectFolder[]> {
    return [];
  }

  static async deleteFolder(_folderId: string): Promise<void> {
    console.warn('[ProjectService] deleteFolder: project_folders table not yet implemented in v2');
  }
}
