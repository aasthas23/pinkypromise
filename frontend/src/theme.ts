/** Design tokens. Magenta is an accent only and must not imply official carrier branding. */
export const colors = {
  accent: '#C4006A', // magenta, 5.9:1 on white
  accentSoft: '#FCE7F2',

  // Light (education / debrief) surfaces
  bg: '#F7F7F9',
  surface: '#FFFFFF',
  text: '#16161D',
  textMuted: '#55576A',
  border: '#E2E3EA',

  // Dark (call) surfaces
  callBg: '#0E0F14',
  callSurface: '#1C1E26',
  callText: '#FFFFFF',
  callTextMuted: '#B4B7C5',

  answer: '#1E9E52',
  decline: '#D62D3A',

  protective: '#1B7A43',
  protectiveSoft: '#E5F4EB',
  risky: '#B3261E',
  riskySoft: '#FBE9E7',
  neutral: '#55576A',
  neutralSoft: '#EEEFF3',
  warning: '#8A5A00',
  warningSoft: '#FFF4D6',

  simBadge: '#FFD43B',
  simBadgeText: '#1A1400',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 8, md: 12, lg: 20, pill: 999 } as const;

/** Minimum touch target in points. */
export const MIN_TOUCH = 48;
