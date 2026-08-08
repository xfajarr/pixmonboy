import { PixelText } from './text'

/** Frame order in every character sheet. Sheets are 512x64, 8 frames. */
export const FRAMES = [
  'idle-0',
  'idle-1',
  'run-0',
  'run-1',
  'jump',
  'sit',
  'alert',
  'happy',
] as const

export type FrameName = (typeof FRAMES)[number]
export type SpriteAnimation =
  'idle' | 'run' | 'jump' | 'sit' | 'alert' | 'happy'

const SIZE = 64

/**
 * Sprite.
 *
 * Frame stepping, never easing. A running Monanimal is two frames at 8fps,
 * which is a background-position animation and a steps() timing function. A
 * spring here would produce fractional positions by definition.
 *
 * The well is bg-panel, never bg-accent: the cast and the interface accent are
 * the same purple, so a sprite on a selection fill disappears into it.
 * DESIGN-SYSTEM.md 4.5.
 */
export function Sprite({
  character,
  animation = 'idle',
  scale = 1,
  size: rendered = SIZE,
  className = '',
}: {
  character: string
  animation?: SpriteAnimation
  /** Integer only. Anything else resamples the art. */
  scale?: 1 | 2 | 3
  /**
   * Rendered edge length. The sheet is authored at 64, and 32 is the only
   * other value allowed because it is an exact halving: four source pixels
   * collapse to one and the grid survives. 48 would land pixels between
   * columns and the art would shimmer as the sprite moves.
   *
   * Defaults to the authored size, so no existing caller changes.
   */
  size?: 32 | 64
  className?: string
}) {
  const size = rendered * scale
  const sheet = `/sprites/${character}-${SIZE}.png`

  // idle and run are two-frame loops. Everything else is a single frame.
  const PAIR: Partial<Record<SpriteAnimation, number>> = { idle: 0, run: 2 }
  const STILL: Record<string, number> = { jump: 4, sit: 5, alert: 6, happy: 7 }

  const pairStart = PAIR[animation]
  const looping = pairStart !== undefined
  const frame = looping ? pairStart : STILL[animation]

  return (
    <span
      role="img"
      aria-label={`${character} ${animation}`}
      className={`inline-block ${looping ? 'sprite-pair' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        backgroundImage: `url(${sheet})`,
        backgroundSize: `${FRAMES.length * size}px ${size}px`,
        backgroundPosition: `${-frame * size}px 0`,
        // steps(2) walks exactly two frames and never lands between them.
        ['--sprite-from' as string]: `${-frame * size}px`,
        ['--sprite-to' as string]: `${-(frame + 2) * size}px`,
      }}
    />
  )
}

/**
 * Marquee. Linear, for a warning that does not fit.
 *
 * Linear because any easing on a continuous scroll produces a visible pulse,
 * and a pulsing warning reads as a rendering bug rather than as urgency.
 */
export function Marquee({
  children,
  seconds = 8,
}: {
  children: string
  seconds?: number
}) {
  return (
    <div className="overflow-hidden whitespace-nowrap">
      <span
        className="inline-block motion-safe:animate-[marquee_var(--marquee-dur)_linear_infinite]"
        style={{ ['--marquee-dur' as string]: `${seconds}s` }}
      >
        <PixelText role="body" upper>
          {children}
        </PixelText>
      </span>
    </div>
  )
}
