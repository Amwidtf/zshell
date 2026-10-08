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
} as const;

export const spacing = {s: 6, m: 12, l: 20} as const;

export const font = {
  title: {fontSize: 22, fontWeight: '600' as const, color: colors.text},
  body: {fontSize: 15, color: colors.text},
  dim: {fontSize: 13, color: colors.textDim},
  faint: {fontSize: 12, color: colors.textFaint},
};
