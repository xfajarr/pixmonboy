import { useState } from 'react'
import { useConsoleIntent } from '../../console/useConsoleInput'
import { PixelText } from '../../ui'
import type { Cartridge } from '../fixtures'
import type { SaveDisk } from '../../types/domain'

/**
 * S3, the cartridge shelf. SCREEN-DETAIL.md section 6.
 *
 * A component, not a route, exactly like `Difficulty`: it takes the open
 * disk and the cartridge list plus two callbacks, and knows nothing about
 * `useSession` or `useNavigate`.
 */
export interface CartridgeSelectProps {
  /** Undefined is a render state, never a throw. Gate 2.4. */
  disk: SaveDisk | undefined
  cartridges: Array<Cartridge>
  onInsert: (cartridgeId: string) => void
  onBack: () => void
}

/**
 * HEIGHT BUDGET (root is p-2, tokens.css line heights, `--spacing: 4px`):
 *   root padding (p-2, 8 top + 8 bottom)        16
 *   header row (title, 24 line height)          24
 *   gap-1                                         4
 *   shelf row (flex-1, min 120; 176 at rest)    192
 *   gap-1                                         4
 *   tagline block (fixed h-10)                   40
 *   gap-1 (footer sits on `mt-auto`; this is
 *          the worst case minimum, not the max)   4
 *   footer row (micro, 12 line height)           12
 *   ---------------------------------------------
 *   total                                        296   (24px margin under 320)
 *
 * The shelf is FLEXIBLE, not fixed: it takes the remainder, floors at 120px,
 * and the numbers above are what it settles at when nothing else moves. The
 * shelf takes nearly two thirds of the budget on purpose. SCREEN-DETAIL.md
 * section 6: the two locked slots are not filler, they are the platform claim
 * made legible in one glance, and starving them to save pixels defeats the
 * point of drawing them at all.
 */
export function CartridgeSelect({
  disk,
  cartridges,
  onInsert,
  onBack,
}: CartridgeSelectProps) {
  const [index, setIndex] = useState(0)
  const current = cartridges[index]

  /** Shared by A and by a mouse click: move the cursor there, and insert only
   * if what's under it is real. A phone has no A button, so the click has to
   * carry both halves of the gesture in one tap. */
  function activate(i: number) {
    setIndex(i)
    // Bounds-checked on the INDEX. `noUncheckedIndexedAccess` is off in this
    // project, so `cartridges[i]` is typed as a Cartridge even when it is
    // undefined at runtime, and a truthiness guard on it reads as dead code
    // to the linter: the same reasoning stepPreset in SetRange.tsx carries.
    if (i < 0 || i >= cartridges.length) return
    if (!cartridges[i].locked) onInsert(cartridges[i].id)
  }

  useConsoleIntent((intent) => {
    if (intent === 'B') {
      onBack()
      return
    }
    if (intent === 'A') {
      if (index < cartridges.length && !current.locked) onInsert(current.id)
      return
    }
    if (intent === 'LEFT' || intent === 'RIGHT') {
      // No wrap: RIGHT at CART 03 or LEFT at CART 01 has nowhere honest to
      // go, the same rule Difficulty's tier row follows.
      const next = intent === 'RIGHT' ? index + 1 : index - 1
      if (next >= 0 && next < cartridges.length) setIndex(next)
    }
  })

  return (
    <div className="bg-screen flex h-full w-full flex-col gap-1 p-2">
      <div className="flex items-baseline justify-between">
        <PixelText role="title" upper>
          Select cartridge
        </PixelText>
        <PixelText role="micro" tone="dim" upper>
          {disk ? `Disk ${disk.diskId}: ${disk.name}` : 'No disk'}
        </PixelText>
      </div>

      {/* The shelf absorbs whatever the rest of the screen does not use.
          S6 shipped a missing footer twice on a hand-summed height budget, and
          the lesson generalises: overflow:hidden does not warn and jsdom does
          no layout, so arithmetic against a token is the only check and it is
          a guess about how a font renders. The shell art is the one thing here
          whose exact height carries no information, so it takes the remainder
          and the rows around it keep their natural size. `min-h-0` is load
          bearing: a flex item defaults to `min-height: auto` and will refuse
          to shrink below its content, which is how a flexible row overflows
          its parent anyway. */}
      <div className="flex min-h-0 flex-1 items-stretch gap-2">
        {cartridges.map((cart, i) => (
          <CartridgeShell
            key={cart.id}
            cartridge={cart}
            index={i}
            selected={i === index}
            onActivate={activate}
          />
        ))}
      </div>

      {/* Fixed height whichever cartridge has the cursor. A locked slot's
          `tagline` is null, and letting this block shrink for it would jump
          the shelf above every time the cursor crosses onto CART 02 or CART
          03. That shift is a real bug this repo has already shipped once. */}
      <div className="border-edge bg-sunk flex h-10 shrink-0 flex-col justify-center border p-1">
        <PixelText role="body">
          {current.tagline ?? 'locked. shipping in a later cartridge.'}
        </PixelText>
      </div>

      {/* Footer, pinned to the bottom edge whatever the content above it
          did. The console owns the key legend; this screen only names the
          button. ◄► and not ◀▶: Departure Mono maps 1079 codepoints and the
          pointing-triangle pair the wireframe uses is not among them. */}
      <div className="mt-auto flex items-center justify-between">
        <PixelText role="micro" upper>
          {'◄►'} Select
        </PixelText>
        <PixelText role="micro" upper>
          A Insert
        </PixelText>
        <PixelText role="micro" upper>
          B Back
        </PixelText>
      </div>
    </div>
  )
}

/**
 * One cartridge shell. No primitive in `src/ui` fits: `Panel` has no dashed
 * variant and a fixed p-3 that blows the height budget, and `Row` is a
 * full-width horizontal list item, not a narrow vertical shelf slot. Small
 * enough to keep local rather than promoting it.
 *
 * Locked and selected are two independent things drawn two different ways,
 * on purpose: a dashed border says "this slot is locked", regardless of the
 * cursor. A solid accent fill on the label says "the cursor is here",
 * regardless of lock state. A locked slot can and should be able to carry
 * the cursor; seeing what is coming is the point of drawing it at all.
 */
function CartridgeShell({
  cartridge,
  index,
  selected,
  onActivate,
}: {
  cartridge: Cartridge
  index: number
  selected: boolean
  onActivate: (index: number) => void
}) {
  return (
    <button
      type="button"
      className="pressable flex min-h-0 flex-1 flex-col items-stretch gap-1"
      onClick={() => onActivate(index)}
    >
      <div
        className={`border-edge flex min-h-0 flex-1 flex-col items-center justify-center gap-1 border-2 p-1 ${
          cartridge.locked ? 'bg-panel border-dashed' : 'bg-panel shadow-hard'
        }`}
        // The floor the shelf stops giving ground at. Below roughly this, a
        // cartridge shell stops reading as an object on a shelf and starts
        // reading as a wide button, which is the one thing the locked slots
        // must not look like.
        style={{ minHeight: 120 }}
      >
        {cartridge.locked ? (
          <>
            <PixelText role="value" tone="dim">
              ???
            </PixelText>
            <PixelText role="micro" tone="dim" upper>
              Locked
            </PixelText>
          </>
        ) : (
          <>
            <span className="bg-ink h-1 w-full" aria-hidden="true" />
            <PixelText role="body" tone="ink" upper className="text-center">
              {cartridge.title}
            </PixelText>
            <span className="bg-ink h-1 w-full" aria-hidden="true" />
          </>
        )}
      </div>
      <div className={`shrink-0 px-1 ${selected ? 'bg-accent' : ''}`}>
        <PixelText role="micro" tone={selected ? 'invert' : 'dim'} upper>
          {`Cart ${String(index + 1).padStart(2, '0')}`}
        </PixelText>
      </div>
    </button>
  )
}
