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
