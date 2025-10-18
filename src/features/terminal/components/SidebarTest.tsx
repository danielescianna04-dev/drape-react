import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';

interface Props {
  onClose: () => void;
}

export const SidebarTest = ({ onClose }: Props) => {
  return (
    <View style={{ 
      position: 'absolute', 
      left: 0, 
      top: 0, 
      bottom: 0, 
      width: 300, 
      backgroundColor: '#1a1a1a', 
      padding: 20,
      zIndex: 1000 
    }}>
      <Text style={{ color: 'white', fontSize: 18, marginBottom: 20 }}>Sidebar Test</Text>
      <TouchableOpacity 
        style={{ backgroundColor: '#6F5CFF', padding: 12, borderRadius: 8, alignItems: 'center', marginBottom: 20 }}
        onPress={onClose}
      >
        <Text style={{ color: 'white' }}>Close</Text>
      </TouchableOpacity>
      <Text style={{ color: 'white', fontSize: 14 }}>Import GitHub functionality will be added here</Text>
    </View>
  );
};
