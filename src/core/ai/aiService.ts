import axios from 'axios';
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

  async sendMessage(messages: AIMessage[], model: string = 'auto'): Promise<AIResponse> {
    try {
      const response = await axios.post(
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
      const response = await axios.post(
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
      const response = await axios.post(
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
      const response = await axios.get(
        `${this.baseUrl}${config.endpoints.health}`,
        { timeout: 5000 }
      );
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }
}

export const aiService = new AIService();

  async analyzeProject(workstationId: string): Promise<{
    files: string[];
    structure: any;
    summary: string;
  }> {
    try {
      const response = await axios.post(
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
      await axios.post(
        `${this.baseUrl}/workstation/modify-file`,
        { workstationId, filePath, content },
        { timeout: 10000 }
      );
    } catch (error) {
      console.error('File Modification Error:', error);
      throw error;
    }
  }
