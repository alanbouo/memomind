import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, KeyRound, ArrowRight, Zap, Clock, MessageSquare, Shield } from 'lucide-react'
import { requestEmailCode, verifyEmailCode } from '../services/api'
import { setToken, setRefreshToken } from '../utils/auth'
import { useRouteSeo } from '../utils/seo'

function Login({ setIsAuthenticated, setGuestMode }) {
  useRouteSeo('/login')
  const navigate = useNavigate()
  const [view, setView] = useState('home') // 'home' | 'login' | 'signup' (same flow, different wording)
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sentTo, setSentTo] = useState(null) // set once a code has been e-mailed
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleGuestMode = () => {
    setGuestMode(true)
    navigate('/')
  }

  const handleSendCode = async (e) => {
    e?.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const address = email.trim().toLowerCase()
      await requestEmailCode(address)
      setSentTo(address)
      setCode('')
      setSuccess(`We sent a 6-digit code to ${address}.`)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not send the code. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const data = await verifyEmailCode(sentTo, code.trim())
      setToken(data.access_token)
      setRefreshToken(data.refresh_token)
      setIsAuthenticated(true)
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid or expired code.')
      setCode('')
      setLoading(false)
    }
  }

  const resetForm = () => {
    setEmail('')
    setCode('')
    setSentTo(null)
    setError('')
    setSuccess('')
  }

  const goToView = (newView) => {
    resetForm()
    setView(newView)
  }

  // Homepage view
  if (view === 'home') {
    return (
      <div className="min-h-screen flex flex-col bg-gray-100">
        {/* Header */}
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="MemoMind" className="w-9 h-9" />
                <div>
                  <p className="text-lg font-bold text-gray-900">MemoMind</p>
                  <p className="text-xs text-gray-500">Chat with your voice memos</p>
                </div>
              </div>
              
              {/* Auth buttons in header */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => goToView('login')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  Log in
                </button>
                <button
                  onClick={() => goToView('signup')}
                  className="px-4 py-2 text-sm font-medium text-gray-900 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Sign up
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content - Hero */}
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="max-w-2xl w-full text-center">
            {/* Hero Text */}
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
              Chat with Your Voice Memos
            </h1>
            <p className="text-lg text-gray-600 mb-8">
              Turn your recordings into searchable transcripts and have AI conversations about what was said.
            </p>

            {/* Main CTA - Try Now */}
            <div className="bg-white rounded-xl shadow-sm p-8 mb-6">
              <button
                onClick={handleGuestMode}
                className="w-full py-4 bg-blue-600 text-gray-900 text-lg font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
              >
                Try it now — no account needed
                <ArrowRight className="w-5 h-5" />
              </button>
              <p className="text-sm text-gray-500 mt-3">
                Free trial: 5MB max file size • No signup required
              </p>
            </div>

            {/* Privacy Banner */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-8 flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
                <Shield className="w-6 h-6 text-green-600" />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-green-900">Your privacy is protected</h3>
                <p className="text-sm text-green-700">
                  Audio files are automatically deleted immediately after transcription. We never store or share your recordings.
                </p>
              </div>
            </div>

            {/* Features */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
              <div className="bg-white rounded-lg p-4 text-left">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3">
                  <Zap className="w-5 h-5 text-primary-800 dark:text-primary-400" />
                </div>
                <h3 className="font-medium text-gray-900 mb-1">Fast & Accurate</h3>
                <p className="text-sm text-gray-500">AI-powered transcription with speaker detection</p>
              </div>
              <div className="bg-white rounded-lg p-4 text-left">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-3">
                  <MessageSquare className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="font-medium text-gray-900 mb-1">AI Chat</h3>
                <p className="text-sm text-gray-500">Ask questions about your transcripts</p>
              </div>
              <div className="bg-white rounded-lg p-4 text-left">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-3">
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="font-medium text-gray-900 mb-1">History</h3>
                <p className="text-sm text-gray-500">Save and access all your transcripts</p>
              </div>
            </div>

            {/* Secondary CTAs */}
            <div className="flex items-center justify-center gap-4">
              <span className="text-gray-500">Want full features?</span>
              <button
                onClick={() => goToView('signup')}
                className="text-primary-800 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300 font-medium"
              >
                Create free account
              </button>
              <span className="text-gray-300">|</span>
              <button
                onClick={() => goToView('login')}
                className="text-gray-600 hover:text-gray-700"
              >
                Log in
              </button>
            </div>
          </div>
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 py-4">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">MemoMind</span>
                <span>|</span>
                <span>© 2025 <a href="https://alanbouo.com" className="text-primary-800 dark:text-primary-400 hover:underline">alanbouo.com</a></span>
              </div>
              <div className="flex items-center gap-4">
                <a href="https://alanbouo.com/about" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700">About</a>
                <a href="https://alanbouo.com/contact" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700">Contact</a>
                <Link to="/privacy" className="hover:text-gray-700">Privacy Policy</Link>
              </div>
            </div>
          </div>
        </footer>
      </div>
    )
  }

  // Login / Signup form view
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <button 
              onClick={() => goToView('home')}
              className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            >
              <img src="/logo.png" alt="MemoMind" className="w-9 h-9" />
              <div>
                <h1 className="text-lg font-bold text-gray-900">MemoMind</h1>
                <p className="text-xs text-gray-500">Chat with your voice memos</p>
              </div>
            </button>
            
            {/* Toggle between login/signup */}
            <div className="flex items-center gap-3">
              {view === 'login' ? (
                <>
                  <span className="text-sm text-gray-500 hidden sm:inline">Don't have an account?</span>
                  <button
                    onClick={() => goToView('signup')}
                    className="px-4 py-2 text-sm font-medium text-gray-900 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  <span className="text-sm text-gray-500 hidden sm:inline">Already have an account?</span>
                  <button
                    onClick={() => goToView('login')}
                    className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Log in
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="bg-white rounded-xl shadow-sm p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">
              {view === 'signup' ? 'Create your account' : 'Welcome back'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {view === 'signup' ? 'Start transcribing your audio files' : 'We will email you a one-time code'}
            </p>
          </div>

          {sentTo ? (
            <form onSubmit={handleVerify} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  6-digit code
                </label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent tracking-[0.5em] text-lg"
                    placeholder="000000"
                    autoFocus
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
              )}
              {success && (
                <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>
              )}

              <button
                type="submit"
                disabled={loading || code.length !== 6}
                className="w-full py-3 bg-blue-600 text-gray-900 font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Signing in...' : 'Sign In'}
              </button>
              <div className="flex items-center justify-between text-sm">
                <button type="button" onClick={handleSendCode} disabled={loading} className="text-primary-800 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300 disabled:opacity-50">
                  Send a new code
                </button>
                <button type="button" onClick={resetForm} className="text-gray-500 hover:text-gray-700">
                  Use another email
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSendCode} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="your.email@example.com"
                    required
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 text-gray-900 font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Sending...' : 'Email me a code'}
              </button>
              <p className="text-xs text-gray-500 text-center">
                No password needed. Your account is created the first time you sign in.
              </p>
            </form>
          )}

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">or</span>
            </div>
          </div>

          {/* Guest Mode Button */}
          <button
            type="button"
            onClick={handleGuestMode}
            className="w-full py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Try without an account
          </button>
          <p className="text-xs text-gray-500 text-center mt-2">
            Limited to 5MB files • No history • Default prompts only
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-700">MemoMind</span>
              <span>|</span>
              <span>© 2025 <a href="https://alanbouo.com" className="text-primary-800 dark:text-primary-400 hover:underline">alanbouo.com</a></span>
            </div>
            <div className="flex items-center gap-4">
              <a href="https://alanbouo.com/about" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700">About</a>
              <a href="https://alanbouo.com/contact" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700">Contact</a>
              <Link to="/privacy" className="hover:text-gray-700">Privacy Policy</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Login
