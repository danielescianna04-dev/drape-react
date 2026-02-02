import { Session } from '../types';
import { sessionService } from './session.service';
import { devServerService } from './dev-server.service';
import { log } from '../utils/logger';

class PreviewService {
  /**
   * Get preview URL for a project (if running)
   */
  async getPreviewUrl(projectId: string): Promise<string | null> {
    const session = await sessionService.get(projectId);
    if (!session) return null;

    const isRunning = await devServerService.isRunning(session.agentUrl);
    if (!isRunning) return null;

    return this.buildUrl(session);
  }

  /**
   * Quick check: is the preview ready? (for fast path)
   */
  async isReady(projectId: string): Promise<boolean> {
    const session = await sessionService.get(projectId);
    if (!session) return false;
    return devServerService.isRunning(session.agentUrl);
  }

  buildUrl(session: Session): string {
    if (session.previewPort) {
      // Use server host + mapped port
      const host = session.serverId === 'local' ? 'localhost' :
        session.agentUrl.replace(/http:\/\//, '').split(':')[0];
      return `http://${host}:${session.previewPort}`;
    }
    // Fallback: proxy through agent (agent proxies to localhost:3000)
    return session.agentUrl;
  }
}

export const previewService = new PreviewService();
