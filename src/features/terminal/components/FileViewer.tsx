import React from 'react';
import { View, Text } from 'react-native';

export const FileViewer = ({ visible, filePath, projectId, repositoryUrl, userId, onClose }: { visible: boolean, filePath: string, projectId: string, repositoryUrl: string, userId: string, onClose: () => void }) => {
  if (!visible) {
    return null;
  }

  return (
    <View>
      <Text>File Viewer</Text>
      <Text>Project ID: {projectId}</Text>
      <Text>File Path: {filePath}</Text>
    </View>
  );
};