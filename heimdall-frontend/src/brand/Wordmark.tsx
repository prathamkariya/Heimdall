import React from 'react';
import { BRAND, type BrandAssetProps } from './Brand';

export const Wordmark: React.FC<BrandAssetProps & { showTagline?: boolean }> = ({ 
  size = 24, // font size base
  color = 'currentColor', 
  className = '', 
  variant = 'monochrome',
  showTagline = false
}) => {
  const accentColor = variant === 'gold-accent' ? BRAND.colors.institutionalGold : color;
  
  return (
    <div 
      className={`flex flex-col justify-center ${className}`} 
      style={{ color }}
      role="img"
      aria-label={`${BRAND.name} ${showTagline ? BRAND.tagline : ''}`}
    >
      <div 
        className="font-brand font-bold tracking-[0.2em] leading-none uppercase"
        style={{ fontSize: size }}
      >
        {BRAND.name}
      </div>
      {showTagline && (
        <div 
          className="font-brand font-medium tracking-[0.15em] uppercase mt-1"
          style={{ fontSize: typeof size === 'number' ? size * 0.35 : '0.35em', color: accentColor }}
        >
          {BRAND.tagline}
        </div>
      )}
    </div>
  );
};
