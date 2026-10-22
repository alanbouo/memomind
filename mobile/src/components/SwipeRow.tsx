import { forwardRef, ReactNode, useImperativeHandle, useMemo, useRef } from 'react'
import { Animated, PanResponder, View } from 'react-native'

export interface SwipeRowHandle {
  close: () => void
}

interface SwipeRowProps {
  children: ReactNode
  /** Revealed by swiping right. */
  left?: ReactNode
  leftWidth?: number
  /** Revealed by swiping left. */
  right?: ReactNode
  rightWidth?: number
  enabled?: boolean
  /** Swiping right past the middle of the row runs this instead of just revealing the buttons. */
  onFullLeft?: () => void
  /** Same, swiping left. */
  onFullRight?: () => void
  /** Background shown behind the buttons while the row is dragged far. */
  leftColor?: string
  rightColor?: string
}

/** A row that slides sideways to show actions behind it. Plain Animated: no native module. */
export const SwipeRow = forwardRef<SwipeRowHandle, SwipeRowProps>(function SwipeRow(
  { children, left, leftWidth = 0, right, rightWidth = 0, enabled = true, onFullLeft, onFullRight, leftColor, rightColor },
  ref
) {
  const x = useRef(new Animated.Value(0)).current
  const base = useRef(0) // where the row rested when the finger went down
  const limits = useRef({ left: 0, right: 0 })
  limits.current = { left: left ? leftWidth : 0, right: right ? rightWidth : 0 }
  const width = useRef(0)
  const full = useRef({ left: onFullLeft, right: onFullRight })
  full.current = { left: onFullLeft, right: onFullRight }

  const settle = (to: number) => {
    base.current = to
    Animated.spring(x, { toValue: to, useNativeDriver: true, bounciness: 0 }).start()
  }
  // Slide the row out, run the action, then put the row back (it may still be there if the action was cancelled).
  const runFull = (to: number, action: () => void) => {
    Animated.timing(x, { toValue: to, duration: 120, useNativeDriver: true }).start(() => {
      action()
      base.current = 0
      Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start()
    })
  }
  useImperativeHandle(ref, () => ({ close: () => settle(0) }))

  const pan = useMemo(
    () =>
      PanResponder.create({
        // Take over only for a clearly horizontal drag, so the list still scrolls.
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => {
          // Past the buttons the row keeps following the finger, up to the full width, when a full swipe does something.
          const maxLeft = full.current.left ? width.current : limits.current.left
          const maxRight = full.current.right ? width.current : limits.current.right
          x.setValue(Math.min(maxLeft, Math.max(-maxRight, base.current + g.dx)))
        },
        onPanResponderRelease: (_, g) => {
          const at = base.current + g.dx
          const far = width.current * 0.55
          if (full.current.left && at > far) return runFull(width.current, full.current.left)
          if (full.current.right && -at > far) return runFull(-width.current, full.current.right)
          if (at > limits.current.left / 2 && limits.current.left) settle(limits.current.left)
          else if (-at > limits.current.right / 2 && limits.current.right) settle(-limits.current.right)
          else settle(0)
        },
        onPanResponderTerminate: () => settle(0),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [x]
  )

  if (!enabled) return <View>{children}</View>

  return (
    <View onLayout={(e) => (width.current = e.nativeEvent.layout.width)}>
      {left && <Animated.View pointerEvents="box-none" style={{ opacity: x.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: 'clamp' }), position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: leftColor, borderRadius: 16 }}><View style={{ width: leftWidth, flex: 1 }}>{left}</View></Animated.View>}
      {right && <Animated.View pointerEvents="box-none" style={{ opacity: x.interpolate({ inputRange: [-1, 0], outputRange: [1, 0], extrapolate: 'clamp' }), position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'flex-end', backgroundColor: rightColor, borderRadius: 16 }}><View style={{ width: rightWidth, flex: 1 }}>{right}</View></Animated.View>}
      <Animated.View style={{ transform: [{ translateX: x }] }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  )
})
