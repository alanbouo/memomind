import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useRouteSeo } from '../utils/seo'

function Legal() {
  useRouteSeo('/privacy')
  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              <img src="/logo.png" alt="MemoMind" className="w-9 h-9" />
              <div>
                <p className="text-lg font-bold text-gray-900">MemoMind</p>
                <p className="text-xs text-gray-500">Chat with your voice memos</p>
              </div>
            </Link>
            
            <Link 
              to="/"
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 py-12">
        <div className="max-w-3xl mx-auto">
          <div className="bg-white rounded-xl shadow-sm p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Privacy Policy</h1>
            <p className="text-sm text-gray-500 mb-8">Last updated: November 2025</p>

            <div className="prose prose-gray max-w-none">
              <section className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Overview</h2>
                <p className="text-gray-600 mb-4">
                  MemoMind ("we", "our", or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our audio transcription service.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Audio File Handling</h2>
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                  <p className="text-green-800 font-medium">
                    🔒 Your audio files are automatically and permanently deleted immediately after transcription is complete.
                  </p>
                </div>
                <p className="text-gray-600 mb-4">
                  We do not store, retain, or archive any audio files you upload. Once your transcription is processed:
                </p>
                <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                  <li>The original audio file is permanently deleted from our servers</li>
                  <li>Any temporary copies created during processing are also deleted</li>
                  <li>We have no ability to recover or access your audio after deletion</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Data We Collect</h2>
                
                <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">For Registered Users</h3>
                <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                  <li><strong>Account information:</strong> Email address and encrypted password</li>
                  <li><strong>Transcripts:</strong> Text content of your transcriptions (not audio)</li>
                  <li><strong>Chat history:</strong> Your conversations with the AI about transcripts</li>
                  <li><strong>Settings:</strong> Your preferences and customizations</li>
                </ul>

                <h3 className="text-lg font-medium text-gray-800 mt-4 mb-2">For Guest Users</h3>
                <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                  <li>No personal information is collected</li>
                  <li>Transcripts are not stored after your session ends</li>
                  <li>No cookies or tracking beyond essential functionality</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">How We Use Your Data</h2>
                <p className="text-gray-600 mb-4">We use your information solely to:</p>
                <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                  <li>Provide the transcription service</li>
                  <li>Save your transcripts for future access (registered users only)</li>
                  <li>Enable AI chat functionality about your transcripts</li>
                  <li>Maintain and improve our service</li>
                </ul>
                <p className="text-gray-600">
                  We do <strong>not</strong> sell, share, or use your data for advertising purposes.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Third-Party Services</h2>
                <p className="text-gray-600 mb-4">We use the following third-party services to provide our functionality:</p>
                <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                  <li><strong>AssemblyAI:</strong> For audio transcription processing</li>
                  <li><strong>Anthropic:</strong> For AI chat functionality</li>
                </ul>
                <p className="text-gray-600">
                  These services process your data according to their respective privacy policies. Audio sent for transcription is subject to AssemblyAI's data handling practices.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Data Security</h2>
                <p className="text-gray-600 mb-4">We implement appropriate security measures including:</p>
                <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                  <li>Encrypted data transmission (HTTPS)</li>
                  <li>Secure password hashing</li>
                  <li>JWT-based authentication</li>
                  <li>Regular security updates</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Your Rights</h2>
                <p className="text-gray-600 mb-4">You have the right to:</p>
                <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                  <li><strong>Access:</strong> View all your stored data</li>
                  <li><strong>Export:</strong> Download all your transcripts</li>
                  <li><strong>Delete:</strong> Permanently delete your account and all associated data</li>
                  <li><strong>Modify:</strong> Update your account information</li>
                </ul>
                <p className="text-gray-600">
                  These options are available in your account settings.
                </p>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Data Retention</h2>
                <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                  <li><strong>Audio files:</strong> Deleted immediately after processing</li>
                  <li><strong>Transcripts:</strong> Retained until you delete them or your account</li>
                  <li><strong>Account data:</strong> Retained until you delete your account</li>
                </ul>
              </section>

              <section className="mb-8">
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Contact</h2>
                <p className="text-gray-600">
                  For any privacy-related questions or concerns, please contact us at{' '}
                  <a href="https://alanbouo.com/contact" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
                    alanbouo.com/contact
                  </a>
                </p>
              </section>

              <section>
                <h2 className="text-xl font-semibold text-gray-900 mb-3">Changes to This Policy</h2>
                <p className="text-gray-600">
                  We may update this Privacy Policy from time to time. We will notify users of any material changes by updating the "Last updated" date at the top of this page.
                </p>
              </section>
            </div>
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
              <span>© 2025 <a href="https://alanbouo.com" className="text-blue-600 hover:underline">alanbouo.com</a></span>
            </div>
            <div className="flex items-center gap-4">
              <a href="https://alanbouo.com/about" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700">About</a>
              <a href="https://alanbouo.com/contact" target="_blank" rel="noopener noreferrer" className="hover:text-gray-700">Contact</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Legal
