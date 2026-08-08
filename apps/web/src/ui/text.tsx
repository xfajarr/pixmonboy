import type { ReactNode } from 'react'

/**
 * The five type roles. Nothing else exists.
 *
 * Never 12px, never 20px, never 24px. A bitmap font at a non-integer multiple
 * resamples and the illusion dies in a way people feel without being able to
 * name it.
 */
const ROLE = {
  micro: 'text-micro',
  body: 'text-body',
  value: 'text-value',
  title: 'text-title',
  hero: 'text-hero',
} as const

const TONE = {
  ink: 'text-ink',
  dim: 'text-ink-dim',
  invert: 'text-ink-invert',
  gain: 'text-gain',
  loss: 'text-loss',
} as const

export type TextRole = keyof typeof ROLE
export type TextTone = keyof typeof TONE

export function PixelText({
  as: Tag = 'span',
  role = 'body',
  tone = 'ink',
  upper = false,
  className = '',
  children,
}: {
  as?: 'span' | 'p' | 'h1' | 'h2' | 'div' | 'dt' | 'dd'
  role?: TextRole
  tone?: TextTone
  upper?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <Tag
      className={`font-pixel ${ROLE[role]} ${TONE[tone]} ${
        upper ? 'uppercase' : ''
      } ${className}`}
    >
      {children}
    </Tag>
  )
}

/**
 * A number that changes.
 *
 * Two rules, both load bearing:
 *
 * 1. TABULAR. Every glyph is the same width, so a ticking value never shifts
 *    the layout under it. On the live screen almost every number is ticking.
 * 2. SHAPE BEFORE COLOUR. The sign is a glyph, not a hue. Colour is the second
 *    signal, never the only one, so the screen survives a photograph, a
 *    projector, and colour blindness without special cases.
 */
export function Value({
  amount,
  prefix = '',
  suffix = '',
  signed = false,
  decimals = 0,
  role = 'value',
  tone,
  className = '',
}: {
  amount: number
  prefix?: string
  suffix?: string
  /** Renders + or - and colours gain or loss. */
  signed?: boolean
  decimals?: number
  role?: TextRole
  /**
   * Overrides the tone `signed` would derive.
   *
   * It exists for one number: DAMAGE. Damage is stored positive and is never a
   * gain, so `signed` would render it as a green +$0.00 at the start of every
   * session, and dropping `signed` to fix the glyph would drop the loss colour
   * with it. The screen states the meaning; this lets it.
   */
  tone?: TextTone
  className?: string
}) {
  const magnitude = Math.abs(amount).toFixed(decimals)
  const sign = signed ? (amount < 0 ? '-' : '+') : ''
  const derived: TextTone = signed ? (amount < 0 ? 'loss' : 'gain') : 'ink'

  return (
    <PixelText
      role={role}
      tone={tone ?? derived}
      className={`tabular-nums ${className}`}
    >
      {sign}
      {prefix}
      {magnitude}
      {suffix}
    </PixelText>
  )
}

/** A label above a value. The most repeated pattern in the whole product. */
export function Stat({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <PixelText role="micro" tone="dim" upper>
        {label}
      </PixelText>
      {children}
    </div>
  )
}
