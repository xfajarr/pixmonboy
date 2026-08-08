import { PixelText } from './text'
import type { ReactNode } from 'react'

/**
 * The selected row.
 *
 * There is no cursor glyph in Daylight. Selection is a solid accent fill with
 * white text: bold, obvious, cheerful, and 4.8:1. A glyph would be a second
 * thing to align on the 4px grid for no gain.
 *
 * The cursor TELEPORTS. No transition, ever. Animating cursor movement is the
 * single most common way a retro UI ends up feeling slow: it looks charming in
 * a GIF and it is unbearable on the two hundredth press.
 */
export function Row({
  selected = false,
  disabled = false,
  onSelect,
  children,
}: {
  selected?: boolean
  disabled?: boolean
  onSelect?: () => void
  children: ReactNode
}) {
  const tone = disabled
    ? 'bg-sunk text-ink-dim'
    : selected
      ? 'bg-accent text-ink-invert'
      : 'bg-panel text-ink'

  return (
    <div
      role="option"
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onSelect}
      className={`font-pixel text-body flex items-center gap-2 px-2 py-1 ${tone}`}
    >
      {children}
    </div>
  )
}

/** A list of Rows. Owns the aria plumbing so no screen has to think about it. */
export function List({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div role="listbox" aria-label={label} className="flex flex-col">
      {children}
    </div>
  )
}

/**
 * Tabs. The active tab loses its bottom border and joins the panel below it,
 * which is the oldest and clearest way to show that a tab owns a body.
 */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: ReadonlyArray<{ id: T; label: string }>
  active: T
  onChange?: (id: T) => void
}) {
  return (
    <div role="tablist" className="-mb-px flex gap-1">
      {tabs.map((tab) => {
        const on = tab.id === active
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange?.(tab.id)}
            className={`border-edge pressable border px-2 py-1 ${
              on ? 'bg-panel border-b-panel' : 'bg-sunk'
            }`}
          >
            <PixelText role="micro" tone={on ? 'ink' : 'dim'} upper>
              {tab.label}
            </PixelText>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Toggle. Filled or empty, PLUS a glyph.
 *
 * The glyph is not decoration. Shape carries meaning and colour is the second
 * signal, never the only one.
 */
export function Toggle({
  on,
  label,
  onChange,
}: {
  on: boolean
  label: string
  onChange?: (next: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange?.(!on)}
      className="pressable flex items-center gap-2"
    >
      <span
        className={`border-edge grid h-4 w-4 place-items-center border ${
          on ? 'bg-accent' : 'bg-sunk'
        }`}
      >
        <PixelText role="micro" tone={on ? 'invert' : 'dim'}>
          {on ? 'X' : ''}
        </PixelText>
      </span>
      <PixelText role="body" upper>
        {label}
      </PixelText>
    </button>
  )
}
