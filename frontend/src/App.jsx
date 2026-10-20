import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Login from './components/Login'
import Dashboard from './components/Dashboard'
import GuestDashboard from './components/GuestDashboard'
import Legal from './components/Legal'
import { getToken } from './utils/auth'
import NotFound from './components/NotFound'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [guestMode, setGuestMode] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    setIsAuthenticated(!!token)
    setLoading(false)
  }, [])

  // Sync authentication state with token changes
  useEffect(() => {
    const checkAuth = () => {
      const token = getToken()
      setIsAuthenticated(!!token)
    }
    
    window.addEventListener('storage', checkAuth)
    return () => window.removeEventListener('storage', checkAuth)
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route 
          path="/login" 
          element={
            isAuthenticated 
              ? <Navigate to="/" replace /> 
              : <Login setIsAuthenticated={setIsAuthenticated} setGuestMode={setGuestMode} />
          } 
        />
        <Route 
          path="/" 
          element={
            isAuthenticated 
              ? <Dashboard setIsAuthenticated={setIsAuthenticated} /> 
              : guestMode 
                ? <GuestDashboard setGuestMode={setGuestMode} />
                : <Navigate to="/login" replace />
          } 
        />
        <Route path="/privacy" element={<Legal />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
