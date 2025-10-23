import React from 'react';
import { View, Text, Modal } from 'react-native';

export const GitHubAuthModal = ({ visible, onAuthenticate, onCancel, repositoryUrl }: { visible: boolean, onAuthenticate: (token: string) => void, onCancel: () => void, repositoryUrl: string }) => {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View>
        <Text>GitHub Auth Modal for {repositoryUrl}</Text>
      </View>
    </Modal>
  );
};