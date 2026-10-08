import React, {useRef, useState} from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {colors} from './theme';

const GRID = 3;
const HIT_RADIUS = 46;

function dotCenter(i: number, size: number) {
  const pad = size * 0.16;
  const step = (size - pad * 2) / (GRID - 1);
  return {x: pad + (i % GRID) * step, y: pad + Math.floor(i / GRID) * step};
}

interface PatternPadProps {
  size?: number;
  onComplete: (dots: number[]) => void;
  hint?: string;
}

/** 3x3 unlock-pattern input. Emits the selected dot order on release. */
export function PatternPad({size = 300, onComplete, hint}: PatternPadProps) {
  const [selected, setSelected] = useState<number[]>([]);
  const selectedRef = useRef<number[]>([]);
  const originRef = useRef({x: 0, y: 0});

  const hitTest = (px: number, py: number): number => {
    for (let i = 0; i < GRID * GRID; i++) {
      const c = dotCenter(i, size);
      const dx = px - originRef.current.x - c.x;
      const dy = py - originRef.current.y - c.y;
      if (dx * dx + dy * dy <= HIT_RADIUS * HIT_RADIUS) {
        return i;
      }
    }
    return -1;
  };

  const handlePoint = (pageX: number, pageY: number) => {
    const idx = hitTest(pageX, pageY);
    if (idx >= 0 && !selectedRef.current.includes(idx)) {
      const next = [...selectedRef.current, idx];
      selectedRef.current = next;
      setSelected(next);
    }
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: e => {
        selectedRef.current = [];
        setSelected([]);
        handlePoint(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderMove: e => {
        handlePoint(e.nativeEvent.pageX, e.nativeEvent.pageY);
      },
      onPanResponderRelease: () => {
        const dots = selectedRef.current;
        if (dots.length >= 4) {
          onComplete(dots);
        }
        selectedRef.current = [];
        setSelected([]);
      },
    }),
  ).current;

  return (
    <View
      style={{width: size, height: size}}
      onLayout={(e: LayoutChangeEvent) => {
        e.currentTarget.measure((x, y, w, h, pageX, pageY) => {
          originRef.current = {x: pageX, y: pageY};
          void w;
          void h;
          void x;
          void y;
        });
      }}
      {...panResponder.panHandlers}>
      {selected.map((dot, i) => {
        if (i === 0) {
          return null;
        }
        const a = dotCenter(selected[i - 1], size);
        const b = dotCenter(dot, size);
        const length = Math.hypot(b.x - a.x, b.y - a.y);
        const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
        return (
          <View
            key={`line-${i}`}
            style={{
              position: 'absolute',
              left: (a.x + b.x) / 2 - length / 2,
              top: (a.y + b.y) / 2 - 1.5,
              width: length,
              height: 3,
              backgroundColor: colors.accent,
              transform: [{rotate: `${angle}deg`}],
            }}
          />
        );
      })}
      {Array.from({length: GRID * GRID}, (_, i) => {
        const c = dotCenter(i, size);
        const isOn = selected.includes(i);
        const order = selected.indexOf(i) + 1;
        return (
          <View
            key={`dot-${i}`}
            style={[
              styles.dot,
              {left: c.x - 26, top: c.y - 26},
              isOn && styles.dotActive,
            ]}>
            {isOn ? (
              <Text style={styles.dotOrder}>{order}</Text>
            ) : (
              <View style={styles.dotCore} />
            )}
          </View>
        );
      })}
      {hint != null ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    position: 'absolute',
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#4a4a4a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(79,156,255,0.18)',
  },
  dotCore: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#5a5a5a',
  },
  dotOrder: {
    color: colors.accent,
    fontSize: 18,
    fontWeight: '600',
  },
  hint: {
    position: 'absolute',
    bottom: -28,
    left: 0,
    right: 0,
    textAlign: 'center',
    color: colors.textDim,
    fontSize: 12,
  },
});
