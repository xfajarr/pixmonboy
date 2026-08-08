import { useCallback, useRef } from 'react'

const TRACK_W = 98
const KNOB_W = 22
const TRAVEL = TRACK_W - KNOB_W

/**
 * The volume slider, on the lower half of the shell.
 *
 * A real slider, not a decoration: pointer drag with capture, arrow keys, home
 * and end. It is the one control on the console that is continuous rather than
 * discrete, which is why it gets a native range role instead of the intent
 * stream.
 */
export function VolumeSlider({
  value,
  onChange,
}: {
  /** 0 to 1. */
  value: number
  onChange: (next: number) => void
}) {
  const track = useRef<HTMLDivElement>(null)

  const setFromClientX = useCallback(
    (clientX: number) => {
      const el = track.current
      if (!el) return
      const box = el.getBoundingClientRect()
      // The knob's centre follows the pointer, so the grab point does not jump.
      const half = (KNOB_W / 2 / TRACK_W) * box.width
      const usable = box.width - half * 2
      const next = (clientX - box.left - half) / usable
      onChange(Math.min(1, Math.max(0, next)))
    },
    [onChange],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      setFromClientX(e.clientX)
    },
    [setFromClientX],
  )

  /**
   * Hand focus back after a drag, so the knob does not keep the arrow keys.
   *
   * Turning the volume with a mouse is not a request to navigate with it. The
   * console's arrows step aside for whatever holds focus, so a knob that keeps
   * focus after a click keeps the D-pad pointed at itself, invisibly, until the
   * player clicks something else.
   *
   * A player who TABBED here still has focus and still gets arrow control,
   * which is the case the slider role exists for.
   */
  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.blur()
  }, [])

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.buttons === 0) return
      setFromClientX(e.clientX)
    },
    [setFromClientX],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 0.2 : 0.05
      const moves: Record<string, number> = {
        ArrowRight: step,
        ArrowUp: step,
        ArrowLeft: -step,
        ArrowDown: -step,
      }
      if (e.key in moves) {
        // NO stopPropagation. It used to be here and it was the single line
        // that broke the console: the input store listens on `window`, which a
        // bubbling stop never reaches, so one click on this knob killed the
        // D-pad. The store now listens in the capture phase and steps aside for
        // `role="slider"` on its own, which is the same outcome decided in one
        // place instead of by whoever happens to handle the event first.
        e.preventDefault()
        onChange(Math.min(1, Math.max(0, value + moves[e.key])))
        return
      }
      if (e.key === 'Home') {
        e.preventDefault()
        onChange(0)
      }
      if (e.key === 'End') {
        e.preventDefault()
        onChange(1)
      }
    },
    [onChange, value],
  )

  const percent = Math.round(value * 100)

  return (
    <div className="vol">
      <div
        ref={track}
        className="vol-track"
        role="slider"
        tabIndex={0}
        aria-label="Volume"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${percent} percent`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div className="vol-knob" style={{ left: value * TRAVEL }} />
      </div>
      <span className="vol-cap">VOL {String(percent).padStart(3, ' ')}</span>
    </div>
  )
}
