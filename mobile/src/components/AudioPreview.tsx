import { AudioPlayer, AudioStatus, setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio'
import { useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../lib/theme'
import { Muted } from './ui'

const fmt = (s: number) => {
  const sec = Math.max(0, Math.floor(s))
  return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`
}

/** Play/pause + tap-to-seek preview of a local audio file. */
export function AudioPreview({ uri, name }: { uri: string; name: string }) {
  const player = useAudioPlayer({ uri })
  const status = useAudioPlayerStatus(player)
  return <PlayerControls player={player} status={status} label={name} />
}

/** The controls themselves, for callers that own the player (e.g. the transcript screen). */
export function PlayerControls({ player, status, label }: { player: AudioPlayer; status: AudioStatus; label?: string }) {
  const t = useTheme()
  const [width, setWidth] = useState(0)

  const toggle = async () => {
    if (status.playing) return player.pause()
    // Make sure playback is routed to the speaker (not the earpiece) after recording.
    await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true })
    if (status.didJustFinish || (status.duration > 0 && status.currentTime >= status.duration - 0.1)) {
      await player.seekTo(0)
    }
    player.play()
  }

  const ratio = status.duration > 0 ? Math.min(1, status.currentTime / status.duration) : 0

  return (
    <View style={{ gap: 10 }}>
      {label !== undefined && (
        <Text style={{ color: t.text, fontWeight: '600' }} numberOfLines={1}>
          {label}
        </Text>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={status.playing ? 'Pause' : 'Écouter'}
          onPress={toggle}
          disabled={!status.isLoaded}
          style={[styles.play, { backgroundColor: t.primary, opacity: status.isLoaded ? 1 : 0.5 }]}
        >
          <Text style={{ color: '#fff', fontSize: 16 }}>{status.playing ? '❚❚' : '▶'}</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Pressable
            onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
            onPress={(e) => width > 0 && status.duration > 0 && player.seekTo((e.nativeEvent.locationX / width) * status.duration)}
            hitSlop={{ top: 12, bottom: 12 }}
            style={[styles.track, { backgroundColor: t.border }]}
          >
            <View style={[styles.bar, { backgroundColor: t.primary, width: `${ratio * 100}%` }]} />
          </Pressable>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
            <Muted style={{ fontSize: 12 }}>{fmt(status.currentTime)}</Muted>
            <Muted style={{ fontSize: 12 }}>{fmt(status.duration)}</Muted>
          </View>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  play: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  bar: { height: 8, borderRadius: 4 },
})
