import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';
import theme from '../constants/theme';

const TRACK_WIDTH = 48;
const THUMB_SIZE = 22;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - 4;

export default function SharingSwitch({ on }) {
  const progress = useRef(new Animated.Value(on ? 1 : 0)).current;

  useEffect(() => {
    const animation = Animated.spring(progress, {
      toValue: on ? 1 : 0,
      stiffness: 320,
      damping: 26,
      mass: 0.7,
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [on, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, THUMB_TRAVEL],
  });
  const trackColor = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.colors.bg4, theme.colors.green],
  });

  return (
    <Animated.View style={[styles.track, { backgroundColor: trackColor }]}>
      <Animated.View style={[styles.thumb, { transform: [{ translateX }] }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: 26,
    borderRadius: 13,
    padding: 2,
    justifyContent: 'center',
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: theme.colors.white,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2,
    elevation: 2,
  },
});
