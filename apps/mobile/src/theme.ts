export const colors = {
  bg: '#161616',
  bgElevated: '#222222',
  bgInput: '#2a2a2a',
  border: '#3a3a3a',
  text: '#eeeeee',
  textDim: '#9a9a9a',
  textFaint: '#666666',
  accent: '#4f9cff',
  accentDim: '#2c5c99',
  danger: '#e5534b',
  success: '#3fb950',
  star: '#f0b429',
  /** Soft fills for status pills (outline + tint background). */
  successSoft: 'rgba(63, 185, 80, 0.12)',
  dangerSoft: 'rgba(229, 83, 75, 0.12)',
  neutralSoft: 'rgba(154, 154, 154, 0.10)',
} as const;

export const spacing = {s: 6, m: 12, l: 20} as const;

/** Corner radii: s for chips/pills, m for inputs, l for cards. */
export const radius = {s: 999, m: 12, l: 16} as const;

export const font = {
  title: {fontSize: 22, fontWeight: '600' as const, color: colors.text},
  body: {fontSize: 15, color: colors.text},
  dim: {fontSize: 13, color: colors.textDim},
  faint: {fontSize: 12, color: colors.textFaint},
  pill: {fontSize: 11, fontWeight: '500' as const},
};
