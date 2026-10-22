import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { Clock, Settings, LogOut, Mic } from 'lucide-react'
import { clearTokens } from '../utils/auth'
import { listTranscripts, getCurrentUser, adoptGuestTranscript, api } from '../services/api'
import Upload from './Upload'
import TranscriptViewer from './TranscriptViewer'

import SettingsModal from './SettingsModal'

function Dashboard({ setIsAuthenticated }) {
  const [transcripts, setTranscripts] = useState([])
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [activeView, setActiveView] = useState('upload') // 'upload' | 'history'
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('darkMode')
      if (saved !== null) return saved === 'true'
      return true // the brand is dark; the settings can switch to light or follow the system
    }
    return true
  })
  const [userEmail, setUserEmail] = useState('')
  const [userSettings, setUserSettings] = useState(null)

  // Load user settings and apply theme
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await api.get('/settings')
        setUserSettings(response.data)
        
        // Apply theme from settings
        const theme = response.data.theme
        if (theme === 'dark') {
          setDarkMode(true)
        } else if (theme === 'light') {
          setDarkMode(false)
        } else {
          // System preference
          setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches)
        }
      } catch (error) {
        console.error('Failed to load settings:', error)
      }
    }
    loadSettings()
  }, [])

  // Apply dark mode class to html element
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('darkMode', darkMode)
  }, [darkMode])

  // Load user info
  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await getCurrentUser()
        setUserEmail(user.email)
      } catch (error) {
        console.error('Failed to load user:', error)
      }
    }
    loadUser()
  }, [])

  const processing = useRef(false)

  const loadTranscripts = useCallback(async ({ quiet = false } = {}) => {
    try {
      if (!quiet) setLoading(true)
      const data = await listTranscripts()
      const formatted = data.map(t => ({
        id: t.transcript_id,
        database_id: t.id,
        filename: t.filename,
        timestamp: t.created_at,
        word_count: t.word_count,
        preview: t.preview,
        summary: t.summary,
        content: t.content,
        speakers: t.speakers,
        tags: t.tags || [],
        pinned: Boolean(t.pinned),
        archived: Boolean(t.archived),
        status: t.status || 'completed',
        error: t.error,
      }))
      processing.current = formatted.some(t => t.status === 'processing')
      setTranscripts(formatted)
    } catch (error) {
      console.error('Failed to load transcripts:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // Load transcripts on mount; a transcript made as a guest joins the account first.
  useEffect(() => {
    adoptGuestTranscript().finally(loadTranscripts)
  }, [loadTranscripts])

  // Keep refreshing while something is being transcribed.
  useEffect(() => {
    const timer = setInterval(() => processing.current && loadTranscripts({ quiet: true }), 5000)
    return () => clearInterval(timer)
  }, [loadTranscripts])

  const handleLogout = () => {
    clearTokens()
    setIsAuthenticated(false)
    navigate('/login', { replace: true })
  }

  const handleTranscriptDeleted = (transcriptId) => {
    setTranscripts(prev => prev.filter(t => t.database_id !== transcriptId))
  }

  // Merge a change made in the list or the viewer (pin, archive, tags, name, summary…).
  // Pinned entries stay on top, as the server orders them.
  const handleTranscriptChanged = (transcriptId, changes) => {
    setTranscripts(prev => {
      const next = prev.map(t => (t.database_id === transcriptId ? { ...t, ...changes } : t))
      return 'pinned' in changes ? [...next.filter(t => t.pinned), ...next.filter(t => !t.pinned)] : next
    })
  }

  const NavButton = ({ icon: Icon, label, isActive, onClick, badge }) => (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 px-2 sm:px-4 py-2 transition-colors ${
        isActive 
          ? 'text-primary-800 dark:text-primary-400' 
          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
      }`}
    >
      <div className="relative">
        <Icon className="w-5 h-5" />
        {badge && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-blue-600 rounded-full"></span>
        )}
      </div>
      <span className="text-xs font-medium">{label}</span>
    </button>
  )

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex flex-col transition-colors duration-200">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Title */}
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="MemoMind" className="w-9 h-9" />
              <div>
                <h1 className="text-lg font-bold text-gray-900 dark:text-white leading-tight">MemoMind</h1>
                <p className="label-bracket hidden sm:block">discutez avec vos mémos vocaux</p>
              </div>
            </div>

            {/* Navigation */}
            <nav className="flex items-center gap-1">
              <NavButton
                icon={Mic}
                label="Enregistrer"
                isActive={activeView === 'upload'}
                onClick={() => setActiveView('upload')}
              />
              <NavButton
                icon={Clock}
                label="Historique"
                isActive={activeView === 'history'}
                onClick={() => setActiveView('history')}
              />
              <NavButton
                icon={Settings}
                label="Réglages"
                isActive={isSettingsOpen}
                onClick={() => setIsSettingsOpen(true)}
              />
              <NavButton
                icon={LogOut}
                label="Quitter"
                isActive={false}
                onClick={handleLogout}
              />
            </nav>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-start justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-2xl">
          {activeView === 'upload' ? (
            <Upload
              onTranscriptStarted={() => {
                loadTranscripts({ quiet: true })
                setActiveView('history')
              }}
            />
          ) : (
            <div className="animate-fade-in">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-6">
                <span className="label-bracket text-base">historique</span>
              </h2>
              {loading ? (
                <div className="card p-12 flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : (
                <TranscriptViewer
                  transcripts={transcripts}
                  onTranscriptDeleted={handleTranscriptDeleted}
                  onTranscriptChanged={handleTranscriptChanged}
                />
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-700 dark:text-gray-300">MemoMind</span>
              <span>|</span>
              <span>© <a href="https://alanbouo.com" className="text-primary-800 dark:text-primary-400 hover:underline">alanbouo.com</a></span>
            </div>
            <div className="flex items-center gap-4">
              <button onClick={handleLogout} className="hover:text-gray-700 dark:hover:text-gray-300">Déconnexion</button>
              <a href="https://alanbouo.com/about" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 dark:hover:text-gray-300">À propos</a>
              <a href="https://alanbouo.com/contact" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700 dark:hover:text-gray-300">Contact</a>
              <Link to="/privacy" className="hover:text-gray-700 dark:hover:text-gray-300">Confidentialité</Link>
            </div>
          </div>
        </div>
      </footer>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onSettingsChange={(newSettings) => {
          setUserSettings(newSettings)
          if (newSettings.theme === 'dark') {
            setDarkMode(true)
          } else if (newSettings.theme === 'light') {
            setDarkMode(false)
          } else {
            setDarkMode(window.matchMedia('(prefers-color-scheme: dark)').matches)
          }
        }}
      />
    </div>
  )
}

export default Dashboard
