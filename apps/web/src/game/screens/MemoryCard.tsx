import { useState } from 'react'
import { useConsoleIntent } from '../../console/useConsoleInput'
import { brand } from '../../config/brand'
import { PixelText } from '../../ui'

export interface MemoryCardProps {
  /** Non-null once a card is already in the slot. A returning player. */
  cardAddress: string | null
  onInsert: () => void
  onBack: () => void
}

/**
 * The two ways in.
 *
 * Both land on the same fixture card today, which is why `onInsert` takes no
 * argument: the screen must not pretend to know which method was used when
 * neither one has actually run. Both rows exist anyway because the SHAPE is
 * what Phase 3 keeps. When Privy lands (INTEGRATIONS.md section 5) the route
 * swaps `onInsert` and this file does not change.
 */
const METHODS = ['Continue with Google', 'Use an email'] as const

/**
 * Stated as facts, never as marketing. No exclamation marks, nothing sold.
 *
 * "no seed phrase" is the one place the forbidden vocabulary is allowed, and
 * it earns the exception by being a removal rather than a demand. The words
 * "wallet", "connect", and "gas" appear nowhere on this screen, and a test
 * fails if they ever do.
 */
const REASSURANCES = ['no seed phrase', 'no extension', 'free'] as const

/**
 * `0x7a2b...3c3f` becomes `0x7a..3f`. Middle truncation, never a prefix: the
 * trailing characters are the half a person uses to tell two apart.
 */
function shortAddress(address: string): string {
  return `${address.slice(0, 4)}..${address.slice(-2)}`
}

/**
 * S1. SCREEN-DETAIL.md section 4 calls it the most important screen in the
 * product, because it is where the intimidated person historically leaves.
 *
 * The whole design rule is a vocabulary rule. Privy mints an embedded wallet
 * from a Google login, and the words "wallet", "connect", "seed phrase" and
 * "gas" appear nowhere: what the player sees is a memory card going into a
 * slot, which is a thing anyone who has held a handheld already understands.
 * The metaphor is not decoration here, it is the entire onboarding.
 *
 * HEIGHT BUDGET (root is p-2, tokens.css line heights, `--spacing: 4px`):
 *   root padding (p-2)                            16
 *   card art (flex-1, floor 96)                   96
 *   gap-1                                          4
 *   headline (title, 24) + line (micro, 12)       36
 *   gap-1                                          4
 *   two method rows (28 each) + gap                60
 *   gap-1                                          4
 *   reassurance row (micro)                       12
 *   ----------------------------------------------
 *   at rest                                      232
 *
 * The card art is `flex-1` and takes the remainder rather than a fixed height.
 * S6 shipped a missing footer twice on a hand-summed budget, because
 * `overflow: hidden` on the viewport does not warn and jsdom performs no
 * layout, so the arithmetic above is the only check and arithmetic against a
 * token is a guess about how a font renders. Making the one block whose exact
 * height carries no information absorb the slack removes the guess, and it
 * also answers the other standing complaint: a correct screen with empty space
 * reads as unfinished, and this screen is mostly air in the wireframe.
 */
export function MemoryCard({ cardAddress, onInsert, onBack }: MemoryCardProps) {
  const [index, setIndex] = useState(0)
  const inserted = cardAddress !== null

  useConsoleIntent((intent) => {
    if (intent === 'B') {
      onBack()
      return
    }
    if (intent === 'A') {
      onInsert()
      return
    }
    if (intent === 'UP' || intent === 'DOWN') {
      // No wrap, same rule as every other cursor in this build.
      const next = intent === 'DOWN' ? index + 1 : index - 1
      if (next >= 0 && next < METHODS.length) setIndex(next)
    }
  })

  return (
    <div className="bg-screen flex h-full w-full flex-col gap-1 p-2">
      <CardArt inserted={inserted} />

      <div className="flex flex-col items-center">
        <div className="flex items-baseline gap-2">
          <PixelText role="title" upper>
            {inserted
              ? `${brand.WALLET_UNIT} in`
              : `Insert ${brand.WALLET_UNIT}`}
          </PixelText>
          {/* Eight pixels of honesty, the same marker S6 carries. Privy is
              not wired (INTEGRATIONS.md section 5), so both rows below land on
              a committed fixture card. Nobody watching a demo should believe a
              Google login just happened, and a screen that lets them is the
              kind of thing a peer judge checks. */}
          <PixelText role="micro" tone="dim" upper>
            Fixture
          </PixelText>
        </div>
        <PixelText role="micro" tone="dim">
          {inserted
            ? `saved on card ${shortAddress(cardAddress)}`
            : 'your progress is saved on the card'}
        </PixelText>
      </div>

      <div className="flex flex-col gap-1">
        {METHODS.map((method, i) => (
          <MethodRow
            key={method}
            label={
              // A returning player is not signing in again, they are carrying
              // on. Same control, same callback, honest label.
              inserted && i === 0 ? 'Continue' : method
            }
            focused={i === index}
            // The second method is noise once a card is already in the slot:
            // it would offer a second way to do a thing that is already done.
            hidden={inserted && i === 1}
            onSelect={() => {
              setIndex(i)
              onInsert()
            }}
          />
        ))}
      </div>

      <div className="flex items-center justify-center gap-4">
        {REASSURANCES.map((fact) => (
          <span key={fact} className="flex items-center gap-1">
            {/* A CSS square, not a glyph. The wireframe's bullet is not in
                Departure Mono's 1079 codepoints and would render as tofu. */}
            <span
              aria-hidden="true"
              className="border-edge bg-panel inline-block h-2 w-2 border"
            />
            <PixelText role="micro" tone="dim" upper>
              {fact}
            </PixelText>
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * The card, drawn as an object rather than described as one.
 *
 * It is the largest thing on the screen because it is the thing the screen is
 * named after, and because the standing review note on this build is that a
 * correct screen with empty space reads as unfinished.
 *
 * The slide-in is two nested elements, never one. `transform` is a single
 * property, so an animation on the element that is also centred by a transform
 * replaces the centring and the card arrives from the wrong place. That is a
 * logged bug in this repo. The outer element owns position, the inner owns
 * motion, and `motion-reduce` parks the inner one in its resting frame.
 */
function CardArt({ inserted }: { inserted: boolean }) {
  return (
    <div
      className="border-edge bg-sunk relative flex min-h-0 flex-1 items-center justify-center overflow-hidden border"
      style={{ minHeight: 96 }}
    >
      {/* The slot the card goes into. A hard edge, so the card reads as
          entering something rather than floating on a field. */}
      <div
        className="bg-ink absolute inset-x-0 bottom-0 h-1"
        aria-hidden="true"
      />

      <div className="card-insert">
        <div
          className="border-edge bg-panel shadow-hard flex items-center gap-2 border-2 px-3 py-2"
          role="img"
          aria-label={
            inserted
              ? `${brand.WALLET_UNIT} inserted`
              : `${brand.WALLET_UNIT} ready to insert`
          }
        >
          {/* The contact pads. Four bars is the detail that makes the
              rectangle read as a cartridge-era memory card instead of a box. */}
          <span className="flex gap-1" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="bg-accent h-6 w-1" />
            ))}
          </span>
          <div className="flex flex-col">
            <PixelText role="body" upper>
              {brand.WALLET_UNIT}
            </PixelText>
            <PixelText role="micro" tone="dim" upper>
              {brand.CONSOLE_NAME}
            </PixelText>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * One sign-in row.
 *
 * `Row` from ui/select.tsx is the obvious reuse and does not fit: it is a
 * `role="option"` list item and these two are buttons, not a listbox, because
 * choosing one performs the action rather than selecting a value.
 */
function MethodRow({
  label,
  focused,
  hidden,
  onSelect,
}: {
  label: string
  focused: boolean
  hidden: boolean
  onSelect: () => void
}) {
  if (hidden) return null

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={focused ? 'true' : undefined}
      className={`pressable border-edge flex items-center gap-2 border px-2 py-1 ${
        focused ? 'bg-accent' : 'bg-panel'
      }`}
    >
      {/* Renders nothing when inactive, so an unfocused row sits flush left
          and the focused one steps forward to meet its cursor. The movement is
          the second focus signal alongside the fill. */}
      {focused ? (
        <span aria-hidden="true" className="bg-ink-invert h-4 w-1 shrink-0" />
      ) : null}
      <PixelText role="body" tone={focused ? 'invert' : 'ink'} upper>
        {label}
      </PixelText>
    </button>
  )
}
