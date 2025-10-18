import React, { useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { SidebarTest } from './components/SidebarTest';

export const TerminalScreenTest = () => {
  const [showSidebar, setShowSidebar] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: '#090A0B' }}>
      {/* SidebarTest disabilitato per debug
      {showSidebar && <SidebarTest onClose={() => setShowSidebar(false)} />}
      */}
      
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ color: 'white', fontSize: 18 }}>Terminal Screen - Test</Text>
        <TouchableOpacity 
          style={{ backgroundColor: '#6F5CFF', padding: 12, borderRadius: 8, marginTop: 20 }}
          onPress={() => setShowSidebar(true)}
        >
          <Text style={{ color: 'white' }}>Open Sidebar (disabled)</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
