/**
 * Server Log Service - Global SSE connection for server logs
 * This service maintains the SSE connection even when PreviewPanel is closed
 */

import { logOutput, logError } from '../terminal/terminalLogger';

class ServerLogService {
  private xhr: XMLHttpRequest | null = null;
  private currentWorkstationId: string | null = null;
  private apiUrl: string | null = null;
  private lastIndex = 0;

  /**
   * Connect to server logs SSE stream
   */
  connect(workstationId: string, apiUrl: string): void {
    // Don't reconnect if already connected to the same workstation
    if (this.currentWorkstationId === workstationId && this.xhr) {
      console.log(`📺 Already connected to logs for: ${workstationId}`);
      return;
    }

    // Close existing connection
    this.disconnect();

    this.currentWorkstationId = workstationId;
    this.apiUrl = apiUrl;
    this.lastIndex = 0;

    console.log(`📺 [ServerLogService] Connecting to server logs for: ${workstationId}`);

    const xhr = new XMLHttpRequest();
    xhr.open('GET', `${apiUrl}/preview/logs/${workstationId}`);

    xhr.onprogress = () => {
      const newData = xhr.responseText.substring(this.lastIndex);
      this.lastIndex = xhr.responseText.length;

      if (newData.length > 0) {
        console.log(`📺 [ServerLogService] SSE received data (${newData.length} bytes)`);
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
      console.log(`📺 [ServerLogService] SSE readyState: ${xhr.readyState}, status: ${xhr.status}`);

      // If connection closed unexpectedly and we should be connected, try to reconnect
      if (xhr.readyState === 4 && this.currentWorkstationId === workstationId) {
        console.log(`📺 [ServerLogService] Connection closed, will not auto-reconnect`);
      }
    };

    xhr.onerror = () => {
      console.log('📺 [ServerLogService] Server logs connection error');
    };

    xhr.send();
    this.xhr = xhr;
    console.log(`📺 [ServerLogService] SSE request sent to: ${apiUrl}/preview/logs/${workstationId}`);
  }

  /**
   * Disconnect from server logs
   */
  disconnect(): void {
    if (this.xhr) {
      console.log(`📺 [ServerLogService] Disconnecting from server logs for: ${this.currentWorkstationId}`);
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
