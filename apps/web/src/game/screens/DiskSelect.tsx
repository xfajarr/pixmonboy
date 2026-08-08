import { useState } from 'react'
import { useConsoleIntent } from '../../console/useConsoleInput'
import { brand, characters } from '../../config/brand'
import { diskNetUsd } from '../fixtures'
import { PixelText, Value } from '../../ui'
import type { CharacterId } from '../../config/brand'
import type { Difficulty, SaveDisk } from '../../types/domain'

/**
 * Which Monanimal a disk's tier is. ERD.md section 2: a SAVE_DISK is bound to
 * a DIFFICULTY and a DIFFICULTY *is* a MONANIMAL, so this is a lookup, never a
 * choice the player makes on this screen. Same table S7 and S8 carry.
 */
const CHARACTER_BY_DIFFICULTY: Record<Difficulty, CharacterId> = {
  easy: 'molandak',
  normal: 'moyaki',
  hard: 'mouch',
}

/**
 * The GOD MODE marker.
 *
 * The wireframe draws a skull. Departure Mono maps 1079 codepoints and `☠` is
 * not among them, so a skull here is a tofu box on the row that is supposed to
 * be the most memorable one on the screen. U+2020 is confirmed present and
 * carries the same "this one was dangerous" reading.
 */
const GOD_MODE_MARK = '†'

export interface DiskSelectProps {
  /** Null before S1 has inserted a card. A render state, never a redirect. */
  cardAddress: string | null
  disks: Array<SaveDisk>
  /** Three. Slots beyond `disks.length` are drawn empty. */
  maxDisks: number
  onOpen: (diskId: number) => void
  onBack: () => void
  /**
   * Present once the route can sign the player out. Renders an EJECT row
   * below the disks (never on the empty slots), reachable by cursor, and
   * calls this instead of pretending to know how a wallet logs out. In
   * console vocabulary: the player ejects a memory card.
   */
  onEject?: () => void
}

/**
 * `0x7a2b...3c3f` becomes `0x7a..3f`.
 *
 * Middle truncation, never a prefix: the last four characters are the half a
 * person actually uses to tell two addresses apart, and a prefix-only ellipsis
 * throws them away.
 */
function shortAddress(address: string): string {
  return `${address.slice(0, 4)}..${address.slice(-2)}`
}

/**
 * S2, the save disk shelf. SCREEN-DETAIL.md section 5.
 *
 * A component, not a route: it takes callbacks, never imports useNavigate, and
 * knows nothing about `useSession`. Same contract as every other screen here.
 *
 * HEIGHT BUDGET (root is p-2, tokens.css line heights, `--spacing: 4px`):
 *   root padding (p-2)                            16
 *   header row (title, 24 line height)            24
 *   gap-1                                          4
 *   three slots, flex-1, 44 each at rest          132
 *     + two 4px gaps between them                   8
 *   gap-1                                          4
 *   footer row (micro)                            12
 *   ----------------------------------------------
 *   at rest                                      200
 *
 * The slot list is `flex-1` rather than a summed stack of fixed rows, and that
 * is deliberate rather than lazy. S6 shipped a missing footer twice on a
 * hand-summed budget: `overflow: hidden` on the viewport does not warn, jsdom
 * performs no layout, so the arithmetic above is the only check and arithmetic
 * against a design token is a guess about how a font renders. Here it is not
 * load bearing. The slots take the remainder, the header and footer keep their
 * natural size, and nothing can push the footer off because nothing is
 * pushing.
 */
export function DiskSelect({
  cardAddress,
  disks,
  maxDisks,
  onOpen,
  onBack,
  onEject,
}: DiskSelectProps) {
  const [index, setIndex] = useState(0)

  // The eject row is a focusable control BELOW the disks, and only when a card
  // is in the slot. The cursor walks disks + eject, never the empty slots.
  const canEject = cardAddress !== null && onEject !== undefined
  const focusCount = disks.length + (canEject ? 1 : 0)

  useConsoleIntent((intent) => {
    if (intent === 'B') {
      onBack()
      return
    }
    if (intent === 'A') {
      // A LENGTH check, not a truthiness check on `disks[index]`. The project
      // leaves `noUncheckedIndexedAccess` off, so an out-of-bounds read is
      // typed as a SaveDisk while being undefined at runtime: the guard that
      // reads as obviously necessary is the one the compiler calls dead. An
      // empty shelf is a real state (a brand new card) and A on it must do
      // nothing rather than throw.
      if (index < disks.length) onOpen(disks[index].diskId)
      else if (canEject && index === disks.length) onEject()
      return
    }
    if (intent === 'UP' || intent === 'DOWN') {
      // The cursor walks the DISKS and the EJECT row, not the empty slots.
      // An empty slot cannot be opened (creating one needs DiskRegistry, which
      // is Phase 3), and a cursor that can land on a dead control is a dead
      // end on stage. No wrap, same rule as every other cursor in this build.
      const next = intent === 'DOWN' ? index + 1 : index - 1
      if (next >= 0 && next < focusCount) setIndex(next)
    }
  })

  const emptySlots = Math.max(0, maxDisks - disks.length)

  return (
    <div className="bg-screen flex h-full w-full flex-col gap-1 p-2">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-1">
          <PixelText role="title" upper>
            Select {brand.SAVE_UNIT}
          </PixelText>
          {/* The disks AND the card address beside them are committed
              fixtures. fixtures.ts says "every screen that shows it also says
              FIXTURE"; until now this screen was the exception that made that
              sentence untrue. */}
          <PixelText role="micro" tone="dim" upper>
            Fixture
          </PixelText>
        </div>
        {/* Gate 2.4: a missing card is a render state with an honest label,
            never a redirect and never a spinner. Every screen in this app
            opens directly at its URL and still renders. */}
        <PixelText role="micro" tone="dim" upper>
          {cardAddress
            ? `${brand.WALLET_UNIT} ${shortAddress(cardAddress)}`
            : `no ${brand.WALLET_UNIT}`}
        </PixelText>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        {disks.map((disk, i) => (
          <DiskRow
            key={disk.diskId}
            disk={disk}
            slot={i + 1}
            focused={i === index}
            onOpen={() => {
              setIndex(i)
              onOpen(disk.diskId)
            }}
          />
        ))}
        {Array.from({ length: emptySlots }, (_, i) => (
          <EmptySlot key={`empty-${i}`} slot={disks.length + i + 1} />
        ))}
        {/* Eject sits BELOW the disks and BELOW the empty slots: it acts on
            the card, not on any slot, so it is never confused for a third
            disk. Only rendered when the route can actually sign the player
            out. */}
        {canEject ? (
          <EjectRow
            focused={index === disks.length}
            onEject={() => {
              setIndex(disks.length)
              onEject()
            }}
          />
        ) : null}
        {/* A card with no disks at all is a real screen, not a blank one.
            Gate 2.4 again, and it is the state a brand new player is in. */}
        {disks.length === 0 ? (
          <PixelText role="micro" tone="dim">
            this {brand.WALLET_UNIT.toLowerCase()} has no disks yet.
          </PixelText>
        ) : null}
      </div>

      {/* The console owns the key legend; a screen names the BUTTON. There is
          no confirmed down-triangle in Departure Mono, so the vertical pair is
          spelled out rather than drawn. */}
      <div className="flex items-center justify-between">
        <PixelText role="micro" upper>
          Move cursor
        </PixelText>
        <PixelText role="micro" upper>
          A open
        </PixelText>
        <PixelText role="micro" upper>
          B back
        </PixelText>
      </div>
    </div>
  )
}

/**
 * One disk.
 *
 * Two lines, not the wireframe's three. The third line was "1 position active"
 * and there is no such field: `DiskRegistry.Disk` (SMART-CONTRACTS.md section
 * 4) carries owner, name, createdAt, bestScore, bestDamage, runs, difficulty
 * and flags, and nothing else. Rendering a number the chain will never return
 * means this screen breaks the day it stops reading fixtures, so it shows what
 * actually exists: the run count. `createdAt` is available too and is not
 * drawn, because "created 6 days ago" answers a question nobody asked while
 * "7 runs" answers the one the row is for.
 *
 * `Row` from ui/select.tsx is close and does not fit: it is a single-column
 * list item and this is a two-line grid with a signed number in it.
 */
function DiskRow({
  disk,
  slot,
  focused,
  onOpen,
}: {
  disk: SaveDisk
  slot: number
  focused: boolean
  onOpen: () => void
}) {
  const character = characters[CHARACTER_BY_DIFFICULTY[disk.difficulty]]
  const net = diskNetUsd(disk)

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={focused ? 'true' : undefined}
      className={`pressable border-edge flex min-h-0 flex-1 items-center gap-2 border px-1 text-left ${
        focused ? 'bg-sunk' : 'bg-panel'
      }`}
    >
      {/* The cursor renders nothing when inactive rather than holding its
          place, so an unfocused row sits flush left and the focused one steps
          forward to meet its cursor. The movement is the second focus signal
          alongside the fill, which matters because a 1px border change is not
          a signal at arm's length. */}
      {focused ? (
        <span aria-hidden="true" className="bg-ink h-8 w-1 shrink-0" />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline gap-2">
          <PixelText role="micro" tone="dim" upper>
            Disk {slot}
          </PixelText>
          <PixelText role="body" upper className="truncate">
            {disk.name}
          </PixelText>
          <PixelText role="micro" tone="dim" upper className="ml-auto">
            {character.label}
          </PixelText>
        </div>
        <div className="flex items-baseline gap-2">
          {/* CLAUDE.md rule 2: never hide a loss. `signed` renders the sign as
              a GLYPH and colours it second, so the row survives a photograph,
              a projector, and colour blindness. A disk that lost money reads
              as one at a glance, which a product that only shows green cannot
              be trusted to do twice. */}
          {/* An unplayed disk shows a dash, never a figure.
              DiskRegistry only writes bestScore/bestDamage when a run beat the
              previous best net, so a disk whose every run LOST stays 0/0 and is
              byte-identical on chain to a disk nobody has touched. `runs` is
              the only field that separates them. Rendering 0 through `Value`
              painted both of them as a green +$0.00, which turns a loss into
              nothing at all: rule 2 in the one place it is easiest to miss.
              Fires the moment S2 reads the chain instead of fixtures. */}
          {disk.runs === 0 ? (
            // Plain ASCII hyphens. Rule 8 forbids em-dashes in user-facing
            // copy, and CLAUDE.md's glyph rule means anything fancier has to be
            // checked against DepartureMono first.
            <PixelText role="body" tone="dim">
              --
            </PixelText>
          ) : (
            <Value amount={net} prefix="$" decimals={2} signed role="body" />
          )}
          <PixelText role="micro" tone="dim" upper>
            {disk.runs === 0
              ? 'never played'
              : `${disk.runs} run${disk.runs === 1 ? '' : 's'}`}
          </PixelText>
          <PixelText role="micro" tone="dim" className="ml-auto" upper>
            {disk.difficulty}
            {disk.godMode ? ` ${GOD_MODE_MARK} god mode` : ''}
          </PixelText>
        </div>
      </div>
    </button>
  )
}

/**
 * An empty slot. Drawn, dim, and deliberately not selectable.
 *
 * Creating a disk needs `DiskRegistry`, which is Phase 3, so a selectable
 * slot here would be a control that does nothing: a dead end found live, on
 * stage, by the one judge who presses everything. Drawing it is still worth
 * doing, because three slots is a product rule (isolated portfolios, exactly
 * like separate save files on a handheld) and a card showing two rows cannot
 * say that.
 */
function EmptySlot({ slot }: { slot: number }) {
  return (
    <div className="border-edge flex min-h-0 flex-1 items-center gap-2 border border-dashed px-1">
      <PixelText role="micro" tone="dim" upper>
        Disk {slot}
      </PixelText>
      <PixelText role="micro" tone="dim" upper>
        empty slot
      </PixelText>
      <PixelText role="micro" tone="dim" className="ml-auto">
        new disks arrive with the registry.
      </PixelText>
    </div>
  )
}

/**
 * The card out of the slot. Console language, same contract as S1's EJECT:
 * the player ejects a memory card, the route owns the logout.
 *
 * Deliberately a plain button and not flex-1 like the disk rows, so it reads
 * as an action on the shelf rather than a slot on the shelf.
 */
function EjectRow({
  focused,
  onEject,
}: {
  focused: boolean
  onEject: () => void
}) {
  return (
    <button
      type="button"
      onClick={onEject}
      aria-current={focused ? 'true' : undefined}
      className={`pressable border-edge flex items-center gap-2 border px-1 ${
        focused ? 'bg-accent' : 'bg-panel'
      }`}
    >
      {focused ? (
        <span aria-hidden="true" className="bg-ink-invert h-4 w-1 shrink-0" />
      ) : null}
      <PixelText role="body" tone={focused ? 'invert' : 'ink'} upper>
        Eject {brand.WALLET_UNIT}
      </PixelText>
      <PixelText
        role="micro"
        tone={focused ? 'invert' : 'dim'}
        className="ml-auto"
        upper
      >
        sign out
      </PixelText>
    </button>
  )
}
