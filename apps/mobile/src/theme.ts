import { useColorScheme } from 'react-native';
import type { ShareRiskBand } from '@safechat/contracts';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  border: string;
  brand: string;
  brandSoft: string;
  brandContrast: string;
  high: string;
  highSoft: string;
  medium: string;
  mediumSoft: string;
  low: string;
  lowSoft: string;
  info: string;
  infoSoft: string;
  dangerSurface: string;
  shadow: string;
}

export const LIGHT: ThemeColors = {
  background: '#f3f6fb',
  surface: '#ffffff',
  surfaceAlt: '#eef3fa',
  text: '#0f172a',
  muted: '#5b6b82',
  border: '#dde6f2',
  brand: '#0f766e',
  brandSoft: '#ccfbf1',
  brandContrast: '#ffffff',
  high: '#dc2626',
  highSoft: '#fee2e2',
  medium: '#d97706',
  mediumSoft: '#fef3c7',
  low: '#059669',
  lowSoft: '#d1fae5',
  info: '#2563eb',
  infoSoft: '#dbeafe',
  dangerSurface: '#fff1f2',
  shadow: '#0f172a',
};

export const DARK: ThemeColors = {
  background: '#070d18',
  surface: '#101a2c',
  surfaceAlt: '#16223a',
  text: '#e6edf7',
  muted: '#94a6bf',
  border: '#223350',
  brand: '#2dd4bf',
  brandSoft: '#0f3d3a',
  brandContrast: '#04211f',
  high: '#f87171',
  highSoft: '#3b1416',
  medium: '#fbbf24',
  mediumSoft: '#3a2a09',
  low: '#34d399',
  lowSoft: '#073328',
  info: '#60a5fa',
  infoSoft: '#0d2444',
  dangerSurface: '#2a1215',
  shadow: '#000000',
};

export interface Theme {
  colors: ThemeColors;
  scheme: 'light' | 'dark';
}

export function useTheme(): Theme {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  return { colors: scheme === 'dark' ? DARK : LIGHT, scheme };
}

export function riskColor(level: ShareRiskBand, colors: ThemeColors): string {
  if (level === 'high') return colors.high;
  if (level === 'medium') return colors.medium;
  return colors.low;
}

export function riskSoftColor(level: ShareRiskBand, colors: ThemeColors): string {
  if (level === 'high') return colors.highSoft;
  if (level === 'medium') return colors.mediumSoft;
  return colors.lowSoft;
}
