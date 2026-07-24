// Central design tokens — light, modern, Figma-like.
export const colors = {
  bg: '#F5F6F8', // canvas
  surface: '#FFFFFF', // cards / panels
  surfaceAlt: '#EEF0F3', // pressed / secondary
  hairline: '#E6E8EC',
  hairlineStrong: '#D7DAE0',

  text: '#1A1B1F',
  textMuted: '#6B7280',
  textFaint: '#9AA0AA',

  accent: '#0D99FF', // Figma blue
  accentInk: '#FFFFFF',

  green: '#0FA958',
  yellow: '#B7791F',
  red: '#E23D3D',
  blue: '#0D99FF',
};

// hex -> rgba, for soft tints without extra constants.
export const withAlpha = (hex, a) => {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
};

export const difficultyColor = (d) => {
  const key = String(d || '').toLowerCase();
  if (key === 'easy') return colors.green;
  if (key === 'hard') return colors.red;
  return colors.yellow;
};

export const radius = { sm: 10, md: 14, lg: 18, pill: 999 };
export const space = (n) => n * 4;
