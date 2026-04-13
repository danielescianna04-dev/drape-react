import React from 'react';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';
import { VSCodeSidebar } from '../features/terminal/components/VSCodeSidebar';
import { FileViewer } from '../features/terminal/components/FileViewer';
import { PreviewTabWrapper } from './PreviewTabWrapper';
import ChatPage from '../pages/Chat/ChatPage';

interface Props {
  onExit: () => void;
}

export const WorkspaceScreen: React.FC<Props> = ({ onExit }) => (
  <Animated.View
    key="terminal-screen"
    entering={FadeInDown.duration(800)}
    exiting={FadeOut.duration(400)}
    style={{ flex: 1 }}
  >
    <VSCodeSidebar onExit={onExit}>
      {(tab, isCardMode, cardDimensions) => {
        if (tab.type === 'file') {
          return (
            <FileViewer
              visible={true}
              filePath={tab.data?.filePath || ''}
              projectId={tab.data?.projectId || ''}
              repositoryUrl={tab.data?.repositoryUrl}
              userId={tab.data?.userId || 'anonymous'}
              onClose={() => {}}
              refreshKey={tab.data?.refreshKey}
            />
          );
        }

        if (tab.type === 'preview') {
          return <PreviewTabWrapper />;
        }

        return <ChatPage tab={tab} isCardMode={isCardMode} cardDimensions={cardDimensions} />;
      }}
    </VSCodeSidebar>
  </Animated.View>
);
