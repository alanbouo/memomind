// Extends app.json. The Google Sign-In plugin throws without an iOS URL scheme,
// so it is only added once EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is set (see .env.example).
module.exports = ({ config }) => {
  const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
  const plugins = [...(config.plugins ?? []), 'expo-apple-authentication']
  if (iosClientId) {
    // The URL scheme is the iOS client id with its dot-separated parts reversed.
    const iosUrlScheme = `com.googleusercontent.apps.${iosClientId.replace('.apps.googleusercontent.com', '')}`
    plugins.push(['@react-native-google-signin/google-signin', { iosUrlScheme }])
  }
  return { ...config, plugins }
}
