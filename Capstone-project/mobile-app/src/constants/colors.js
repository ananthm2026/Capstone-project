export const COLORS = {
  bg: '#F5F0E8',
  surface: '#FDFAF4',
  surfaceInk: '#1C1917',
  saffron: '#E8820C',
  saffronLight: '#FDF0E0',
  saffronHover: '#C96E08',
  turmeric: '#D4A017',
  indigo: '#3D4F8A',
  indigoLight: '#EEF0F8',
  ink: '#1C1917',
  warm: '#4A3F35',
  muted: '#8C7B6B',
  faded: '#B8A898',
  white: '#FFFFFF',
  border: 'rgba(90,70,50,0.12)',
  borderWarm: 'rgba(90,70,50,0.20)',
  borderAccent: 'rgba(232,130,12,0.35)',
  greenSoft: '#2D6A4F',
  greenBg: '#EAF4EE',
  blueSoft: '#1A4480',
  blueBg: '#EAF0FA',
  redSoft: '#C0392B',
  redBg: '#FDECEC',
  shadowSm: { shadowColor: '#3C2814', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  shadowMd: { shadowColor: '#3C2814', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 20, elevation: 4 },
  shadowLg: { shadowColor: '#3C2814', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.13, shadowRadius: 40, elevation: 8 },
};

export const CARD_COLORS = {
  'native-to-english': '#FAF0E4',
  continuous: '#E8EEF8',
  'english-to-native': '#E8F4ED',
  vision: '#F5EEF8',
  video: '#FDF4E3',
};

export const CONFIDENCE_COLOR = (score) => {
  if (score >= 80) return COLORS.greenSoft;
  if (score >= 50) return COLORS.turmeric;
  return COLORS.redSoft;
};
