import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import { useTheme } from '../lib/theme'

const BAR = 4
const GAP = 3
const HEIGHT = 96
const TICK_MS = 80 // one new bar every tick: the wave scrolls right to left

/**
 * Scrolling audiogram: a bar is added for the current input level every tick and the
 * older ones slide left. `level` is 0..1; `active` false freezes it (paused).
 * Pass `resetKey` to clear the wave (a new recording).
 */
export function Waveform({ level, active, resetKey }: { level: number; active: boolean; resetKey: number }) {
  const t = useTheme()
  const [width, setWidth] = useState(0)
  const [bars, setBars] = useState<number[]>([])
  const latest = useRef(level)
  const count = Math.max(1, Math.floor((width + GAP) / (BAR + GAP)))

  useEffect(() => {
    latest.current = level
  }, [level])

  useEffect(() => {
    const clear = setTimeout(() => setBars([]), 0)
    return () => clearTimeout(clear)
  }, [resetKey])

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setBars((prev) => [...prev.slice(-(count - 1)), latest.current]), TICK_MS)
    return () => clearInterval(timer)
  }, [active, count])

  // Pad on the left so the wave starts at the right edge and fills the screen as time passes.
  const shown = [...Array(Math.max(0, count - bars.length)).fill(null), ...bars.slice(-count)] as (number | null)[]

  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ height: HEIGHT, width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: GAP, overflow: 'hidden' }}
    >
      {shown.map((v, i) => (
        <View
          key={i}
          style={{
            width: BAR,
            height: v === null ? 2 : Math.max(3, v * HEIGHT),
            borderRadius: BAR / 2,
            backgroundColor: v === null ? t.border : t.primary,
            opacity: v === null ? 1 : 0.35 + 0.65 * (i / Math.max(1, shown.length - 1)),
          }}
        />
      ))}
    </View>
  )
}
