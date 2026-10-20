import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as api from './api'
import { clearTokens, loadTokens, saveTokens } from './storage'
import { getAppleIdToken, getGoogleIdToken, SocialProvider } from './social'

type Status = 'loading' | 'signedOut' | 'signedIn' | 'guest'

interface AuthContextValue {
  status: Status
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
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

  const signIn = useCallback(async (email: string, password: string) => {
    const t = await api.login(email, password)
    await saveTokens(t.access_token, t.refresh_token)
    setStatus('signedIn')
  }, [])

  const signInWithProvider = useCallback(async (provider: SocialProvider) => {
    const idToken = await (provider === 'apple' ? getAppleIdToken() : getGoogleIdToken())
    const t = await api.socialLogin(provider, idToken)
    await saveTokens(t.access_token, t.refresh_token)
    setStatus('signedIn')
  }, [])

  const signUp = useCallback(
    async (email: string, password: string) => {
      await api.register(email, password)
      await signIn(email, password)
    },
    [signIn]
  )

  const value = useMemo(
    () => ({
      status,
      signIn,
      signUp,
      signInWithProvider,
      signOut,
      enterGuest: () => setStatus('guest'),
      guestResult,
      setGuestResult,
    }),
    [status, signIn, signUp, signInWithProvider, signOut, guestResult]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
