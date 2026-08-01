import { useToast } from '../lib/ToastContext'
import { Info, CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react'

export function Toaster() {
  const { toasts, dismiss } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => {
        const variant = toast.variant || 'info'
        
        let Icon = Info
        let iconColor = 'text-accent'
        let borderColor = 'border-accent/30'
        let bgColor = 'bg-void/95'
        
        if (variant === 'success') {
          Icon = CheckCircle2
          iconColor = 'text-up'
          borderColor = 'border-up/30'
        } else if (variant === 'warning') {
          Icon = AlertTriangle
          iconColor = 'text-amber-500' // Using raw tailwind color if custom not defined
          borderColor = 'border-amber-500/30'
        } else if (variant === 'error') {
          Icon = XCircle
          iconColor = 'text-down'
          borderColor = 'border-down/30'
        }

        return (
          <div 
            key={toast.id} 
            className={`pointer-events-auto flex items-start gap-3 p-3 rounded shadow-lg border ${borderColor} ${bgColor} animate-slide-in backdrop-blur-md`}
          >
            <Icon size={16} className={`shrink-0 mt-0.5 ${iconColor}`} />
            <div className="flex-1 flex flex-col min-w-0">
              <span className="text-[13px] font-mono font-medium text-ink truncate">{toast.title}</span>
              {toast.message && (
                <span className="text-[11px] font-mono text-ink-dim mt-1 leading-tight line-clamp-2">
                  {toast.message}
                </span>
              )}
            </div>
            <button 
              onClick={() => dismiss(toast.id)}
              className="shrink-0 text-ink-faint hover:text-ink transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
