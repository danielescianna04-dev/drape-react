import React from 'react';
import { View, StyleSheet } from 'react-native';

interface FigmaLogoProps {
  size?: number;
}

// Official Figma brand colors from the logo
const FIGMA_RED = '#F24E1E';
const FIGMA_CORAL = '#FF7262';
const FIGMA_PURPLE = '#A259FF';
const FIGMA_BLUE = '#1ABCFE';
const FIGMA_GREEN = '#0ACF83';

export const FigmaLogo: React.FC<FigmaLogoProps> = ({ size = 20 }) => {
  // Logo is 3 units wide x 4.5 units tall (each shape is 1.5 units)
  const unit = size / 3;
  const shapeSize = unit * 1.5;
  const radius = shapeSize / 2;

  return (
    <View style={[styles.container, { width: size, height: size * 1.5 }]}>
      {/* Row 1: Red top-left + Coral top-right (pill shape) */}
      <View style={styles.row}>
        <View style={[styles.shape, {
          width: shapeSize,
          height: shapeSize,
          backgroundColor: FIGMA_RED,
          borderTopLeftRadius: radius,
          borderBottomLeftRadius: radius,
        }]} />
        <View style={[styles.shape, {
          width: shapeSize,
          height: shapeSize,
          backgroundColor: FIGMA_CORAL,
          borderTopRightRadius: radius,
          borderBottomRightRadius: radius,
          marginLeft: -radius,
        }]} />
      </View>

      {/* Row 2: Purple left + Blue circle right */}
      <View style={[styles.row, { marginTop: -radius }]}>
        <View style={[styles.shape, {
          width: shapeSize,
          height: shapeSize,
          backgroundColor: FIGMA_PURPLE,
          borderTopLeftRadius: radius,
          borderBottomLeftRadius: radius,
        }]} />
        <View style={[styles.shape, {
          width: shapeSize,
          height: shapeSize,
          backgroundColor: FIGMA_BLUE,
          borderRadius: radius,
          marginLeft: -radius,
        }]} />
      </View>

      {/* Row 3: Green bottom (full rounded bottom) */}
      <View style={[styles.row, { marginTop: -radius }]}>
        <View style={[styles.shape, {
          width: shapeSize,
          height: shapeSize,
          backgroundColor: FIGMA_GREEN,
          borderRadius: radius,
        }]} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  row: {
    flexDirection: 'row',
  },
  shape: {},
});
