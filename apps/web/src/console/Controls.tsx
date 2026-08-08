import { useCallback } from 'react'
import { useConsoleControls, useConsolePressed } from './useConsoleInput'
import type { ConsoleIntent } from './intents'

/**
 * The physical controls.
 *
 * Every one is a real <button>, so the console is operable by tab and enter
 * before any of our own key handling exists. That is most of Gate 1.2 for free.
 *
 * They light up on the matching keypress, which teaches the mapping without a
 * tutorial screen. That is one fewer screen to build.
 */

function useHold(intent: ConsoleIntent) {
  const { press, release } = useConsoleControls()

  return {
    onPointerDown: useCallback(
      (e: React.PointerEvent) => {
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        press(intent)
      },
      [press, intent],
    ),
    onPointerUp: useCallback(() => release(intent), [release, intent]),
    onPointerCancel: useCallback(() => release(intent), [release, intent]),
    // Keyboard activation of the button itself, for screen reader and tab use.
    onKeyDown: useCallback(
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') press(intent)
      },
      [press, intent],
    ),
  }
}

export function DPad() {
  const pressed = useConsolePressed()
  const vertical = pressed.has('UP') || pressed.has('DOWN')
  const horizontal = pressed.has('LEFT') || pressed.has('RIGHT')

  const up = useHold('UP')
  const down = useHold('DOWN')
  const left = useHold('LEFT')
  const right = useHold('RIGHT')

  return (
    <div className="dpad-well">
      <div className="dpad">
        <i className={`v${vertical ? ' lit' : ''}`} />
        <i className={`h${horizontal ? ' lit' : ''}`} />
        <i className="c" />
        <div className="dpad-hit">
          <span />
          <button type="button" aria-label="Up" {...up} />
          <span />
          <button type="button" aria-label="Left" {...left} />
          <span />
          <button type="button" aria-label="Right" {...right} />
          <span />
          <button type="button" aria-label="Down" {...down} />
          <span />
        </div>
      </div>
    </div>
  )
}

export function ActionButtons() {
  const pressed = useConsolePressed()
  const a = useHold('A')
  const b = useHold('B')

  return (
    <div className="ab-well">
      <button
        type="button"
        aria-label="B, back"
        className={pressed.has('B') ? 'lit' : undefined}
        {...b}
      >
        B
      </button>
      <button
        type="button"
        aria-label="A, confirm"
        className={pressed.has('A') ? 'lit' : undefined}
        {...a}
      >
        A
      </button>
    </div>
  )
}

export function StartSelect() {
  const pressed = useConsolePressed()
  const start = useHold('START')
  const select = useHold('SELECT')

  return (
    <div className="startsel">
      <button
        type="button"
        aria-label="Select"
        className={pressed.has('SELECT') ? 'lit' : undefined}
        {...select}
      />
      <button
        type="button"
        aria-label="Start"
        className={pressed.has('START') ? 'lit' : undefined}
        {...start}
      />
    </div>
  )
}

export function Speaker() {
  return (
    <div className="speaker" aria-hidden="true">
      {Array.from({ length: 15 }, (_, i) => (
        <i key={i} />
      ))}
    </div>
  )
}
