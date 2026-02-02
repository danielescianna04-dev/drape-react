import React from 'react';
import Svg, { Path, Defs, LinearGradient, Stop } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
  gradient?: boolean;
}

/**
 * Drape abstract logo — a soft rounded form with
 * a flowing inner channel, like light passing through glass.
 */
export const DrapeLogo = ({ size = 48, color = '#FFFFFF', gradient = false }: Props) => {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {gradient && (
        <Defs>
          <LinearGradient id="dOuter" x1="8" y1="8" x2="56" y2="56" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#C4B8FF" />
            <Stop offset="0.5" stopColor="#9B8AFF" />
            <Stop offset="1" stopColor="#6B5CE7" />
          </LinearGradient>
          <LinearGradient id="dInner" x1="18" y1="14" x2="46" y2="50" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.95" />
            <Stop offset="1" stopColor="#D4CBFF" stopOpacity="0.8" />
          </LinearGradient>
        </Defs>
      )}

      {/* Outer body — rounded organic shape, slightly taller than wide */}
      <Path
        d="M32 6C44 6 56 16 56 30C56 44 48 58 32 58C16 58 8 44 8 30C8 16 20 6 32 6Z"
        fill={gradient ? 'url(#dOuter)' : color}
      />

      {/* Inner flowing channel — a curved cutout/river that flows through the shape */}
      <Path
        d="M22 16C28 20 26 30 20 36C14 42 18 52 28 52C34 52 38 46 38 40C38 34 42 28 48 24C52 21 50 14 42 12C36 10 28 10 22 16Z"
        fill={gradient ? 'url(#dInner)' : '#0D0816'}
        opacity={gradient ? 1 : 0.25}
      />
    </Svg>
  );
};
