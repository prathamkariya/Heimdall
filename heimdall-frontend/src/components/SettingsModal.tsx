import { X, Monitor, Clock } from 'lucide-react'
import { useSettings } from '../lib/SettingsContext'

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { density, setDensity, timezone, setTimezone } = useSettings()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80">
      <div className="bg-surface border border-line rounded-lg w-full max-w-md shadow-2xl overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b border-line">
          <h2 className="font-mono text-[13px] uppercase tracking-widest text-ink">Workstation Settings</h2>
          <button onClick={onClose} className="text-ink-faint hover:text-ink transition-colors">
            <X size={16} />
          </button>
        </div>
        
        <div className="p-6 space-y-6">
          {/* Density Settings */}
          <div>
            <div className="flex items-center gap-2 text-ink-dim mb-3">
              <Monitor size={14} />
              <h3 className="font-mono text-[11px] uppercase tracking-wider">Display Density</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setDensity('default')}
                className={`p-3 rounded border text-left flex flex-col gap-1 transition-colors ${
                  density === 'default' 
                    ? 'border-accent bg-accent/5' 
                    : 'border-line hover:border-line/80 bg-raised'
                }`}
              >
                <span className={`text-[13px] font-medium ${density === 'default' ? 'text-accent' : 'text-ink'}`}>Default</span>
                <span className="text-[11px] text-ink-faint">Standard padding and text size</span>
              </button>
              <button
                onClick={() => setDensity('compact')}
                className={`p-3 rounded border text-left flex flex-col gap-1 transition-colors ${
                  density === 'compact' 
                    ? 'border-accent bg-accent/5' 
                    : 'border-line hover:border-line/80 bg-raised'
                }`}
              >
                <span className={`text-[13px] font-medium ${density === 'compact' ? 'text-accent' : 'text-ink'}`}>Compact</span>
                <span className="text-[11px] text-ink-faint">High density for data tables</span>
              </button>
            </div>
          </div>

          {/* Timezone Settings */}
          <div>
            <div className="flex items-center gap-2 text-ink-dim mb-3">
              <Clock size={14} />
              <h3 className="font-mono text-[11px] uppercase tracking-wider">Timezone</h3>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setTimezone('utc')}
                className={`p-3 rounded border text-left flex flex-col gap-1 transition-colors ${
                  timezone === 'utc' 
                    ? 'border-accent bg-accent/5' 
                    : 'border-line hover:border-line/80 bg-raised'
                }`}
              >
                <span className={`text-[13px] font-medium ${timezone === 'utc' ? 'text-accent' : 'text-ink'}`}>UTC</span>
                <span className="text-[11px] text-ink-faint">Universal Coordinated Time</span>
              </button>
              <button
                onClick={() => setTimezone('local')}
                className={`p-3 rounded border text-left flex flex-col gap-1 transition-colors ${
                  timezone === 'local' 
                    ? 'border-accent bg-accent/5' 
                    : 'border-line hover:border-line/80 bg-raised'
                }`}
              >
                <span className={`text-[13px] font-medium ${timezone === 'local' ? 'text-accent' : 'text-ink'}`}>Local</span>
                <span className="text-[11px] text-ink-faint">Your system timezone</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
