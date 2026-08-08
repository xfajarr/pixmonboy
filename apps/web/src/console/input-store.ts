/**
 * The single source of input for the whole application.
 *
 * Deliberately framework-free so it can be created once, outside React, and
 * subscribed to with `useSyncExternalStore`. That matters for one reason: the
 * pressed-state changes on every D-pad tap, hundreds of times a session, and
 * putting it in ordinary React state would re-render every screen on every
 * press.
 */

import {
  GAMEPAD_BUTTONS,
  REPEATABLE,
  intentFromKey,
  intentsFromAxes,
  shouldPreventDefault,
} from './intents'
import type { ConsoleIntent } from './intents'

export type IntentHandler = (intent: ConsoleIntent) => void

export interface InputStore {
  /** Fires once per press, and repeatedly while a direction is held. */
  subscribeIntent: (handler: IntentHandler) => () => void
  /** For the visual state of the D-pad and buttons only. */
  subscribePressed: (onChange: () => void) => () => void
  getPressed: () => ReadonlySet<ConsoleIntent>
  /** Touch and programmatic input enter here. */
  press: (intent: ConsoleIntent) => void
  release: (intent: ConsoleIntent) => void
  /** Attaches window listeners and gamepad polling. Returns a teardown. */
  attach: () => () => void
}

const EMPTY: ReadonlySet<ConsoleIntent> = new Set()

export function createInputStore(): InputStore {
  const intentHandlers = new Set<IntentHandler>()
  const pressedHandlers = new Set<() => void>()

  // Replaced rather than mutated, so useSyncExternalStore sees a new reference
  // only when something actually changed.
  let pressed: ReadonlySet<ConsoleIntent> = EMPTY

  function emit(intent: ConsoleIntent) {
    for (const handler of intentHandlers) handler(intent)
  }

  function setPressed(next: ReadonlySet<ConsoleIntent>) {
    pressed = next
    for (const handler of pressedHandlers) handler()
  }

  function press(intent: ConsoleIntent) {
    if (pressed.has(intent)) {
      // Already held. Only directions are allowed to fire again.
      if (REPEATABLE.has(intent)) emit(intent)
      return
    }
    const next = new Set(pressed)
    next.add(intent)
    setPressed(next)
    emit(intent)
  }

  function release(intent: ConsoleIntent) {
    if (!pressed.has(intent)) return
    const next = new Set(pressed)
    next.delete(intent)
    setPressed(next)
  }

  function attach(): () => void {
    if (typeof window === 'undefined') return () => {}

    const onKeyDown = (e: KeyboardEvent) => {
      const intent = intentFromKey(e.key)
      if (!intent) return
      if (shouldPreventDefault(e.key)) e.preventDefault()

      // The browser's own key repeat drives direction repeat, so the timing
      // matches the user's OS settings rather than a number we invented.
      if (e.repeat && !REPEATABLE.has(intent)) return
      press(intent)
    }

    const onKeyUp = (e: KeyboardEvent) => {
      const intent = intentFromKey(e.key)
      if (intent) release(intent)
    }

    // A held key with the window unfocused would otherwise stay held forever.
    const onBlur = () => setPressed(EMPTY)

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)

    // ---- gamepad -----------------------------------------------------------
    // Polled only while one is connected. A permanent rAF loop on a page that
    // is mostly static is a battery cost for nothing.
    let frame = 0
    let padCount = 0
    const padPressed = new Set<ConsoleIntent>()

    const poll = () => {
      const pads = navigator.getGamepads()
      const seen = new Set<ConsoleIntent>()

      for (const pad of pads) {
        if (!pad) continue
        for (const [index, intent] of Object.entries(GAMEPAD_BUTTONS)) {
          if (pad.buttons[Number(index)]?.pressed) seen.add(intent)
        }
        for (const intent of intentsFromAxes(
          pad.axes[0] ?? 0,
          pad.axes[1] ?? 0,
        )) {
          seen.add(intent)
        }
      }

      for (const intent of seen) {
        if (!padPressed.has(intent)) {
          padPressed.add(intent)
          press(intent)
        }
      }
      for (const intent of [...padPressed]) {
        if (!seen.has(intent)) {
          padPressed.delete(intent)
          release(intent)
        }
      }

      frame = requestAnimationFrame(poll)
    }

    const onConnect = () => {
      padCount += 1
      if (padCount === 1) frame = requestAnimationFrame(poll)
    }
    const onDisconnect = () => {
      padCount = Math.max(0, padCount - 1)
      if (padCount === 0 && frame) {
        cancelAnimationFrame(frame)
        frame = 0
        for (const intent of [...padPressed]) release(intent)
        padPressed.clear()
      }
    }

    window.addEventListener('gamepadconnected', onConnect)
    window.addEventListener('gamepaddisconnected', onDisconnect)
    if (navigator.getGamepads().some(Boolean)) onConnect()

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('gamepadconnected', onConnect)
      window.removeEventListener('gamepaddisconnected', onDisconnect)
      if (frame) cancelAnimationFrame(frame)
      setPressed(EMPTY)
    }
  }

  return {
    subscribeIntent(handler) {
      intentHandlers.add(handler)
      return () => intentHandlers.delete(handler)
    },
    subscribePressed(onChange) {
      pressedHandlers.add(onChange)
      return () => pressedHandlers.delete(onChange)
    },
    getPressed: () => pressed,
    press,
    release,
    attach,
  }
}
