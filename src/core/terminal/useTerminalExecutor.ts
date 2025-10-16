import { useTerminalStore } from './terminalStore';
import { terminalExecutor } from './terminalExecutor';
import { TerminalItemType } from '../../shared/types';
export const useTerminalExecutor = () => {
  const { addTerminalItem, setLoading, currentWorkstation } = useTerminalStore();

  const executeCommand = async (command: string, workstationId?: string) => {
    // Add command to terminal
    addTerminalItem({
      id: Date.now().toString(),
      type: TerminalItemType.COMMAND,
      content: command,
      timestamp: new Date(),
    });

    setLoading(true);

    try {
      const wsId = workstationId || currentWorkstation?.id || 'default';
      const result = await terminalExecutor.executeCommand(command, wsId);

      // Add output
      if (result.output) {
        addTerminalItem({
          id: (Date.now() + 1).toString(),
          type: TerminalItemType.OUTPUT,
          content: result.output,
          timestamp: new Date(),
        });
      }

      // Add error if any
      if (result.error) {
        addTerminalItem({
          id: (Date.now() + 2).toString(),
          type: TerminalItemType.ERROR,
          content: result.error,
          timestamp: new Date(),
        });
      }

      return result;
    } catch (error: any) {
      addTerminalItem({
        id: (Date.now() + 3).toString(),
        type: TerminalItemType.ERROR,
        content: error.message || 'Command execution failed',
        timestamp: new Date(),
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const runProject = async (language: string, workstationId?: string) => {
    const wsId = workstationId || currentWorkstation?.id;
    if (!wsId) {
      throw new Error('No workstation selected');
    }

    addTerminalItem({
      id: Date.now().toString(),
      type: TerminalItemType.SYSTEM,
      content: `🚀 Starting ${language} project...`,
      timestamp: new Date(),
    });

    return terminalExecutor.runProject(wsId, language);
  };

  const installDependencies = async (language: string, workstationId?: string) => {
    const wsId = workstationId || currentWorkstation?.id;
    if (!wsId) {
      throw new Error('No workstation selected');
    }

    addTerminalItem({
      id: Date.now().toString(),
      type: TerminalItemType.SYSTEM,
      content: `📦 Installing dependencies for ${language}...`,
      timestamp: new Date(),
    });

    return terminalExecutor.installDependencies(wsId, language);
  };

  const cloneRepo = async (repoUrl: string, workstationId?: string) => {
    const wsId = workstationId || 'default';

    addTerminalItem({
      id: Date.now().toString(),
      type: TerminalItemType.SYSTEM,
      content: `📥 Cloning repository: ${repoUrl}`,
      timestamp: new Date(),
    });

    return terminalExecutor.cloneRepository(repoUrl, wsId);
  };

  return {
    executeCommand,
    runProject,
    installDependencies,
    cloneRepo,
  };
};
