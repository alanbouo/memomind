import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import * as api from './api'
import { clearCache } from './cache'
import { clearMarkers } from './markers'
import { disableNotifications } from './notifications'
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
  /** Goes to the sign-in screen but keeps the guest transcript, which is saved to the account once signed in. */
  leaveGuest: () => void
  /** Last guest transcription, kept in memory only. */
  guestResult: api.GuestResult | null
  setGuestResult: (r: api.GuestResult | null) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [guestResult, setGuestResult] = useState<api.GuestResult | null>(null)

  const guestRef = useRef(guestResult)
  useEffect(() => {
    guestRef.current = guestResult
  }, [guestResult])

  // A transcript made as a guest is saved to the account the person just signed in to. Best effort.
  const adoptGuestResult = useCallback(async () => {
    const g = guestRef.current
    if (!g) return
    try {
      await api.importGuestTranscript(g)
      setGuestResult(null)
    } catch {
      // the sign-in itself succeeded; the transcript stays in memory
    }
  }, [])

  const signOut = useCallback(async () => {
    await disableNotifications() // while the session is still valid: this device must stop receiving this account's alerts
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
    await adoptGuestResult()
    setStatus('signedIn')
  }, [adoptGuestResult])

  const signInWithProvider = useCallback(async (provider: SocialProvider) => {
    const idToken = await (provider === 'apple' ? getAppleIdToken() : getGoogleIdToken())
    const t = await api.socialLogin(provider, idToken)
    await saveTokens(t.access_token, t.refresh_token)
    await adoptGuestResult()
    setStatus('signedIn')
  }, [adoptGuestResult])

  const value = useMemo(
    () => ({
      status,
      signInWithCode,
      signInWithProvider,
      signOut,
      enterGuest: () => setStatus('guest'),
      leaveGuest: () => setStatus('signedOut'),
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
