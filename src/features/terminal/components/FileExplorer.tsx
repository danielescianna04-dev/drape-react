import React from 'react';
import { View, Text } from 'react-native';

export const FileExplorer = ({ projectId, onFileSelect }: { projectId: string, onFileSelect: (path: string) => void }) => {
  return (
    <View>
      <Text>File Explorer for {projectId}</Text>
    </View>
  );
};