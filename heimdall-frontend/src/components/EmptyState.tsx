import React from 'react';
import { Logo } from '../brand';
import { ShieldAlert, Info, Database } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  description: string;
  icon?: 'shield' | 'info' | 'database' | 'logo';
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon = 'logo', action }: EmptyStateProps) {
  
  const renderIcon = () => {
    switch(icon) {
      case 'shield':
        return <ShieldAlert size={32} className="text-accent opacity-80" strokeWidth={1} />;
      case 'info':
        return <Info size={32} className="text-ink-faint" strokeWidth={1} />;
      case 'database':
        return <Database size={32} className="text-ink-faint" strokeWidth={1} />;
      case 'logo':
      default:
        return <Logo size={40} variant="monochrome" color="var(--color-ink-faint)" />;
    }
  }

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center font-brand px-6 py-12">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-surface border border-line animate-toast-enter">
        {renderIcon()}
      </div>
      <h3 className="text-sm font-semibold text-ink mb-1.5">{title}</h3>
      <p className="text-[13px] text-ink-dim max-w-[300px] mx-auto leading-relaxed">
        {description}
      </p>
      {action && (
        <div className="mt-6">
          {action}
        </div>
      )}
    </div>
  );
}
