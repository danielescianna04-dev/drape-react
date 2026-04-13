import React from 'react';
import { FileViewer } from '../../features/terminal/components/FileViewer';
import { TerminalView } from '../../features/terminal/components/TerminalView';
import { GitHubView } from '../../features/terminal/components/views/GitHubView';
import { BrowserView } from '../../features/terminal/components/views/BrowserView';
import { PreviewView } from '../../features/terminal/components/views/PreviewView';
import { EnvVarsView } from '../../features/terminal/components/views/EnvVarsView';
import { TasksView } from '../../features/terminal/components/views/TasksView';
import { ShellView } from '../../features/terminal/components/views/ShellView';
import { DatabaseView } from '../../features/terminal/components/views/DatabaseView';
import { BuildReportView } from '../../features/terminal/components/views/BuildReportView';
import { InteractiveTerminalView } from '../../features/terminal/components/views/InteractiveTerminalView';
import type { Tab } from '../../core/tabs/tabStore';

interface Props {
  tab: Tab;
}

export const WorkspaceTabContent: React.FC<Props> = ({ tab }) => {
  switch (tab.type) {
    case 'file':
      return (
        <FileViewer
          visible={true}
          projectId={tab.data?.projectId || ''}
          filePath={tab.data?.filePath || ''}
          repositoryUrl={tab.data?.repositoryUrl || ''}
          userId="anonymous"
          onClose={() => {}}
          refreshKey={tab.data?.refreshKey}
        />
      );
    case 'terminal':
      return (
        <TerminalView
          terminalTabId={tab.id}
          sourceTabId={tab.data?.sourceTabId || tab.id}
        />
      );
    case 'github':
      return <GitHubView tab={tab} />;
    case 'browser':
      return <BrowserView tab={tab} />;
    case 'preview':
      return <PreviewView tab={tab} />;
    case 'shell':
      return <ShellView tab={tab} />;
    case 'envVars':
      return <EnvVarsView tab={tab} />;
    case 'tasks':
      return <TasksView tab={tab} />;
    case 'pty':
      return <InteractiveTerminalView tab={tab} />;
    case 'buildReport':
      return <BuildReportView tab={tab} />;
    case 'database':
      return <DatabaseView tab={tab} />;
    default:
      return null;
  }
};
