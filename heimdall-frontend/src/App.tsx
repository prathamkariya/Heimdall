import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Shell } from './layout/Shell'
import { LiveFeed } from './routes/LiveFeed'
import { Anomalies } from './routes/Anomalies'
import { Watchlists } from './routes/Watchlists'
import { Investigations } from './routes/Investigations'
import { Audit } from './routes/Audit'
import { AuthProvider } from './lib/auth-context'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { ToastProvider } from './lib/ToastContext'
import { Toaster } from './components/Toaster'
import { SettingsProvider } from './lib/SettingsContext'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SettingsProvider>
          <ToastProvider>
            <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            <Route element={<ProtectedRoute />}>
              <Route path="/*" element={
                <Shell>
                  <Routes>
                    <Route path="/" element={<LiveFeed />} />
                    <Route path="/anomalies" element={<Anomalies />} />
                    <Route path="/watchlists" element={<Watchlists />} />
                    <Route path="/investigations" element={<Investigations />} />
                    <Route path="/audit" element={<Audit />} />
                  </Routes>
                </Shell>
              } />
            </Route>
          </Routes>
          <Toaster />
        </ToastProvider>
        </SettingsProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
