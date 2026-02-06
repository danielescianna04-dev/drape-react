/**
 * Terminal Logger - Utility to log commands from anywhere in the app
 * All logged commands will appear in the TerminalView when viewing "All" mode
 */
import { useUIStore } from './uiStore';
import { TerminalItemType, TerminalSource } from '../../shared/types';

type LogType = 'command' | 'output' | 'error' | 'system';

/**
 * Log a command or output to the global terminal log
 * This will appear in the Terminal tab when viewing all commands
 */
export const logToTerminal = (
  content: string,
  type: LogType,
  source: TerminalSource,
  exitCode?: number
) => {
  const typeMap: Record<LogType, TerminalItemType> = {
    command: TerminalItemType.COMMAND,
    output: TerminalItemType.OUTPUT,
    error: TerminalItemType.ERROR,
    system: TerminalItemType.SYSTEM,
  };

  useUIStore.getState().addGlobalTerminalLog({
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    content,
    type: typeMap[type],
    timestamp: new Date(),
    source,
    exitCode,
  });
};

/**
 * Log a command execution (input)
 */
export const logCommand = (command: string, source: TerminalSource) => {
  logToTerminal(command, 'command', source);
};

/**
 * Log command output
 */
export const logOutput = (output: string, source: TerminalSource, exitCode?: number) => {
  logToTerminal(output, 'output', source, exitCode);
};

/**
 * Log an error
 */
export const logError = (error: string, source: TerminalSource) => {
  logToTerminal(error, 'error', source);
};

/**
 * Log a system message
 */
export const logSystem = (message: string, source: TerminalSource) => {
  logToTerminal(message, 'system', source);
};
