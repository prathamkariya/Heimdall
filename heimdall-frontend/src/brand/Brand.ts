import { colors, typography, spacing, radii, transitions } from '../theme/tokens';

/**
 * Heimdall Central Brand System
 * Single source of truth for brand identity assets.
 */
export const BRAND = {
  name: "HEIMDALL",
  tagline: "MARKET SURVEILLANCE PLATFORM",
  colors,
  typography,
  spacing,
  radii,
  transitions,
};

// Common prop types for brand SVG components
export interface BrandAssetProps {
  size?: number | string;
  color?: string;
  className?: string;
  variant?: 'monochrome' | 'gold-accent';
  animated?: boolean;
}
