import React from 'react';
import { Text, TextProps } from 'react-native';

interface SafeTextProps extends TextProps {
  children: any;
}

export const SafeText: React.FC<SafeTextProps> = ({ children, ...props }) => {
  const safeChildren = React.useMemo(() => {
    if (children === null || children === undefined) {
      return '';
    }
    if (typeof children === 'string' || typeof children === 'number') {
      return String(children);
    }
    if (React.isValidElement(children)) {
      return children;
    }
    // Per array o oggetti, converti in stringa
    return String(children);
  }, [children]);

  return <Text {...props}>{safeChildren}</Text>;
};
