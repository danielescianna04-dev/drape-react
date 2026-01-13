import { config } from '../../config/config';

type WebSocketMessage = {
  type: string;
  [key: string]: any;
};

type FileChangeEvent = {
  type: 'file_created' | 'file_deleted';
  path: string;
  projectId: string;
  timestamp: number;
};

type FileChangeListener = (event: FileChangeEvent) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private listeners: Map<string, Set<FileChangeListener>> = new Map();
  private subscribedProjects: Set<string> = new Set();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 2000;

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('🔌 WebSocket already connected');
      return;
    }

    const wsUrl = config.apiUrl.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws';
    console.log('🔌 Connecting to WebSocket:', wsUrl);

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('🔌 WebSocket connected');
        this.reconnectAttempts = 0;

        // Resubscribe to all projects
        this.subscribedProjects.forEach(projectId => {
          this.sendSubscribe(projectId);
        });
      };

      this.ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          this.handleMessage(message);
        } catch (err) {
          console.error('WebSocket message parse error:', err);
        }
      };

      this.ws.onerror = (error) => {
        console.error('🔌 WebSocket error:', error);
      };

      this.ws.onclose = () => {
        console.log('🔌 WebSocket disconnected');
        this.ws = null;
        this.scheduleReconnect();
      };
    } catch (err) {
      console.error('WebSocket connection error:', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('🔌 Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`🔌 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private sendSubscribe(projectId: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('🔌 Cannot subscribe - WebSocket not connected');
      return;
    }

    this.ws.send(JSON.stringify({
      type: 'subscribe_files',
      projectId
    }));

    console.log('🔌 Subscribed to file changes for project:', projectId);
  }

  private handleMessage(message: WebSocketMessage) {
    switch (message.type) {
      case 'connected':
        console.log('🔌 WebSocket handshake:', message.message);
        break;

      case 'subscribed_files':
        console.log('🔌 File subscription confirmed:', message.projectId);
        break;

      case 'file_created':
      case 'file_deleted':
        this.notifyListeners(message.projectId, message as FileChangeEvent);
        break;

      case 'pong':
        // Heartbeat response
        break;

      case 'error':
        console.error('🔌 WebSocket error message:', message.message);
        break;

      default:
        // console.log('🔌 Unknown message type:', message.type);
        break;
    }
  }

  private notifyListeners(projectId: string, event: FileChangeEvent) {
    const projectListeners = this.listeners.get(projectId);
    if (!projectListeners || projectListeners.size === 0) return;

    console.log(`📡 Notifying ${projectListeners.size} listener(s) for project ${projectId}: ${event.type} ${event.path}`);

    projectListeners.forEach(listener => {
      try {
        listener(event);
      } catch (err) {
        console.error('Error in file change listener:', err);
      }
    });
  }

  subscribeToFiles(projectId: string, listener: FileChangeListener) {
    if (!this.listeners.has(projectId)) {
      this.listeners.set(projectId, new Set());
    }

    this.listeners.get(projectId)!.add(listener);
    this.subscribedProjects.add(projectId);

    // Connect if not already connected
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
    } else {
      this.sendSubscribe(projectId);
    }

    console.log('🔌 Added file change listener for project:', projectId);
  }

  unsubscribeFromFiles(projectId: string, listener: FileChangeListener) {
    const projectListeners = this.listeners.get(projectId);
    if (projectListeners) {
      projectListeners.delete(listener);

      if (projectListeners.size === 0) {
        this.listeners.delete(projectId);
        this.subscribedProjects.delete(projectId);

        // Unsubscribe from backend
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            type: 'unsubscribe_files',
            projectId
          }));
        }

        console.log('🔌 Removed all listeners for project:', projectId);
      }
    }
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.listeners.clear();
    this.subscribedProjects.clear();
    this.reconnectAttempts = 0;

    console.log('🔌 WebSocket disconnected and cleaned up');
  }

  // Send heartbeat ping
  ping() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'ping' }));
    }
  }
}

export const websocketService = new WebSocketService();
