import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { TerminalScreen } from '../features/terminal/TerminalScreen';
import { WorkstationScreen } from '../features/workstation/WorkstationScreen';
import { colors } from '../shared/theme/colors';

const Tab = createBottomTabNavigator();

export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap;

            if (route.name === 'Terminal') {
              iconName = focused ? 'terminal' : 'terminal-outline';
            } else if (route.name === 'Workstation') {
              iconName = focused ? 'desktop' : 'desktop-outline';
            } else {
              iconName = 'help-outline';
            }

            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
          },
          headerShown: false,
        })}
      >
        <Tab.Screen name="Terminal" component={TerminalScreen} />
        <Tab.Screen name="Workstation" component={WorkstationScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
};
