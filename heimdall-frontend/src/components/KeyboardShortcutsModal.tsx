import { useEffect } from 'react'
import { X, Keyboard, Command, ArrowDownUp, ShieldCheck, Zap } from 'lucide-react'

interface KeyboardShortcutsModalProps {
  onClose: () => void
}

interface ShortcutCategory {
  title: string
  icon: any
  shortcuts: { keys: string[]; description: string }[]
}

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: 'Global Navigation',
    icon: Command,
    shortcuts: [
      { keys: ['⌘', 'K'], description: 'Open Command Palette & Omnisearch' },
      { keys: ['?'], description: 'Open Keyboard Shortcuts Reference' },
      { keys: ['Esc'], description: 'Close any active modal, drawer, or palette' },
    ]
  },
  {
    title: 'Feed & Alert Tables',
    icon: ArrowDownUp,
    shortcuts: [
      { keys: ['↓', '↑'], description: 'Navigate rows in live tables & anomaly queues' },
      { keys: ['J', 'K'], description: 'Vim-style next / previous row navigation' },
      { keys: ['↵ Enter'], description: 'Inspect selected anomaly or case record' },
      { keys: ['Space'], description: 'Pause / Resume live market data stream' },
    ]
  },
  {
    title: 'Case Investigation Workspace',
    icon: ShieldCheck,
    shortcuts: [
      { keys: ['1', '…', '5'], description: 'Switch tabs (Overview, Evidence, Timeline, Notes, Audit)' },
      { keys: ['#Tag'], description: 'Insert structured quick tags in analyst notes' },
    ]
  },
  {
    title: 'Institutional Surveillance & Export',
    icon: Zap,
    shortcuts: [
      { keys: ['⌘', 'E'], description: 'Generate MAR report for active investigation' },
      { keys: ['Shift', 'D'], description: 'Toggle synthetic market anomaly generator' },
    ]
  }
]

export function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm p-4 animate-fade-in">
      <div 
        className="w-full max-w-2xl bg-surface border border-line rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="flex items-center justify-between border-b border-line px-6 py-4 bg-void/50">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded bg-accent/10 border border-accent/20 text-accent">
              <Keyboard size={16} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink leading-tight">Keyboard Shortcuts</h2>
              <p className="text-[10px] font-mono text-ink-faint">HEIMDALL Surveillance Workstation Navigation</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="text-ink-faint hover:text-ink transition-colors cursor-pointer p-1 rounded-md hover:bg-raised"
          >
            <X size={16} />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {SHORTCUT_CATEGORIES.map((category) => {
            const Icon = category.icon
            return (
              <div key={category.title} className="space-y-3">
                <div className="flex items-center gap-2 font-mono text-[11px] font-semibold text-ink-dim uppercase tracking-wider border-b border-line/40 pb-1.5">
                  <Icon size={13} className="text-accent" />
                  <span>{category.title}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {category.shortcuts.map((item, idx) => (
                    <div 
                      key={idx}
                      className="flex items-center justify-between p-2 rounded border border-line/50 bg-void/40 hover:bg-void/70 transition-colors"
                    >
                      <span className="text-[12px] text-ink-dim">{item.description}</span>
                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {item.keys.map((k, kIdx) => (
                          <kbd 
                            key={kIdx}
                            className="font-mono text-[10px] bg-raised text-ink px-1.5 py-0.5 rounded border border-line font-medium shadow-xs"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <footer className="border-t border-line px-6 py-3 bg-void/50 flex items-center justify-between text-[11px] font-mono text-ink-faint">
          <span>Press <kbd className="bg-raised border border-line px-1 py-0.5 rounded text-ink text-[10px]">?</kbd> anywhere to display this modal</span>
          <button
            onClick={onClose}
            className="px-3 py-1 bg-surface border border-line rounded text-ink hover:bg-raised transition-colors text-[11px]"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  )
}
