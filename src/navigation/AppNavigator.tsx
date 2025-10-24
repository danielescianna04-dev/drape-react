import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import TerminalScreen from '../features/terminal/TerminalScreen';
import { WorkstationScreen } from '../features/workstation/WorkstationScreen';
import ChatScreen from '../features/chat/ChatScreen'; // New import
import { colors } from '../shared/theme/colors';

type RootTabParamList = {
  Terminal: undefined;
  Workstation: undefined;
  Chat: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export const AppNavigator: React.FC = () => (
  <NavigationContainer>
    <Tab.Navigator
      id={undefined}
      screenOptions={{
        lazy: false, // Explicitly set to boolean
        tabBarHideOnKeyboard: false, // Explicitly set to boolean
      }}>
              <Tab.Screen name="Terminal" component={TerminalScreen} />
              {/* <Tab.Screen name="Workstation" component={WorkstationScreen} /> */}
              {/* <Tab.Screen name="Chat" component={ChatScreen} /> */}
            </Tab.Navigator>  </NavigationContainer>
);
