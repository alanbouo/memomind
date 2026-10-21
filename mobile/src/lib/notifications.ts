import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import { Platform } from 'react-native'
import { registerPushToken, unregisterPushToken } from './api'
import { getLocalPrefs, markPushAsked, setPushToken } from './prefs'

// While the app is open the screens already show the progress: no banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: false, shouldShowList: false }),
})

async function expoToken(): Promise<string | null> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', { name: 'Transcriptions', importance: Notifications.AndroidImportance.DEFAULT })
  }
  let { status } = await Notifications.getPermissionsAsync()
  if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status
  if (status !== 'granted') return null
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data
}

/** Asks for the permission and registers this device. Returns false if the user refused or it failed. */
export async function enableNotifications(): Promise<boolean> {
  markPushAsked()
  try {
    const token = await expoToken()
    if (!token) return false
    await registerPushToken(token, Platform.OS)
    setPushToken(token)
    return true
  } catch {
    return false
  }
}

/** Stops notifications on this device. Best effort: never blocks a sign-out. */
export async function disableNotifications(): Promise<void> {
  const token = getLocalPrefs().pushToken
  if (!token) return
  setPushToken(undefined)
  try {
    await unregisterPushToken(token)
  } catch {
    // the server drops dead tokens by itself
  }
}

/** Re-registers the token after sign-in or an app start: it may have changed, or belonged to another account. */
export async function syncNotifications(): Promise<void> {
  if (!getLocalPrefs().pushToken) return
  const { status } = await Notifications.getPermissionsAsync()
  if (status !== 'granted') return setPushToken(undefined)
  await enableNotifications()
}

/** Offers the notifications once, the first time a transcription is started. */
export async function offerNotificationsOnce(): Promise<void> {
  const prefs = getLocalPrefs()
  if (prefs.pushToken || prefs.pushAsked) return
  await enableNotifications()
}
