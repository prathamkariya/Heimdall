import React from 'react';
import { Logo } from './Logo';
import { Wordmark } from './Wordmark';
import { type BrandAssetProps } from './Brand';

export interface LogoLockupProps extends BrandAssetProps {
  orientation?: 'horizontal' | 'vertical';
  showTagline?: boolean;
}

export const LogoLockup: React.FC<LogoLockupProps> = ({
  orientation = 'horizontal',
  showTagline = false,
  size = 32, // Size refers to the logo height here
  color = 'currentColor',
  className = '',
  variant = 'monochrome',
  animated = false
}) => {
  const isHorizontal = orientation === 'horizontal';
  
  // Scale the wordmark relative to the logo size
  const wordmarkSize = typeof size === 'number' ? size * 0.55 : '1em';
  const gap = typeof size === 'number' ? size * 0.4 : '0.5em';

  return (
    <div 
      className={`flex items-center ${isHorizontal ? 'flex-row' : 'flex-col'} ${className}`}
      style={{ gap }}
    >
      <Logo 
        size={size} 
        color={color} 
        variant={variant} 
        animated={animated}
        className={!isHorizontal ? 'mb-2' : ''}
      />
      <Wordmark 
        size={wordmarkSize} 
        color={color} 
        variant={variant}
        showTagline={showTagline}
        className={!isHorizontal ? 'items-center text-center' : ''}
      />
    </div>
  );
};
