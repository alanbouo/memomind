import { Platform } from 'react-native'
import * as AppleAuthentication from 'expo-apple-authentication'

export type SocialProvider = 'google' | 'apple'

/** Thrown when the user dismisses the provider's sheet: not an error to show. */
export class SignInCancelled extends Error {}

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID

export const googleConfigured = Boolean(GOOGLE_WEB_CLIENT_ID)

export const appleAvailable = (): Promise<boolean> =>
  Platform.OS === 'ios' ? AppleAuthentication.isAvailableAsync() : Promise.resolve(false)

export async function getAppleIdToken(): Promise<string> {
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    })
    if (!credential.identityToken) throw new Error('Apple : aucun jeton reçu')
    return credential.identityToken
  } catch (e) {
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new SignInCancelled()
    throw e
  }
}

export async function getGoogleIdToken(): Promise<string> {
  if (!GOOGLE_WEB_CLIENT_ID) throw new Error('Connexion Google non configurée')
  // Loaded lazily: the native module is absent from Expo Go and would crash on import.
  let mod: typeof import('@react-native-google-signin/google-signin')
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@react-native-google-signin/google-signin')
  } catch {
    throw new Error('Connexion Google indisponible dans Expo Go : utilisez un development build')
  }
  const { GoogleSignin, isCancelledResponse, isErrorWithCode, statusCodes } = mod
  GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID, iosClientId: GOOGLE_IOS_CLIENT_ID })
  try {
    if (Platform.OS === 'android') await GoogleSignin.hasPlayServices()
    const response = await GoogleSignin.signIn()
    if (isCancelledResponse(response)) throw new SignInCancelled()
    const idToken = response.data.idToken
    if (!idToken) throw new Error('Google : aucun jeton reçu')
    return idToken
  } catch (e) {
    if (e instanceof SignInCancelled) throw e
    if (isErrorWithCode(e) && e.code === statusCodes.SIGN_IN_CANCELLED) throw new SignInCancelled()
    throw e
  }
}
