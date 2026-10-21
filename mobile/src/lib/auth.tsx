import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as api from './api'
import { clearCache } from './cache'
import { clearMarkers } from './markers'
import { clearTokens, loadTokens, saveTokens } from './storage'
import { getAppleIdToken, getGoogleIdToken, SocialProvider } from './social'

type Status = 'loading' | 'signedOut' | 'signedIn' | 'guest'

interface AuthContextValue {
  status: Status
  /** Exchanges the code e-mailed to `email` for a session. */
  signInWithCode: (email: string, code: string) => Promise<void>
  /** Throws SignInCancelled if the user dismisses the provider's sheet. */
  signInWithProvider: (provider: SocialProvider) => Promise<void>
  signOut: () => Promise<void>
  enterGuest: () => void
  /** Last guest transcription, kept in memory only. */
  guestResult: api.GuestResult | null
  setGuestResult: (r: api.GuestResult | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [guestResult, setGuestResult] = useState<api.GuestResult | null>(null)

  const signOut = useCallback(async () => {
    await clearTokens()
    clearCache() // the next person to sign in must not see these transcripts
    clearMarkers()
    setGuestResult(null)
    setStatus('signedOut')
  }, [])

  useEffect(() => {
    api.setSessionExpiredHandler(() => setStatus('signedOut'))
    loadTokens()
      .then(({ access, refresh }) => setStatus(access || refresh ? 'signedIn' : 'signedOut'))
      .catch(() => setStatus('signedOut'))
    return () => api.setSessionExpiredHandler(null)
  }, [])

  const signInWithCode = useCallback(async (email: string, code: string) => {
    const t = await api.verifyEmailCode(email, code)
    await saveTokens(t.access_token, t.refresh_token)
    setStatus('signedIn')
  }, [])

  const signInWithProvider = useCallback(async (provider: SocialProvider) => {
    const idToken = await (provider === 'apple' ? getAppleIdToken() : getGoogleIdToken())
    const t = await api.socialLogin(provider, idToken)
    await saveTokens(t.access_token, t.refresh_token)
    setStatus('signedIn')
  }, [])

  const value = useMemo(
    () => ({
      status,
      signInWithCode,
      signInWithProvider,
      signOut,
      enterGuest: () => setStatus('guest'),
      guestResult,
      setGuestResult,
    }),
    [status, signInWithCode, signInWithProvider, signOut, guestResult]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
