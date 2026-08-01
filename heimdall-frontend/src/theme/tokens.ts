/**
 * Heimdall Design Tokens
 * 
 * Centralized design system constants defining the visual language of the application.
 * These tokens should be imported and used instead of hardcoding raw values.
 */

export const colors = {
  nearBlack: '#0A0A0A',
  primaryWhite: '#FFFFFF',
  institutionalGold: '#D4A63A',
  slateGray: '#687280',
  darkSlate: '#1F2329',
};

export const typography = {
  fontFamily: {
    brand: '"IBM Plex Sans", sans-serif', // Headings, forms, navigation, branding
    data: '"IBM Plex Mono", monospace',   // Feeds, tables, numbers, technical data
  },
  weights: {
    light: 300,
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
  }
};

export const spacing = {
  xs: '0.25rem', // 4px
  sm: '0.5rem',  // 8px
  md: '1rem',    // 16px
  lg: '1.5rem',  // 24px
  xl: '2rem',    // 32px
  '2xl': '3rem', // 48px
};

export const radii = {
  sm: '0.125rem', // 2px
  md: '0.25rem',  // 4px
  lg: '0.5rem',   // 8px
  full: '9999px',
};

export const transitions = {
  default: 'all 0.2s ease-in-out',
  slow: 'all 0.4s ease-in-out',
};
