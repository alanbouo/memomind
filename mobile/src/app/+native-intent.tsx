// A file shared to MemoMind opens the app on "memomind://expo-sharing", which is not a screen:
// land on the home route, the share itself is picked up by <IncomingShare />.
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  return path.includes('expo-sharing') ? '/' : path
}
