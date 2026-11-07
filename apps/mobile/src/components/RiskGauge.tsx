import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import type { ShareRiskBand } from '@safechat/contracts';
import { riskColor, riskSoftColor, useTheme } from '../theme';

const DEFAULT_SIZE = 168;
const STROKE_WIDTH = 16;
const ARC_FRACTION = 0.75;
const ANIMATION_MS = 700;

function easeOutCubic(progress: number): number {
  return 1 - Math.pow(1 - progress, 3);
}

function useAnimatedScore(target: number): number {
  const [value, setValue] = useState(0);
  const fromRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const start = Date.now();
    let frame = 0;

    const tick = () => {
      const progress = Math.min(1, (Date.now() - start) / ANIMATION_MS);
      const next = from + (target - from) * easeOutCubic(progress);
      fromRef.current = next;
      setValue(next);

      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return value;
}

interface RiskGaugeProps {
  score: number;
  level: ShareRiskBand;
  label: string;
  size?: number;
}

export function RiskGauge({ score, level, label, size = DEFAULT_SIZE }: RiskGaugeProps) {
  const { colors } = useTheme();
  const target = Math.max(0, Math.min(100, score));
  const animatedScore = useAnimatedScore(target);
  const color = riskColor(level, colors);

  const radius = (size - STROKE_WIDTH) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const arcLength = circumference * ARC_FRACTION;
  const visibleArc = arcLength * (animatedScore / 100);

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Điểm dấu hiệu ${Math.round(target)} trên 100, mức ${label}`}
      style={[styles.container, { width: size, height: size }]}
    >
      <Svg width={size} height={size}>
        <G rotation={135} origin={`${center}, ${center}`}>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            stroke={colors.surfaceAlt}
            strokeWidth={STROKE_WIDTH}
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
            fill="none"
          />
          {visibleArc > 0.5 && (
            <Circle
              cx={center}
              cy={center}
              r={radius}
              stroke={color}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={`${visibleArc} ${circumference}`}
              fill="none"
            />
          )}
        </G>
      </Svg>

      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.score, { color: colors.text }]}>{Math.round(animatedScore)}%</Text>
        <Text style={[styles.caption, { color: colors.muted }]}>Điểm dấu hiệu</Text>
        <View style={[styles.levelPill, { backgroundColor: riskSoftColor(level, colors) }]}>
          <Text style={[styles.levelText, { color }]}>{label}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  score: {
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: -1.2,
  },
  caption: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  levelPill: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  levelText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
