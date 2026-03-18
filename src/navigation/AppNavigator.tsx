import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { WorkstationScreen } from '../features/workstation/WorkstationScreen';

type RootTabParamList = {
  Workstation: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export const AppNavigator: React.FC = () => {
  return (
    <NavigationContainer>
      <Tab.Navigator
        id={undefined}>
        <Tab.Screen name="Workstation" component={WorkstationScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
};
