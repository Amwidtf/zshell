import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {colors, font} from '../theme';

export interface DonutSegment {
  key: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  /** Ring outer diameter in dp. */
  size?: number;
  /** Ring thickness in dp. */
  thickness?: number;
  /** Solid backdrop of the card the chart sits on (masks + hole). */
  surface?: string;
  /** Center captions: big value + small label. */
  centerValue: string;
  centerLabel: string;
}

/**
 * Donut chart built from plain Views — no native chart/svg dependency (keeps
 * the RNOH path open). Angles: degrees clockwise, 0 at 12 o'clock.
 *
 * Each segment paints a full ring clipped to a rotated half-plane (a 180°
 * band that starts exactly at the segment's start angle), then overdraws the
 * unused tail of that band with the surface color. Segments are contiguous
 * from 0°; a muted remainder closes the ring back to 360°.
 */
export function DonutChart({
  segments,
  size = 180,
  thickness = 18,
  surface = colors.bgElevated,
  centerValue,
  centerLabel,
}: DonutChartProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  // Decompose into ≤180° sectors with explicit start angles.
  const sectors: {start: number; sweep: number; color: string}[] = [];
  if (total > 0) {
    let cursor = 0;
    for (const seg of segments) {
      const sweep = (seg.value / total) * 360;
      let left = sweep;
      let start = cursor;
      while (left > 0.01 && start < 360) {
        const chunk = Math.min(left, 360 - start, 180);
        if (chunk <= 0) {
          break;
        }
        sectors.push({start, sweep: chunk, color: seg.color});
        start += chunk;
        left -= chunk;
      }
      cursor += sweep;
    }
    if (cursor < 359.99) {
      sectors.push({start: cursor, sweep: 360 - cursor, color: colors.bgInput});
    }
  }

  /**
   * A 180° band starting at `startDeg`: the outer square rotates about its
   * center by (startDeg + 90) so that its (unrotated) top half — which spans
   * [-90°, +90°] — becomes [startDeg, startDeg + 180]. overflow:hidden on the
   * half does the clipping; the full-size ring child peeks through it.
   */
  const band = (startDeg: number, ringColor: string) => (
    <View style={StyleSheet.absoluteFill}>
      <View style={{...StyleSheet.absoluteFillObject, transform: [{rotate: `${startDeg + 90}deg`}]}}>
        <View style={halfStyle(size)}>
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: thickness,
              borderColor: ringColor,
            }}
          />
        </View>
      </View>
    </View>
  );

  const hole = size - thickness * 2;

  return (
    <View style={{width: size, height: size}}>
      {/* Muted base ring so an empty chart still reads as a ring. */}
      <View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: thickness,
          borderColor: colors.bgInput,
        }}
      />
      {sectors.map((sector, i) => (
        <React.Fragment key={`sector-${i}`}>
          {band(sector.start, sector.color)}
          {sector.start + sector.sweep < 359.99
            ? band(sector.start + sector.sweep, surface)
            : null}
        </React.Fragment>
      ))}
      <View
        style={{
          position: 'absolute',
          top: thickness,
          left: thickness,
          width: hole,
          height: hole,
          borderRadius: hole / 2,
          backgroundColor: surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text style={styles.centerValue}>{centerValue}</Text>
        <Text style={styles.centerLabel}>{centerLabel}</Text>
      </View>
    </View>
  );
}

/** The clipping half: top half of the square, kept in the rotated frame. */
function halfStyle(size: number) {
  return {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: size,
    height: size / 2,
    overflow: 'hidden' as const,
  };
}

const styles = StyleSheet.create({
  centerValue: {...font.body, fontWeight: '600' as const, color: colors.text},
  centerLabel: {...font.faint, marginTop: 2},
});
