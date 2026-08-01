import React, { useState, useEffect } from 'react'
import { ChevronRight } from 'lucide-react'

interface CollapsibleSectionProps {
  title: React.ReactNode
  storageKey: string
  defaultExpanded?: boolean
  children: React.ReactNode
  className?: string
}

export function CollapsibleSection({ 
  title, 
  storageKey, 
  defaultExpanded = true, 
  children,
  className = ''
}: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)

  useEffect(() => {
    const saved = localStorage.getItem(storageKey)
    if (saved !== null) {
      setIsExpanded(saved === 'true')
    }
  }, [storageKey])

  const toggle = () => {
    const nextState = !isExpanded
    setIsExpanded(nextState)
    localStorage.setItem(storageKey, String(nextState))
  }

  return (
    <section className={className}>
      <button 
        onClick={toggle}
        className="flex items-center gap-1.5 w-full text-left font-mono text-[10px] uppercase tracking-wider text-ink-faint hover:text-ink transition-colors cursor-pointer group select-none"
      >
        <ChevronRight 
          size={12} 
          className={`transition-transform duration-200 ${isExpanded ? 'rotate-90 text-ink-dim' : 'text-ink-faint group-hover:text-ink-dim'}`}
        />
        {title}
      </button>
      
      {isExpanded && (
        <div className="mt-2 animate-in fade-in duration-200">
          {children}
        </div>
      )}
    </section>
  )
}
