export const THEME = {
  bg: '#0A0A0A',
  bg2: '#111111',
  card: '#161616',
  border: '#222222',
  border2: '#333333',
  red: '#ff2d55',
  red2: '#FF6B6B',
  redGlow: 'rgba(255,45,85,0.3)',
  redGlowStrong: 'rgba(255,45,85,0.6)',
  text: '#FFFFFF',
  text2: '#A0A0A0',
  text3: '#555555',
  green: '#22C55E',
  amber: '#F59E0B',
  blue: '#3B82F6',
  purple: '#8B5CF6',
};

export const FONTS = {
  sans: '"Inter", sans-serif',
  mono: '"JetBrains Mono", monospace',
};

export const GRADIENTS = {
  redHorizontal: `linear-gradient(90deg, ${THEME.red}, ${THEME.red2})`,
  redGlowRadial: `radial-gradient(ellipse at center, ${THEME.redGlow} 0%, transparent 70%)`,
  cardBorder: `linear-gradient(135deg, ${THEME.red}, transparent 50%)`,
};
