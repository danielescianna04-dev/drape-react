import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import TerminalScreen from '../features/terminal/TerminalScreen';
import { WorkstationScreen } from '../features/workstation/WorkstationScreen';
import { colors } from '../shared/theme/colors';

type RootTabParamList = {
  Terminal: undefined;
  Workstation: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Tab.Navigator
        id={undefined}>
        <Tab.Screen name="Terminal" component={TerminalScreen} />
        <Tab.Screen name="Workstation" component={WorkstationScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
};
