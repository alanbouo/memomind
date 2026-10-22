import { useEffect } from 'react'
import { Link } from 'react-router-dom'

function NotFound() {
  useEffect(() => {
    document.title = 'Page not found – MemoMind'
    let robots = document.head.querySelector('meta[name="robots"]')
    if (!robots) {
      robots = document.createElement('meta')
      robots.name = 'robots'
      document.head.appendChild(robots)
    }
    robots.content = 'noindex, nofollow'
  }, [])

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100 px-4 text-center">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Page not found</h1>
        <p className="text-gray-600 mb-6">This page does not exist.</p>
        <Link to="/" className="px-6 py-3 bg-primary-600 text-gray-900 rounded-lg font-medium hover:bg-primary-700">
          Back to MemoMind
        </Link>
      </div>
    </main>
  )
}

export default NotFound
