import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Shell } from './layout/Shell'
import { LiveFeed } from './routes/LiveFeed'
import { Anomalies } from './routes/Anomalies'
import { Watchlists } from './routes/Watchlists'
import { Investigations } from './routes/Investigations'
import { AuthProvider } from './lib/auth-context'
import { ProtectedRoute } from './routes/ProtectedRoute'
import { Login } from './pages/Login'
import { Register } from './pages/Register'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
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
                </Routes>
              </Shell>
            } />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
