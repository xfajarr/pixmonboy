import { PixelText } from './text'
import type { ReactNode } from 'react'

/**
 * Panel.
 *
 * Hard 1px black border on a light field reads as moulded plastic, and the
 * offset shadow makes it a sticker rather than glass. That single pair of
 * properties is most of the Daylight system.
 *
 * There is no Bevel component. In a dark system a bevel does this job; on a
 * light field the border plus the offset does it better and with one fewer
 * concept.
 */
export function Panel({
  children,
  className = '',
  flush = false,
}: {
  children: ReactNode
  className?: string
  /** No padding, for panels that hold a list of full-bleed rows. */
  flush?: boolean
}) {
  return (
    <div
      className={`border-edge bg-panel shadow-hard border ${
        flush ? '' : 'p-3'
      } ${className}`}
    >
      {children}
    </div>
  )
}

/** A well. Inset rather than raised, for fields and empty tracks. */
export function Sunk({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`border-edge bg-sunk border p-2 ${className}`}>
      {children}
    </div>
  )
}

/**
 * Dialog. A Panel with a portrait slot.
 *
 * The portrait sits OUTSIDE any selection fill, in its own panel cell. A sprite
 * is never drawn on an accent fill, because the cast and the interface accent
 * are the same purple. DESIGN-SYSTEM.md 4.5.
 */
export function Dialog({
  portrait,
  speaker,
  children,
}: {
  portrait?: ReactNode
  speaker?: string
  children: ReactNode
}) {
  return (
    <Panel className="flex gap-3">
      {portrait ? (
        <div className="border-edge bg-panel grid h-16 w-16 shrink-0 place-items-center border">
          {portrait}
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        {speaker ? (
          <PixelText role="micro" tone="dim" upper>
            {speaker}
          </PixelText>
        ) : null}
        <PixelText role="body">{children}</PixelText>
      </div>
    </Panel>
  )
}

/**
 * Field. An inset well with a blinking block caret.
 *
 * Not an <input>. The console has no soft keyboard and no mouse; text entry is
 * driven by the D-pad, so this renders a value and a caret and the screen owns
 * the editing. The only text a user ever types here is a 12 character disk
 * name.
 */
export function Field({
  value,
  focused = false,
  placeholder = '',
  maxLength,
}: {
  value: string
  focused?: boolean
  placeholder?: string
  maxLength?: number
}) {
  const shown = value || placeholder
  const empty = value.length === 0

  return (
    <div className="border-edge bg-sunk flex items-center gap-1 border px-2 py-1">
      <PixelText
        role="value"
        tone={empty ? 'dim' : 'ink'}
        className="tabular-nums"
      >
        {shown}
      </PixelText>
      {focused ? (
        <span
          className="bg-ink inline-block h-4 w-2 motion-safe:animate-[caret_1s_steps(2,end)_infinite]"
          aria-hidden="true"
        />
      ) : null}
      {maxLength ? (
        <PixelText role="micro" tone="dim" className="ml-auto tabular-nums">
          {value.length}/{maxLength}
        </PixelText>
      ) : null}
    </div>
  )
}

/**
 * The CRT layer. Default OFF.
 *
 * At 8px type, scanlines eat one row in four from every glyph and legibility
 * drops more than the charm gains. It is a player choice in options, which is
 * also how real emulators handle it.
 */
export function Scanlines({ on = false }: { on?: boolean }) {
  if (!on) return null
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0"
      style={{
        background:
          'repeating-linear-gradient(to bottom, transparent 0 3px, rgba(14,9,28,.14) 3px 4px)',
      }}
    />
  )
}
