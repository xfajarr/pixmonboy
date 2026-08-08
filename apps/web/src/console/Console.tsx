import { useEffect, useRef, useState } from 'react'
import { ActionButtons, DPad, Speaker, StartSelect } from './Controls'
import { VolumeSlider } from './VolumeSlider'
import { setSoundVolume } from './sound'
import { useBackgroundMusic } from './useBackgroundMusic'
import { useFitScale } from './useFitScale'
import { ConsoleInputProvider } from './useConsoleInput'
import type { ReactNode, RefObject } from 'react'

/**
 * The console.
 *
 * ARCHITECTURE.md section 3, the one boundary that matters:
 *
 *   src/console/ must never know that this application is about money.
 *
 * It renders a shell, scales a screen, and emits input intents. That is all.
 * Enforced by lint, and it is what makes the metaphor honest rather than
 * decoration painted over a DeFi app.
 */

/**
 * The Monad logomark, stamped into the shell.
 *
 * Drawn as one path with an evenodd hole rather than two shapes, so the void
 * is genuinely a void and the plastic reads as moulded around it.
 *
 * The geometry is four cubics between the four extreme points, with the
 * control points pulled 35% of the way toward each corner. That constant is
 * the whole character of the shape: at 55% it becomes a circle and at 0% a
 * hard diamond. The previous path was a hand-fitted approximation whose two
 * halves were not symmetric, which is visible the moment it renders above 24px.
 */
function MonadMark() {
  return (
    <span className="mark" aria-hidden="true">
      <svg viewBox="0 0 100 100" fill="none">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M50 4C66 4 96 34 96 50C96 66 66 96 50 96C34 96 4 66 4 50C4 34 34 4 50 4ZM50 33C56 33 67 44 67 50C67 56 56 67 50 67C44 67 33 56 33 50C33 44 44 33 50 33Z"
          fill="#DDD7FE"
        />
      </svg>
    </span>
  )
}

/**
 * Shouts when a screen is taller than 320 and is being silently clipped.
 *
 * The viewport is `overflow: hidden` at exactly 480x320, which is the right
 * behaviour for a console and the wrong one for finding a bug: a screen that
 * overruns loses its footer with no error, no warning, and no visible seam.
 * Worse, jsdom performs no layout, so not one test in this repo can fail on
 * it. Both screens built in this pass overran on the first draft and the only
 * thing that caught it was counting line heights by hand.
 *
 * Dev only, and deliberately a console warning rather than a rendered banner:
 * a banner would itself take screen height and change the thing it measures.
 */
function useOverflowWarning(viewport: RefObject<HTMLDivElement | null>) {
  /**
   * The last overrun reported, so one clipped screen warns ONCE.
   *
   * This hook had no dependency array, which means it re-ran on every render
   * and scheduled a fresh `requestAnimationFrame` and a fresh
   * `document.fonts.ready` callback each time. On a screen that genuinely
   * overruns, every warning is itself printed during a render cycle that
   * schedules the next check: the result was measured at roughly 250 warnings
   * per second, which floods the dev server's log pipe, saturates the main
   * thread, and eventually kills the process with an out-of-memory.
   *
   * The symptom is NOT "a noisy console". It is a dev session where buttons
   * stop responding and sounds stop playing, because nothing else gets a turn.
   * The production build was always fine, which is exactly what made it
   * confusing to diagnose.
   */
  const reported = useRef<number | null>(null)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const el = viewport.current
    if (!el) return

    // After paint and after the webfont swap, because a bitmap face resolving
    // late changes every line box on the screen.
    const check = () => {
      const over = el.scrollHeight - el.clientHeight
      if (over <= 0) {
        reported.current = null
        return
      }
      // Same overrun as last time is the same bug, already reported.
      if (reported.current === over) return
      reported.current = over
      console.warn(
        `[viewport] screen overruns by ${over}px and is being clipped. ` +
          `The 480x320 box is fixed; something above the footer has to give.`,
      )
    }

    const frame = requestAnimationFrame(check)
    void document.fonts.ready.then(check)
    return () => cancelAnimationFrame(frame)
    // Runs on mount and whenever the ROUTE swaps the screen underneath, which
    // is what `children` changing means here. Never on every render.
  }, [viewport])
}

/** Landscape on a short viewport makes the console unreadably small. */
function useNeedsRotate(): boolean {
  const [needs, setNeeds] = useState(false)

  useEffect(() => {
    const check = () => {
      const landscape = window.innerWidth > window.innerHeight
      setNeeds(landscape && window.innerHeight < 520)
    }
    check()
    window.addEventListener('resize', check)
    window.addEventListener('orientationchange', check)
    return () => {
      window.removeEventListener('resize', check)
      window.removeEventListener('orientationchange', check)
    }
  }, [])

  return needs
}

export function Console({
  children,
  wordmark,
}: {
  /** The 480x320 screen contents. */
  children: ReactNode
  wordmark: string
}) {
  const stage = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const scale = useFitScale(stage, box)
  const [volume, setVolume] = useState(0.6)
  const needsRotate = useNeedsRotate()
  useOverflowWarning(viewport)
  useBackgroundMusic(volume)
  useEffect(() => setSoundVolume(volume), [volume])

  if (needsRotate) {
    return <div className="rotate-prompt">Rotate to portrait</div>
  }

  return (
    <ConsoleInputProvider>
      <div className="console-stage" ref={stage}>
        {/* translate before scale: the centring has to happen in the scaled
            frame, or a console at 0.6 would be centred on its unscaled size
            and sit off to one side. */}
        <div
          className="console"
          ref={box}
          style={{ transform: `translate(-50%, -50%) scale(${scale})` }}
        >
          <div className="lid">
            <i className="screw tl" />
            <i className="screw tr" />
            <i className="screw bl" />
            <i className="screw br" />
            <div className="bezel">
              {/* The ref is what makes useOverflowWarning able to fire at all.
                  Without it the hook bailed on `!el` and the 320px guard was
                  dead from the day it was written. */}
              <div className="viewport" ref={viewport}>
                {children}
              </div>
            </div>
            {/* NO WORDMARK HERE. It used to sit under the bezel, where it cost
                the lid a line of height and pushed the screen up into a band of
                plastic. The name belongs on the body of a handheld, next to the
                maker's mark, which is where every real one puts it. */}
          </div>

          <div className="hinge">
            <i className="cap" />
            <i className="bar" />
            <i className="cap" />
          </div>

          <div className="base">
            <i className="screw bl" />
            <i className="screw br" />

            <div className="toprow">
              <VolumeSlider value={volume} onChange={setVolume} />
              {/* The badge: maker's mark and product name as one lockup, the
                  way it is moulded on a real shell. Grouped rather than spaced
                  apart so the two read as one stamp instead of two decorations
                  that happen to share a row. */}
              <div className="badge">
                <MonadMark />
                <span className="wordmark">{wordmark}</span>
              </div>
              <i className="led" aria-hidden="true" />
            </div>

            <div className="deck">
              <DPad />
              <div className="mid">
                <Speaker />
                <StartSelect />
              </div>
              <ActionButtons />
            </div>

            {/* Which desk key is which console button. See console.css.
                SELECT and START were missing here, which is the exact bug
                console.css's own comment warns about: a screen says "SELECT
                MANUAL", the player has no idea SELECT is Shift, and presses
                nothing. Four keys now, not two. */}
            <p className="keyhint">
              <span>
                <b>Z</b> a button
              </span>
              <span>
                <b>X</b> b button
              </span>
              <span>
                <b>Shift</b> select
              </span>
              <span>
                <b>Enter</b> start
              </span>
              <span>
                <b>Arrows</b> d-pad
              </span>
            </p>
          </div>
        </div>
      </div>
    </ConsoleInputProvider>
  )
}
