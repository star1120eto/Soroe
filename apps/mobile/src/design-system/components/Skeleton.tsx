import { useEffect, useState } from 'react';
import { Animated, type DimensionValue } from 'react-native';

import { Colors, Radius } from '../tokens';

// Not detailed in docs/DesignSystem.pdf; a pulsing placeholder built from
// Surface Alt so it reads as "loading" without introducing a new color.
type SkeletonProps = {
  width: DimensionValue;
  height: DimensionValue;
  radius?: number;
};

export function Skeleton({ width, height, radius = Radius.small }: SkeletonProps) {
  const [opacity] = useState(() => new Animated.Value(0.6));

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 600, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width,
        height,
        borderRadius: radius,
        backgroundColor: Colors.surfaceAlt,
        opacity,
      }}
    />
  );
}
