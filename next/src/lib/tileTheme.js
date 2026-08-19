// Tile visuals by value. Progresses from soft cream tones through warm
// oranges/reds into purples, blues, teals and finally near-black/gold for
// the highest tiers — keeps every step visually distinct at a glance.
export const TILE_THEME = {
  2: { bg: '#EEE4DA', text: '#756452' },
  4: { bg: '#EBD8B6', text: '#756452' },
  8: { bg: '#F2AF74', text: '#FFFFFF' },
  16: { bg: '#F69361', text: '#FFFFFF' },
  32: { bg: '#F67E62', text: '#FFFFFF' },
  64: { bg: '#F66240', text: '#FFFFFF' },
  128: { bg: '#F2CE53', text: '#FFFFFF' },
  256: { bg: '#F0C63F', text: '#FFFFFF' },
  512: { bg: '#EDBE2B', text: '#FFFFFF' },
  1024: { bg: '#E6B02A', text: '#FFFFFF' },
  2048: { bg: '#E0A62A', text: '#FFFFFF' },
  4096: { bg: '#C97BD1', text: '#FFFFFF' },
  8192: { bg: '#B15FD6', text: '#FFFFFF' },
  16384: { bg: '#9450C9', text: '#FFFFFF' },
  32768: { bg: '#7C63E0', text: '#FFFFFF' },
  65536: { bg: '#5E6FE0', text: '#FFFFFF' },
  131072: { bg: '#4A87DB', text: '#FFFFFF' },
  262144: { bg: '#3D9FCB', text: '#FFFFFF' },
  524288: { bg: '#33AEA0', text: '#FFFFFF' },
  1048576: { bg: '#2E9E6E', text: '#FFFFFF' },
  2097152: { bg: '#3F8E4A', text: '#FFFFFF' },
  4194304: { bg: '#3A3A38', text: '#F0C63F' },
  3932100: { bg: '#2B2A28', text: '#E0A62A' },
};

export function tileStyle(value) {
  if (TILE_THEME[value]) return TILE_THEME[value];
  // fallback for any unlisted intermediate value
  return { bg: '#3A3A38', text: '#F0C63F' };
}

export function fontSizeFor(value) {
  const len = String(value).length;
  if (len <= 2) return 'clamp(1.8rem, 8vw, 2.6rem)';
  if (len === 3) return 'clamp(1.5rem, 6.5vw, 2.2rem)';
  if (len === 4) return 'clamp(1.2rem, 5.5vw, 1.85rem)';
  if (len === 5) return 'clamp(1rem, 4.5vw, 1.5rem)';
  return 'clamp(0.8rem, 3.6vw, 1.2rem)';
}
