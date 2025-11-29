import axios from 'axios';
import { logCommand, logOutput, logError } from './terminalLogger';
import { TerminalSource } from '../../shared/types';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8080';

export interface CommandResult {
  output: string;
  error?: string;
  exitCode: number;
  executionTime: number;
}

export interface TerminalSession {
  sessionId: string;
  workingDirectory: string;
  environment: Record<string, string>;
}

class TerminalExecutor {
  private sessions: Map<string, TerminalSession> = new Map();

  async executeCommand(
    command: string,
    workstationId: string,
    cwd?: string,
    source: TerminalSource = 'ai' // Default to 'ai' since this executor is mainly used by AI
  ): Promise<CommandResult> {
    // Log the command to global terminal
    logCommand(command, source);

    try {
      const response = await axios.post(`${API_URL}/terminal/execute`, {
        command,
        workstationId,
        cwd: cwd || '~',
        timeout: 30000,
      });

      const result = {
        output: response.data.output || '',
        error: response.data.error,
        exitCode: response.data.exitCode || 0,
        executionTime: response.data.executionTime || 0,
      };

      // Log the output/error to global terminal
      if (result.error) {
        logError(result.error, source);
      } else if (result.output) {
        logOutput(result.output, source, result.exitCode);
      }

      return result;
    } catch (error: any) {
      const errorMsg = error.response?.data?.error || error.message || 'Command execution failed';
      // Log error to global terminal
      logError(errorMsg, source);

      return {
        output: '',
        error: errorMsg,
        exitCode: 1,
        executionTime: 0,
      };
    }
  }

  async createSession(workstationId: string): Promise<TerminalSession> {
    try {
      const response = await axios.post(`${API_URL}/terminal/session`, {
        workstationId,
      });

      const session: TerminalSession = {
        sessionId: response.data.sessionId,
        workingDirectory: response.data.cwd || '~',
        environment: response.data.env || {},
      };

      this.sessions.set(workstationId, session);
      return session;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || 'Failed to create session');
    }
  }

  async installDependencies(workstationId: string, language: string): Promise<CommandResult> {
    const commands: Record<string, string> = {
      'JavaScript': 'npm install',
      'TypeScript': 'npm install',
      'Python': 'pip install -r requirements.txt',
      'Java': 'mvn install',
      'Go': 'go mod download',
      'Rust': 'cargo build',
    };

    const command = commands[language] || 'echo "No install command for this language"';
    return this.executeCommand(command, workstationId);
  }

  async runProject(workstationId: string, language: string): Promise<CommandResult> {
    const commands: Record<string, string> = {
      'JavaScript': 'npm start',
      'TypeScript': 'npm start',
      'Python': 'python main.py',
      'Java': 'mvn exec:java',
      'Go': 'go run .',
      'Rust': 'cargo run',
    };

    const command = commands[language] || 'echo "No run command for this language"';
    return this.executeCommand(command, workstationId);
  }

  async cloneRepository(repoUrl: string, workstationId: string): Promise<CommandResult> {
    const command = `git clone ${repoUrl}`;
    return this.executeCommand(command, workstationId);
  }

  async gitCommand(
    workstationId: string,
    gitCommand: string,
    args: string[] = []
  ): Promise<CommandResult> {
    const command = `git ${gitCommand} ${args.join(' ')}`;
    return this.executeCommand(command, workstationId);
  }

  getSession(workstationId: string): TerminalSession | undefined {
    return this.sessions.get(workstationId);
  }

  clearSession(workstationId: string): void {
    this.sessions.delete(workstationId);
  }
}

export const terminalExecutor = new TerminalExecutor();
