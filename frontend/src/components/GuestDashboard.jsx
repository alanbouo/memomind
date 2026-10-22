import { useState } from 'react'
import { Link } from 'react-router-dom'
import { UserPlus, X, Send, Loader2, Clock } from 'lucide-react'
import { transcribeAudioGuest, sendChatMessageGuest, rememberGuestTranscript, forgetGuestTranscript } from '../services/api'
import GuestUpload from './GuestUpload'
import { formatRange } from '../utils/time'

function GuestDashboard({ setGuestMode }) {
  const [transcript, setTranscript] = useState(null)
  const [showSignupPrompt, setShowSignupPrompt] = useState(false)

  const handleTranscriptComplete = (result) => {
    setTranscript(result)
    rememberGuestTranscript(result)
    // Show signup prompt after successful transcription
    setTimeout(() => setShowSignupPrompt(true), 2000)
  }

  const handleExitGuest = () => {
    setGuestMode(false)
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo & Title */}
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="MemoMind" className="w-9 h-9" />
              <div>
                <h1 className="text-lg font-bold text-gray-900">MemoMind</h1>
                <p className="text-xs text-gray-500">Guest Mode • Limited features</p>
              </div>
            </div>

            {/* Guest Badge & Sign Up */}
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                Guest
              </span>
              <button
                onClick={handleExitGuest}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-gray-900 text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                <UserPlus className="w-4 h-4" />
                Sign Up Free
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          {!transcript ? (
            <GuestUpload onTranscriptComplete={handleTranscriptComplete} />
          ) : (
            <GuestTranscriptView 
              transcript={transcript} 
              onNewTranscript={() => {
                forgetGuestTranscript()
                setTranscript(null)
                setShowSignupPrompt(false)
              }}
            />
          )}
        </div>
      </main>

      {/* Signup Prompt Modal */}
      {showSignupPrompt && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Unlock Full Features</h3>
              <button 
                onClick={() => setShowSignupPrompt(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <p className="text-gray-600 mb-4">
              Create a free account to get:
            </p>
            
            <ul className="space-y-2 mb-6">
              <li className="flex items-center gap-2 text-sm text-gray-700">
                <span className="w-5 h-5 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs">✓</span>
                Upload files up to 100MB
              </li>
              <li className="flex items-center gap-2 text-sm text-gray-700">
                <span className="w-5 h-5 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs">✓</span>
                Save and access transcript history
              </li>
              <li className="flex items-center gap-2 text-sm text-gray-700">
                <span className="w-5 h-5 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs">✓</span>
                Customize AI prompts
              </li>
              <li className="flex items-center gap-2 text-sm text-gray-700">
                <span className="w-5 h-5 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs">✓</span>
                Persistent chat history
              </li>
              <li className="flex items-center gap-2 text-sm text-gray-700">
                <span className="w-5 h-5 bg-green-100 text-green-600 rounded-full flex items-center justify-center text-xs">✓</span>
                Export all your data
              </li>
            </ul>

            <div className="flex gap-3">
              <button
                onClick={handleExitGuest}
                className="flex-1 py-2.5 bg-blue-600 text-gray-900 font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create Free Account
              </button>
              <button
                onClick={() => setShowSignupPrompt(false)}
                className="px-4 py-2.5 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                Later
              </button>
            </div>
          </div>
        </div>
      )}

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
              <button onClick={handleExitGuest} className="text-primary-800 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300 font-medium">
                Sign Up / Login
              </button>
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

// Guest Transcript View with Chat
function GuestTranscriptView({ transcript, onNewTranscript }) {
  const [chatMessages, setChatMessages] = useState([])
  const [inputMessage, setInputMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [showTimestamps, setShowTimestamps] = useState(true)

  const utterances = transcript.utterances || []

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!inputMessage.trim() || isLoading) return

    const userMessage = inputMessage.trim()
    setInputMessage('')
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setIsLoading(true)

    try {
      const response = await sendChatMessageGuest(userMessage, transcript.text)
      setChatMessages(prev => [...prev, { role: 'assistant', content: response.response }])
    } catch (error) {
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: 'Sorry, there was an error processing your request.' 
      }])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Transcript Card */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Your Transcript</h2>
          <div className="flex items-center gap-3">
            {utterances.length > 0 && (
              <button
                onClick={() => setShowTimestamps(!showTimestamps)}
                className={`flex items-center gap-1.5 text-sm font-medium ${
                  showTimestamps ? 'text-primary-800 dark:text-primary-400' : 'text-gray-500 hover:text-gray-700'
                }`}
                title={showTimestamps ? 'Hide timestamps' : 'Show timestamps'}
              >
                <Clock className="w-4 h-4" />
                Timestamps
              </button>
            )}
            <button
              onClick={onNewTranscript}
              className="text-sm text-primary-800 dark:text-primary-400 hover:text-primary-900 dark:hover:text-primary-300 font-medium"
            >
              New Transcription
            </button>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
          {utterances.length > 0 ? (
            <div className="space-y-3">
              {utterances.map((utterance, index) => {
                // Only label the speaker when it changes: a monologue is split
                // into many timestamped segments
                const isNewSpeaker =
                  index === 0 || utterances[index - 1].speaker !== utterance.speaker

                return (
                  <div key={index} className="text-sm">
                    <div className="flex items-center gap-2 mb-0.5">
                      {isNewSpeaker && (
                        <span className="font-semibold text-gray-900">
                          {utterance.speaker_name || utterance.speaker}
                        </span>
                      )}
                      {showTimestamps && (
                        <span className="text-xs text-gray-500 font-mono bg-gray-200 px-2 py-0.5 rounded">
                          {utterance.timestamp || formatRange(utterance.start, utterance.end)}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-700 leading-relaxed">{utterance.text}</p>
                  </div>
                )
              })}
            </div>
          ) : (
            <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
              {transcript.text}
            </pre>
          )}
        </div>

        <p className="text-xs text-amber-600 mt-3">
          ⚠️ This transcript is not saved. Create an account to keep your transcripts.
        </p>
      </div>

      {/* Chat Section */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowChat(!showChat)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <span className="font-medium text-gray-900">Chat with AI about this transcript</span>
          <span className="text-gray-400">{showChat ? '−' : '+'}</span>
        </button>

        {showChat && (
          <div className="border-t border-gray-200">
            {/* Chat Messages */}
            <div className="h-64 overflow-y-auto p-4 space-y-3">
              {chatMessages.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  Ask questions about your transcript...
                </p>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] px-4 py-2 rounded-lg text-sm ${
                        msg.role === 'user'
                          ? 'bg-blue-600 text-gray-900'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 px-4 py-2 rounded-lg">
                    <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
                  </div>
                </div>
              )}
            </div>

            {/* Chat Input */}
            <form onSubmit={handleSendMessage} className="border-t border-gray-200 p-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  placeholder="Ask about the transcript..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  type="submit"
                  disabled={isLoading || !inputMessage.trim()}
                  className="px-4 py-2 bg-blue-600 text-gray-900 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Chat history is not saved in guest mode
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}

export default GuestDashboard
