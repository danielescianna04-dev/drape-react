/**
 * Server Log Service - Global SSE connection for server logs
 * This service maintains the SSE connection even when PreviewPanel is closed
 */

import { logOutput, logError } from '../terminal/terminalLogger';
import { getAuthToken } from '../api/getAuthToken';

class ServerLogService {
  private xhr: XMLHttpRequest | null = null;
  private currentWorkstationId: string | null = null;
  private apiUrl: string | null = null;
  private lastIndex = 0;

  /**
   * Connect to server logs SSE stream
   */
  async connect(workstationId: string, apiUrl: string): Promise<void> {
    // Don't reconnect if already connected to the same workstation
    if (this.currentWorkstationId === workstationId && this.xhr) {
      return;
    }

    // Close existing connection
    this.disconnect();

    this.currentWorkstationId = workstationId;
    this.apiUrl = apiUrl;
    this.lastIndex = 0;

    const authToken = await getAuthToken();
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${apiUrl}/preview/logs/${workstationId}`);
    if (authToken) {
      xhr.setRequestHeader('Authorization', `Bearer ${authToken}`);
    }

    xhr.onprogress = () => {
      const newData = xhr.responseText.substring(this.lastIndex);
      this.lastIndex = xhr.responseText.length;

      if (newData.length > 0) {
      }

      // Parse SSE events
      const lines = newData.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const log = JSON.parse(line.substring(6));
            if (log.message && log.message.trim()) {
              // Log to terminal based on type
              if (log.type === 'stderr' || log.type === 'error') {
                logError(`[Server] ${log.message}`, 'preview');
              } else {
                logOutput(`[Server] ${log.message}`, 'preview', 0);
              }
            }
          } catch (e) {
            // Ignore parse errors for partial data
          }
        }
      }
    };

    xhr.onreadystatechange = () => {

      // If connection closed unexpectedly and we should be connected, try to reconnect
      if (xhr.readyState === 4 && this.currentWorkstationId === workstationId) {
      }
    };

    xhr.onerror = () => {
    };

    xhr.send();
    this.xhr = xhr;
  }

  /**
   * Disconnect from server logs
   */
  disconnect(): void {
    if (this.xhr) {
      this.xhr.abort();
      this.xhr = null;
    }
    this.currentWorkstationId = null;
    this.lastIndex = 0;
  }

  /**
   * Check if connected to a specific workstation
   */
  isConnectedTo(workstationId: string): boolean {
    return this.currentWorkstationId === workstationId && this.xhr !== null;
  }

  /**
   * Get current workstation ID
   */
  getCurrentWorkstationId(): string | null {
    return this.currentWorkstationId;
  }
}

// Export singleton instance
export const serverLogService = new ServerLogService();
