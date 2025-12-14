import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface Props {
  size?: number;
  color?: string;
}

export const AnthropicIcon = ({ size = 24, color = '#D4A574' }: Props) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M13.827 3.52h3.603L24 20.48h-3.603l-6.57-16.96zm-7.258 0H10.2l6.57 16.96H13.14L11.37 16.1H5.828l-1.77 4.38H.428L6.57 3.52zm4.132 9.96L8.6 8.14l-2.1 5.34h4.2z"
      fill={color}
    />
  </Svg>
);
