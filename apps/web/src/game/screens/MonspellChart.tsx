import { useEffect, useRef, useState } from 'react'
import { PixelText, Sprite } from '../../ui'
import { approachPriceY, roundWindow, WINDOW_HALF } from '../monspell'
import type { CharacterId } from '../../config/brand'
import type { SpriteAnimation } from '../../ui'

/**
 * MONSPELL's money shot: the Monanimal IS the price.
 *
 * The character stands on the price line, exactly as S7's PriceField does,
 * and the price is read live from Liquidity Book. The poll ticks once a
 * second; the CHARACTER does not wait for it. A requestAnimationFrame loop
 * glides the sprite toward each new reading (`approachPriceY`), so the climb
 * and fall are smooth at the display's frame rate rather than snapping to
 * once-a-second steps. Price up means the character climbs; price down means
 * it sinks. There is no number to read to know where MON is, only the monster.
 *
 * THE JAIL LINE
 *
 * A round draws one dashed line, above the character for an UP call and below
 * for a DOWN call: the price the monster must climb past to escape. It is a
 * VISUAL, not a rule — the win still comes from decideRound — but it is what
 * turns "guess a direction" into "watch the monster break out". The window
 * it is drawn in is frozen at round start (`window`), so the line stays put
 * while the price moves; a line that slid with the market could never be
 * crossed.
 */

/** Vertical span the price can occupy, in px. A multiple of 4. */
const FIELD_HEIGHT = 168

/** The field's width in the SVG's own coordinate space. */
const FIELD_WIDTH = 480

/**
 * How many readings the trace remembers.
 *
 * The route polls every 300ms, so 100 samples is the last thirty seconds —
 * comfortably longer than a ten second round, which means the whole round is
 * always visible behind the monster, plus enough lead-in to see what the price
 * was doing before the player called it.
 *
 * Capped rather than unbounded because this array is rebuilt on every reading
 * and rendered as an SVG path: a session left open for an hour would otherwise
 * grow a twelve thousand point polyline that is redrawn three times a second.
 */
const HISTORY_CAP = 100

/**
 * Keep a drawn point inside the field.
 *
 * The window is FROZEN at round start, so a price that runs past its edge maps
 * to a y outside the field and the trace would draw over the header or off the
 * bottom of the screen. Clamping keeps it on the glass and, usefully, makes a
 * runaway price read as a line pinned to the top — which is exactly what it is.
 */
function clampY(y: number): number {
  return Math.max(1, Math.min(FIELD_HEIGHT - 1, y))
}

/** The vertical midpoint the price starts at, so an early flat price parks
 *  the character mid-field rather than pinned to an edge. */
const MID = FIELD_HEIGHT / 2

/** The fraction of the field height the price range occupies. Leaves headroom
 *  so the jail line is never glued to the very top or bottom edge. */
const PLOT_FRACTION = 0.8

export interface MonspellChartProps {
  characterId: CharacterId
  /** The latest live reading. `null` before the first poll answers. */
  priceUsd: number | null
  /** True while the round window is open, which changes the animation. */
  running: boolean
  /** The last movement direction, for the sprite's pose. */
  lastDirection: 'up' | 'down' | 'flat'
  /** The fixed price window the round is drawn in. Frozen at round start. */
  window: { low: number; high: number } | null
  /** The jail line's price, or null while picking. */
  jailLine: number | null
}

/**
 * The vertical pixel position a price maps to within the field.
 *
 * Exported for the mapping test: with a FIXED window, a higher price must map
 * to a higher position (smaller y), which is the whole "the monster climbs
 * when the market climbs" promise.
 *
 * Centred on the window's midpoint: the middle price of the window sits at
 * the field's middle, and the window's edges sit an equal distance above and
 * below it. An earlier version mapped `(high - price) / span` against the
 * field height directly, which put the window's midpoint below the field's
 * centre and pushed the low edge off the bottom.
 */
export function yForPrice(
  priceUsd: number,
  window: { low: number; high: number },
) {
  const centre = (window.low + window.high) / 2
  const halfSpan = (window.high - window.low) / 2 || 1
  // Higher price is higher up the field, so it is a smaller y. The full
  // price range maps to PLOT_FRACTION of the field height, centred.
  return (
    MID -
    ((priceUsd - centre) / halfSpan) * ((FIELD_HEIGHT * PLOT_FRACTION) / 2)
  )
}

export function MonspellChart({
  characterId,
  priceUsd,
  running,
  lastDirection,
  window: win,
  jailLine,
}: MonspellChartProps) {
  // The rendered y. Starts at the field middle and glides from there, so the
  // first live reading approaches rather than teleports.
  const [y, setY] = useState(MID)
  const targetRef = useRef(MID)

  // The window used while picking. It is anchored to the FIRST price seen and
  // then held, so the character visibly moves with the market instead of
  // staying glued to mid-field: a window re-centred on every tick would map
  // the current price to the middle of the field every time. A round passes
  // its own frozen window down (`win`), which replaces this one.
  const anchoredRef = useRef<{ low: number; high: number } | null>(null)

  /**
   * Every reading the screen has seen, oldest first. The actual chart.
   *
   * State rather than a ref, because the trace has to redraw when it changes;
   * the character's glide is a ref precisely because it must NOT trigger a
   * render on every animation frame. The two are different jobs and they get
   * different tools.
   *
   * Readings are appended on VALUE CHANGE, not on every poll: Pyth republishes
   * a few times a minute while the route polls three times a second, so most
   * responses repeat the previous number. Appending those would fill the whole
   * window with a flat line made of duplicates and push the real movement off
   * the left edge in ten seconds.
   */
  const [history, setHistory] = useState<Array<number>>([])

  useEffect(() => {
    if (priceUsd === null) return
    setHistory((current) => {
      if (current.length > 0 && current[current.length - 1] === priceUsd) {
        return current
      }
      const next = [...current, priceUsd]
      return next.length > HISTORY_CAP ? next.slice(-HISTORY_CAP) : next
    })
  }, [priceUsd])

  // Re-target whenever a new reading lands. The pose is driven by the parent
  // (`lastDirection`), not recomputed here, so this effect only re-aims.
  useEffect(() => {
    if (priceUsd === null) return
    if (anchoredRef.current === null) {
      // Same tight window as a round (±WINDOW_HALF), so the monster's pick
      // phase movement is as visible as its round movement. One window rule.
      anchoredRef.current = roundWindow(priceUsd, WINDOW_HALF)
    }
    const bounds = win ?? anchoredRef.current
    targetRef.current = yForPrice(priceUsd, bounds)
  }, [priceUsd, win])

  // The smooth loop. Runs continuously; it is cheap (one lerp per frame) and
  // stops being observable the moment the sprite arrives, but a running rAF
  // that never cancels is a battery leak, so it cancels on unmount only.
  useEffect(() => {
    let frame = 0
    const loop = () => {
      setY((current) => approachPriceY(current, targetRef.current))
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [])

  // The pose follows the last real move, not the interpolated one. A glide
  // between two flat readings is still a glide; only a real price move earns
  // the character a change of posture.
  const animation: SpriteAnimation =
    lastDirection === 'up' ? 'run' : lastDirection === 'down' ? 'idle' : 'idle'

  // Same window the effect uses: the frozen round window during a round, the
  // anchored pick window otherwise, never a window re-centred on this tick.
  const bounds =
    win ??
    anchoredRef.current ??
    (priceUsd ? roundWindow(priceUsd, WINDOW_HALF) : null)
  const jailY =
    jailLine !== null && bounds !== null ? yForPrice(jailLine, bounds) : null

  /**
   * The trace, as SVG points.
   *
   * Newest on the RIGHT, which is the direction every price chart in the world
   * reads, and it is why the character stands on the right-hand end rather than
   * in the middle: the monster is the latest point of its own chart.
   *
   * X is by SAMPLE INDEX, not by timestamp. The poll is a fixed interval, so
   * the two are the same shape, and index spacing keeps the line evenly drawn
   * when a slow response would otherwise bunch two points together and imply a
   * volatility that did not happen.
   */
  const points =
    bounds === null || history.length < 2
      ? null
      : history
          .map((sample, index) => {
            const x = (index / (history.length - 1)) * FIELD_WIDTH
            return `${x.toFixed(1)},${clampY(yForPrice(sample, bounds)).toFixed(1)}`
          })
          .join(' ')

  return (
    <div className="relative w-full" style={{ height: FIELD_HEIGHT }}>
      <svg
        className="absolute inset-0"
        width="100%"
        height={FIELD_HEIGHT}
        viewBox={`0 0 480 ${FIELD_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="MON price, shown by the character's height"
      >
        {/* The jail line: what the monster must climb past to escape. Drawn
            first so the price hairline and the character sit on top of it. */}
        {jailY !== null ? (
          <line
            x1={0}
            x2={480}
            y1={jailY}
            y2={jailY}
            stroke="var(--color-accent)"
            strokeWidth={2}
            strokeDasharray="4 4"
            shapeRendering="crispEdges"
          />
        ) : null}

        {/* THE CHART. Where the price has actually been, not just where it is.
            Drawn under the hairline and the character so both stay readable
            over it, and with no fill: an area chart implies a baseline of zero
            and this window does not start at zero. */}
        {points !== null ? (
          <polyline
            points={points}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        {/* A hairline where the price currently is, so the character's feet are
            not the only place the number lives. */}
        <line
          x1={0}
          x2={480}
          y1={y}
          y2={y}
          stroke="var(--color-ink-dim)"
          strokeWidth={1}
          strokeDasharray="2 4"
          shapeRendering="crispEdges"
        />
      </svg>

      {/* The character stands on the NEWEST end of its own chart.

          It used to stand at the centre, which was right when there was no
          trace to stand on and wrong the moment there was: the line ran to the
          right edge and the monster hovered halfway along it, attached to
          nothing. Anchored right, the sprite is the leading point of the line.
          Inset by a sprite half-width so it is not clipped by the frame. */}
      <div
        className="absolute"
        style={{
          top: y,
          right: 24,
          transform: 'translate(50%, -100%)',
        }}
      >
        <Sprite character={characterId} animation={animation} size={64} />
      </div>

      {/* A plain number for the judge who needs it, and the monster for the
          one who does not. */}
      <div className="absolute left-2 top-0 flex flex-col gap-1">
        <PixelText role="micro" tone="dim" upper>
          MON price
        </PixelText>
        <PixelText role="value" className="tabular-nums">
          {priceUsd === null ? '.....' : `$${priceUsd.toFixed(5)}`}
        </PixelText>
      </div>

      {/* LEFT, because the character now stands on the right end of the trace
          and a label there would sit on top of it whenever the price is near
          its own jail line — which is precisely the moment the round is worth
          watching. */}
      {jailLine !== null ? (
        <div
          className="absolute left-2"
          style={{ top: jailY ?? 0, transform: 'translateY(-100%)' }}
        >
          <PixelText role="micro" tone={running ? 'gain' : 'ink'} upper>
            {running ? 'escape' : 'target'}
          </PixelText>
        </div>
      ) : null}

      {running ? (
        <PixelText
          role="micro"
          tone="dim"
          className="absolute right-2 top-0"
          upper
        >
          live
        </PixelText>
      ) : null}
    </div>
  )
}
