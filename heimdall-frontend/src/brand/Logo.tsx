import React from 'react';
import { BRAND, type BrandAssetProps } from './Brand';

export const Logo: React.FC<BrandAssetProps> = ({ 
  size = 48, 
  color = 'currentColor', 
  className = '', 
  variant = 'monochrome',
  animated = false
}) => {
  // If variant is gold-accent, use brand gold for specific elements, else use color prop
  const accentColor = variant === 'gold-accent' ? BRAND.colors.institutionalGold : color;
  
  // Animation classes for future support
  const animationClass = animated ? 'animate-pulse' : ''; // Placeholder for future radar sweep

  return (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 100 100" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className={`${animationClass} ${className}`}
      role="img"
      aria-label="Heimdall Logo"
    >
      {/* 
        Observation Ring 
        Calculated using stroke-dasharray for perfect quarters.
        Circumference = 2 * PI * 40 = ~251.32
        4 segments: dash ~52.83, gap 10
      */}
      <circle 
        cx="50" 
        cy="50" 
        r="40" 
        stroke={color} 
        strokeWidth="6" 
        strokeDasharray="52.83 10" 
        strokeDashoffset="26.415" // Shift to center gaps at N, S, E, W
        strokeLinecap="butt"
      />
      
      {/* Subtle North Indicator */}
      <path 
        d="M 46 2 L 54 2 L 50 10 Z" 
        fill={accentColor}
      />

      {/* Geometric 'H' */}
      <g fill={color}>
        {/* Left Vertical */}
        <rect x="30" y="28" width="8" height="44" />
        {/* Right Vertical */}
        <rect x="62" y="28" width="8" height="44" />
        {/* Middle Horizontal - with a subtle geometric cut/slant to make it distinctive */}
        <path d="M 38 46 L 62 46 L 62 54 L 38 54 Z" />
      </g>
    </svg>
  );
};
