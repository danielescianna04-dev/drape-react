import React from 'react';
import Animated, { FadeOut, SlideInRight } from 'react-native-reanimated';
import { SettingsScreen } from '../features/settings/SettingsScreen';

interface Props {
  onClose: () => void;
  initialShowPlans?: boolean;
  initialPlanIndex?: number;
}

export const SettingsOverlay: React.FC<Props> = ({ onClose, initialShowPlans, initialPlanIndex }) => (
  <Animated.View
    key={initialShowPlans ? 'plans-screen' : 'settings-screen'}
    entering={SlideInRight.duration(300)}
    exiting={FadeOut.duration(200)}
    style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}
  >
    <SettingsScreen
      onClose={onClose}
      initialShowPlans={initialShowPlans}
      initialPlanIndex={initialPlanIndex}
    />
  </Animated.View>
);
