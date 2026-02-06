import apiClient from '../api/apiClient';
import { config } from '../../config/config';

export interface AIMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AIResponse {
  content: string;
  model: string;
}

export class AIService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.apiUrl;
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url;
  }

  async sendMessage(messages: AIMessage[], model: string = 'auto'): Promise<AIResponse> {
    try {
      const response = await apiClient.post(
        `${this.baseUrl}${config.endpoints.chat}`,
        { messages, model },
        {
          timeout: config.settings.apiTimeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error) {
      if (config.settings.enableLogging) {
        console.error('AI Service Error:', error);
      }
      throw error;
    }
  }

  async executeCommand(command: string): Promise<string> {
    try {
      const response = await apiClient.post(
        `${this.baseUrl}${config.endpoints.terminal}`,
        { command },
        {
          timeout: config.settings.apiTimeout,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data.output;
    } catch (error) {
      if (config.settings.enableLogging) {
        console.error('Command Execution Error:', error);
      }
      throw error;
    }
  }

  async executeAgent(task: string): Promise<any> {
    try {
      const response = await apiClient.post(
        `${this.baseUrl}${config.endpoints.agent}`,
        { task },
        {
          timeout: config.settings.apiTimeout * 3,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
      return response.data;
    } catch (error) {
      if (config.settings.enableLogging) {
        console.error('Agent Execution Error:', error);
      }
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await apiClient.get(
        `${this.baseUrl}${config.endpoints.health}`,
        { timeout: 5000 }
      );
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  async analyzeProject(workstationId: string): Promise<{
    files: string[];
    structure: any;
    summary: string;
  }> {
    try {
      const response = await apiClient.post(
        `${this.baseUrl}/ai/analyze-project`,
        { workstationId },
        { timeout: 30000 }
      );
      return response.data;
    } catch (error) {
      console.error('Project Analysis Error:', error);
      throw error;
    }
  }

  async modifyFile(workstationId: string, filePath: string, content: string): Promise<void> {
    try {
      await apiClient.post(
        `${this.baseUrl}/workstation/modify-file`,
        { workstationId, filePath, content },
        { timeout: 10000 }
      );
    } catch (error) {
      console.error('File Modification Error:', error);
      throw error;
    }
  }

  /**
   * Send message with full project context
   * Fetches project files and key contents before sending to AI
   */
  async sendMessageWithContext(
    messages: AIMessage[],
    workstationId: string,
    userId: string,
    username: string,
    model: string = 'auto'
  ): Promise<AIResponse> {
    try {
      // Fetch project context from the agent
      const contextResponse = await apiClient.get(
        `${this.baseUrl}/preview/context/${workstationId}?userId=${userId}&username=${username}`,
        { timeout: 10000 }
      );

      const context = contextResponse.data.projectContext || { files: [], contents: {} };

      // Build context string
      let contextStr = '';
      if (context.files.length > 0) {
        contextStr += `Project files:\n${context.files.slice(0, 30).join('\n')}\n\n`;
      }
      if (Object.keys(context.contents).length > 0) {
        contextStr += `Key files content:\n${Object.entries(context.contents)
          .map(([file, content]) => `--- ${file} ---\n${content}`)
          .join('\n\n')}\n\n`;
      }

      // Prepend context to the last user message
      const enhancedMessages = messages.map((msg, idx) => {
        if (idx === messages.length - 1 && msg.role === 'user' && contextStr) {
          return {
            ...msg,
            content: `[Project Context]\n${contextStr}\n[User Question]\n${msg.content}`
          };
        }
        return msg;
      });

      return this.sendMessage(enhancedMessages, model);

    } catch (error) {
      // If context fetch fails, send without context
      console.warn('⚠️ [AI] Failed to get project context, sending without:', error);
      return this.sendMessage(messages, model);
    }
  }
}

export const aiService = new AIService();
