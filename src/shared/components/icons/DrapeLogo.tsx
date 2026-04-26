import React from 'react';
import { Image, StyleSheet } from 'react-native';

interface Props {
  size?: number;
  color?: string;
  gradient?: boolean;
}

const logoSource = require('../../../../assets/icon.png');

export const DrapeLogo = ({ size = 48 }: Props) => {
  return (
    <Image
      source={logoSource}
      style={[styles.logo, { width: size, height: size, borderRadius: size * 0.22 }]}
      resizeMode="contain"
    />
  );
};

const styles = StyleSheet.create({
  logo: {
    overflow: 'hidden',
  },
});
