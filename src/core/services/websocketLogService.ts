/**
 * WebSocket Log Service
 * Connects to backend WebSocket and receives real-time logs
 */

import { config } from '../../config/config';
import { getAuthToken } from '../api/getAuthToken';

type LogLevel = 'info' | 'error' | 'warn' | 'debug';

interface BackendLog {
  type: 'log';
  level: LogLevel;
  message: string;
  timestamp: string;
  workstationId?: string;
  tool?: string;
}

type LogCallback = (log: BackendLog) => void;

class WebSocketLogService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;
  private listeners: Set<LogCallback> = new Set();
  private isConnecting = false;
  private shouldReconnect = true;

  // DISABLED: WebSocket log service is disabled to prevent connection loops
  // and performance issues. Set to true to re-enable.
  private enabled = false;

  /**
   * Connect to the backend WebSocket
   */
  async connect(): Promise<void> {
    // Service is disabled
    if (!this.enabled) {
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.shouldReconnect = true;

    // Get WebSocket URL - need to add /ws path
    const baseWsUrl = `${config.wsUrl}/ws`;
    const authToken = await getAuthToken();
    const wsUrl = authToken ? `${baseWsUrl}?token=${encodeURIComponent(authToken)}` : baseWsUrl;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Only process log messages
          if (data.type === 'log') {
            this.notifyListeners(data as BackendLog);
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      this.ws.onerror = (error) => {
        console.error('[WebSocketLogService] Error:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.ws = null;

        // Attempt to reconnect
        if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => this.connect(), this.reconnectDelay);
        }
      };
    } catch (error) {
      console.error('[WebSocketLogService] Failed to connect:', error);
      this.isConnecting = false;
    }
  }

  /**
   * Disconnect from the backend WebSocket
   */
  disconnect(): void {
    this.shouldReconnect = false;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Add a listener for log messages
   */
  addListener(callback: LogCallback): () => void {
    this.listeners.add(callback);

    // Auto-connect when first listener is added
    if (this.listeners.size === 1) {
      this.connect();
    }

    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);

      // Auto-disconnect when no listeners
      if (this.listeners.size === 0) {
        this.disconnect();
      }
    };
  }

  /**
   * Notify all listeners of a new log
   */
  private notifyListeners(log: BackendLog): void {
    this.listeners.forEach((callback) => {
      try {
        callback(log);
      } catch (e) {
        // Ignore callback errors
      }
    });
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Export singleton instance
export const websocketLogService = new WebSocketLogService();
export type { BackendLog, LogLevel };
