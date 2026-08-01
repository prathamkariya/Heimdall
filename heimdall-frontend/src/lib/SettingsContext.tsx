import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'

export type DensityMode = 'default' | 'compact'
export type TimezoneMode = 'local' | 'utc'

interface SettingsContextType {
  density: DensityMode
  setDensity: (mode: DensityMode) => void
  timezone: TimezoneMode
  setTimezone: (mode: TimezoneMode) => void
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<DensityMode>(() => {
    return (localStorage.getItem('heimdall_density') as DensityMode) || 'default'
  })
  
  const [timezone, setTimezoneState] = useState<TimezoneMode>(() => {
    return (localStorage.getItem('heimdall_timezone') as TimezoneMode) || 'utc'
  })

  useEffect(() => {
    localStorage.setItem('heimdall_density', density)
    if (density === 'compact') {
      document.body.classList.add('compact-mode')
    } else {
      document.body.classList.remove('compact-mode')
    }
  }, [density])

  useEffect(() => {
    localStorage.setItem('heimdall_timezone', timezone)
  }, [timezone])

  return (
    <SettingsContext.Provider value={{ 
      density, 
      setDensity: setDensityState, 
      timezone, 
      setTimezone: setTimezoneState 
    }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const context = useContext(SettingsContext)
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider')
  }
  return context
}
