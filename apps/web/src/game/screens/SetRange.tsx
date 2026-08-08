import { useMemo, useState } from 'react'
import { useConsoleIntent } from '../../console/useConsoleInput'
import { brand } from '../../config/brand'
import {
  depositSplit,
  poolPriceFromBinId,
  widthFromBins,
} from '../../lib/range/bins'
import { planForOffsets, planForSession } from '../../lib/range/plan'
import { FALLBACK_REALIZED_VOL } from '../sim'
import { pct, price, usd } from '../../lib/format'
import { Panel, PixelText, Toggle, Value } from '../../ui'
import type { RangePlan } from '../../lib/range/bins'
import type { PlannedRange } from '../../lib/range/plan'
import type { ManualRange, RangeWidth } from '../../state/session'
import type { Pool } from '../../types/domain'

/** The only five deposit sizes a beginner is offered directly. PRD.md 8.2.1:
 * one number, in one token, and a preset row is how that stays one number
 * instead of a text field a console has no keyboard to fill. */
const PRESETS = [10, 25, 50, 75, 100] as const

/**
 * Past either end of the preset row, LEFT/RIGHT stops sticking and starts
 * nudging. Five is small enough to read as a fine adjustment and large
 * enough that walking from a preset to the balance ceiling is a handful of
 * presses, not fifty. Brief: "presets plus adjustment, on one axis."
 */
const FINE_STEP = 5

/** SCREEN-DETAIL.md section 9, PRD.md 8.5 point 3: a percentage of earnings,
 * never per action. The number itself is the wireframe's, not derived. */
const AUTOPILOT_FEE_PCT = 10

/**
 * There is no swap quote path until Phase 3 (PRD.md 9.5: never invent a
 * precise number). 0.3% is LFJ's most common Liquidity Book swap fee tier,
 * so it is a plausible floor to estimate against rather than a fabricated
 * one, and the word "estimated" in front of it is doing the real work: this
 * is a floor, not a quote, and it is never rendered as if it were.
 */
const SWAP_FEE_ESTIMATE_PCT = 0.3

/** 480 screen less 8px of page padding on each side, the same measurement
 * InRange.tsx uses for its own full-bleed field. */
const STRIP_WIDTH = 464
/**
 * FLOORS, not heights. The strip takes whatever the screen has left over
 * (see the `flex-1` comment on the range picture) and these are the point
 * below which it stops giving ground and lets the screen overflow instead,
 * because a 12px strip is not a picture of anything.
 *
 * 56 and 64 are the two heights the strip used to be pinned to, both inside
 * the 56-72px the brief asks for and both multiples of 4, so on any layout
 * that fits at all the strip renders exactly as tall as it always did. On the
 * base screen it now grows past 56 when the clamp notice is absent, which is
 * the screen spending its slack on the thing it is about rather than on a gap
 * above the footer.
 */
const STRIP_MIN_HEIGHT = 56
/** `h-3` on NowMarker. Named so the strip block's floor can count it. */
const NOW_MARKER_HEIGHT = 12
const OVERLAY_STRIP_MIN_HEIGHT = 64

type FocusRow = 'amount' | 'width' | 'autopilot'
const ROWS: ReadonlyArray<FocusRow> = ['amount', 'width', 'autopilot']

/**
 * The three positions in the HOW WIDE row.
 *
 * MANUAL lives here rather than in a section of its own. It was split out for
 * one build on the reasoning that "leave the suggestion or edit it" is a
 * different question from "how wide", and that reasoning was right about the
 * semantics and wrong about the hands: a section the arrow keys cannot reach
 * is a control most players never touch, and this row is where the fingers
 * already are. It is the same question asked three ways, so it is one row.
 */
type WidthSlot = RangeWidth | 'manual'
const WIDTH_SLOTS: ReadonlyArray<WidthSlot> = ['wide', 'tight', 'manual']

/**
 * What the onchain deposit is doing.
 *
 * A deposit is five transactions, not one (lib/deposit/plan.ts explains why),
 * so `sending` carries which one is in flight. A player watching their card
 * sign five times deserves to know it is progress and not a stutter.
 */
export type DepositState =
  | { status: 'idle' }
  | { status: 'sending'; step: number; total: number; label: string }
  | { status: 'opened'; txHash: string; explorerUrl: string | null }
  | { status: 'failed'; reason: string }

export interface SetRangeProps {
  /** Undefined is a render state, never a throw. Gate 2.4. */
  pool: Pool | undefined
  balance: number
  /**
   * Idle on the fixture path, where confirming just walks to the next screen.
   * The route decides; this screen only draws what it is told, exactly as
   * `Results` does with `SaveState`.
   */
  deposit: DepositState
  amount: number
  width: RangeWidth
  /** Null is the default: WIDE/TIGHT alone. PRD.md 8.2, session.ts. */
  manualRange: ManualRange | null
  autopilot: boolean
  onChangeAmount: (next: number) => void
  onChangeWidth: (next: RangeWidth) => void
  onChangeManualRange: (next: ManualRange | null) => void
  onToggleAutopilot: (next: boolean) => void
  onConfirm: () => void
  onBack: () => void
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * The footer's first slot, which is the only place that says what A does.
 *
 * It already rewrites itself for the MANUAL chip, and the intent handler cites
 * that rewriting as the licence for one key meaning two things. A deposit is
 * the third meaning, so it earns a label for the same reason.
 */
function confirmLabel(deposit: DepositState): string {
  switch (deposit.status) {
    case 'sending':
      return `${deposit.step}/${deposit.total} signing`
    case 'opened':
      return 'A continue'
    case 'failed':
      return 'A try again'
    case 'idle':
      return 'A confirm'
  }
}

/**
 * One line under the footer, and only when there is something true to say.
 *
 * Renders nothing on the fixture path, so a screen that is not depositing looks
 * exactly as it did before this existed. A deposit that failed prints the
 * chain's own reason: `addLiquidity` reverts with named Liquidity Book errors
 * (`LBRouter__AmountSlippageCaught` and twenty-five others are in the ABI for
 * exactly this) and paraphrasing them here would throw away the one string that
 * tells whoever is watching what actually went wrong.
 */
function DepositNotice({ deposit }: { deposit: DepositState }) {
  if (deposit.status === 'idle') return null

  return (
    <div className="flex items-baseline gap-2">
      <PixelText
        role="micro"
        tone={deposit.status === 'failed' ? 'loss' : 'dim'}
        upper
      >
        {deposit.status === 'sending'
          ? deposit.label
          : deposit.status === 'opened'
            ? 'position open onchain'
            : 'could not open'}
      </PixelText>
      {deposit.status === 'failed' ? (
        <PixelText role="micro" tone="dim" className="truncate">
          {deposit.reason}
        </PixelText>
      ) : null}
      {deposit.status === 'opened' ? (
        <PixelText role="micro" tone="dim" className="truncate">
          {deposit.txHash.slice(0, 10)}
        </PixelText>
      ) : null}
    </div>
  )
}

/**
 * Where LEFT/RIGHT on a preset row send the value: the neighbour preset, or
 * (past either end of the list) a fine nudge, clamped to [min, max].
 *
 * Shared by the AMOUNT row and the manual editor's START/END rows: both are
 * "walk a preset list, then fall back to a fixed step" with different
 * presets and different clamps, and this is the one place that shape lives.
 */
function stepPreset(
  current: number,
  direction: 1 | -1,
  presets: ReadonlyArray<number>,
  fineStep: number,
  min: number,
  max: number,
): number {
  const idx = presets.indexOf(current)
  // Bounds-checked on the INDEX, not on the value it produces. `presets[-1]`
  // is undefined at runtime but typed as a number here (the project does not
  // set noUncheckedIndexedAccess), so a truthiness guard on the result reads
  // as dead code to the linter and is the sort of check that gets deleted.
  // `.at()` would type it honestly and is wrong for the opposite reason:
  // `.at(-1)` wraps to the LAST preset, so LEFT from the first would jump to
  // the last.
  const next = idx + direction
  if (idx !== -1 && next >= 0 && next < presets.length) {
    return clamp(presets[next], min, max)
  }
  return clamp(current + direction * fineStep, min, max)
}

/** The AMOUNT row's own ceiling is the balance; session.ts enforces the same
 * one on setAmount, so this just keeps LEFT/RIGHT from ever asking for more
 * than the chip row could show as disabled. */
function stepAmount(
  current: number,
  direction: 1 | -1,
  balance: number,
): number {
  return stepPreset(current, direction, PRESETS, FINE_STEP, 0, balance)
}

/**
 * S6, the setup screen. SCREEN-DETAIL.md section 9.
 *
 * A component, not a route: it takes callbacks, never imports useNavigate,
 * and knows nothing about `$id`. Same contract as InRange.tsx.
 */
export function SetRange({
  pool,
  balance,
  amount,
  width,
  manualRange,
  autopilot,
  onChangeAmount,
  onChangeWidth,
  onChangeManualRange,
  onToggleAutopilot,
  onConfirm,
  onBack,
  deposit,
}: SetRangeProps) {
  const [focusRow, setFocusRow] = useState<FocusRow>('amount')
  const [manualOpen, setManualOpen] = useState(false)
  /**
   * Where the cursor sits INSIDE the width row, which is not the same thing
   * as the width in force.
   *
   * WIDE and TIGHT apply the moment the cursor lands on them, so for those
   * two the distinction never shows. MANUAL is the reason it exists: walking
   * onto it has to look like something before anything has been edited, and
   * `manualRange !== null` cannot say that because it is still null until the
   * player applies an edit. Cursor and applied are two facts and the chip row
   * shows both: the cursor is a solid ink fill, the applied range is the
   * accent fill. Cancel out of the editor and MANUAL keeps the cursor and
   * loses nothing, because it never had the accent to begin with.
   */
  const [widthCursor, setWidthCursor] = useState<WidthSlot>(() =>
    manualRange ? 'manual' : width,
  )

  // The one place a width (or a hand moved edge) becomes a bin plan on this
  // screen, same function S7 calls with the same inputs once the deposit is
  // live, so the range shown here is the range that gets funded. plan.ts's
  // own comment explains why that has to be one function and not copies.
  const range = useMemo(
    () => (pool ? planForSession(pool, width, manualRange) : null),
    [pool, width, manualRange],
  )

  useConsoleIntent((intent) => {
    // The manual editor mounts as its own component with its own
    // useConsoleIntent subscription while it is open (below), which is the
    // real guarantee that a key press cannot reach both handlers. This early
    // return is the second layer: even if that ever changed, A here can
    // never reach onConfirm while the overlay covers the screen.
    if (manualOpen) return

    if (!pool || !range) {
      if (intent === 'B') onBack()
      return
    }

    if (intent === 'B') {
      onBack()
      return
    }
    if (intent === 'A') {
      // A is CONFIRM everywhere except on the MANUAL chip, where it opens the
      // editor. That is one key meaning two things, which is normally how a
      // console screen gets a player into trouble, and it is safe here only
      // because the footer's first slot rewrites itself to say which one is
      // live right now. If that footer ever stops changing, this branch has
      // to go with it.
      if (focusRow === 'width' && widthCursor === 'manual') {
        setManualOpen(true)
        return
      }
      // A deposit already in flight owns the card. Five transactions are
      // signed in sequence, and a second press partway through would start a
      // second set against balances the first one is still moving.
      if (deposit.status === 'sending') return
      onConfirm()
      return
    }
    if (intent === 'SELECT') {
      // Manual range (start price, end price, "-10%" presets) is PRD.md 8.2:
      // "behind a toggle and never the default path." It opens SEEDED from
      // whichever WIDE/TIGHT edges are already on screen, so it reads as an
      // edit on top of the suggestion rather than a second, competing mode.
      setManualOpen(true)
      return
    }

    if (intent === 'UP' || intent === 'DOWN') {
      const idx = ROWS.indexOf(focusRow)
      const nextIdx = idx + (intent === 'UP' ? -1 : 1)
      // No wrap. S5's lesson: a cursor that wraps past the end of a
      // three-item list feels broken, not clever, the first time a player
      // hits it.
      if (nextIdx >= 0 && nextIdx < ROWS.length) setFocusRow(ROWS[nextIdx])
      return
    }

    if (intent === 'LEFT' || intent === 'RIGHT') {
      const direction = intent === 'LEFT' ? -1 : 1
      if (focusRow === 'amount') {
        onChangeAmount(stepAmount(amount, direction, balance))
        return
      }
      if (focusRow === 'width') {
        const idx = WIDTH_SLOTS.indexOf(widthCursor)
        const nextIdx = idx + direction
        // No wrap, same rule as every other cursor on this screen.
        if (nextIdx < 0 || nextIdx >= WIDTH_SLOTS.length) return
        const next = WIDTH_SLOTS[nextIdx]
        setWidthCursor(next)
        // WIDE and TIGHT apply on arrival: they are cheap, reversible, and
        // waiting for a second press to confirm a two-state toggle is the
        // kind of ceremony that makes a console screen feel slow.
        // session.ts's setWidth also clears manualRange, so walking back onto
        // one of them IS "give me the suggestion again".
        // MANUAL applies nothing. It opens an overlay, which is not cheap and
        // not reversible by walking away, so it waits for A.
        if (next !== 'manual') onChangeWidth(next)
        return
      }
      onToggleAutopilot(!autopilot)
    }
  })

  // Gate 2.4. Not a throw, not a spinner: a real panel with a real way out.
  if (!pool || !range) {
    return (
      <div className="bg-screen flex h-full w-full flex-col items-center justify-center gap-3 p-4">
        <Panel className="flex flex-col gap-2">
          <PixelText role="title" upper>
            Pool not found
          </PixelText>
          <PixelText role="body">
            This pool is not on the current save disk, or it never made this
            tier&apos;s cut.
          </PixelText>
        </Panel>
        <PixelText role="micro" tone="dim" upper>
          B back
        </PixelText>
      </div>
    )
  }

  const lowPrice = poolPriceFromBinId(
    range.lowerBinId,
    pool.binStep,
    pool.tokenX.decimals,
    pool.tokenY.decimals,
  )
  const highPrice = poolPriceFromBinId(
    range.upperBinId,
    pool.binStep,
    pool.tokenX.decimals,
    pool.tokenY.decimals,
  )

  // The active bin sits at delta 0, which is index binsBelow in the tile
  // array RangeStrip draws (tiles run -binsBelow..+binsAbove). planRange
  // always returns a symmetric plan today, so this lands at 50%, but it is
  // computed from the plan rather than hardcoded so a future asymmetric
  // plan does not silently draw "now" in the wrong place.
  const nowLeftPct = ((range.plan.binsBelow + 0.5) / range.plan.totalBins) * 100

  // depositSplit returns a FRACTION OF VALUE, not a token quantity. Reading
  // it as a value split rather than converting through the active price is
  // deliberate: there is no swap quote path yet (see SWAP_FEE_ESTIMATE_PCT),
  // and a value split is the one thing this screen can state as exact
  // arithmetic instead of an estimate. It is also why these two numbers sum
  // to `amount`, which is the whole point of showing them.
  const split = depositSplit(range.plan)
  const quoteAmount = amount * split.quoteFraction
  const baseAmount = amount * split.baseFraction
  const swapCostEstimate = baseAmount * (SWAP_FEE_ESTIMATE_PCT / 100)

  // The width caption's provenance line reads off this. plan.ts already
  // falls back to the same constant, this is just the one other place that
  // has to agree with it rather than assume the pool always carries a vol.
  const vol = pool.realizedVol24h ?? FALLBACK_REALIZED_VOL

  return (
    <div className="bg-screen relative flex h-full w-full flex-col gap-1 p-2">
      {/* Header. Body weight, not title: this screen has three controls, a
          picture, and a split preview to fit inside 320px, and a 24px title
          row buys eight pixels of screen name at the cost of eight pixels of
          the thing the screen is for. InRange.tsx makes the same trade. */}
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-1">
          <PixelText role="body" upper>
            Set your range
          </PixelText>
          {/* Every number below comes from a committed fixture, not a live
              quote. Eight pixels of honesty. */}
          <PixelText role="micro" tone="dim" upper>
            Fixture
          </PixelText>
        </div>
        <PixelText role="body" upper>
          {pool.tokenX.symbol} / {pool.tokenY.symbol}
        </PixelText>
      </div>

      {/* HOW MUCH, HOW WIDE and MANUAL? share one row.
          They were stacked, which is how the wireframe draws them, and the
          blocks plus the range picture plus the split preview came to roughly
          460px inside a 320px viewport that clips silently. Side by side costs
          nothing legible, and the questions are read together anyway ("how
          much, how wide, and am I editing it") rather than as separate steps.

          MANUAL is its own question, not a third width. It was a chip sitting
          beside WIDE and TIGHT, which read as "pick one of three widths" when
          it is really "leave the suggestion, or edit it": the first two answer
          HOW WIDE and the third answers whether that answer still stands.

          The cursor bar plus a background fill both mark focus, because a
          ring-2 on an 8px label was the exact S5 bug: it read as "a slightly
          bolder label", not as a cursor. */}
      <div className="grid grid-cols-[auto_1fr] gap-2">
        <div
          className={`flex flex-col gap-1 p-1 ${focusRow === 'amount' ? 'bg-sunk' : ''}`}
        >
          <div className="flex items-center gap-1">
            <FocusCursor active={focusRow === 'amount'} />
            <PixelText role="micro" tone="dim" upper>
              How much?
            </PixelText>
            <PixelText
              role="micro"
              tone="dim"
              className="ml-auto pl-2 tabular-nums"
            >
              balance {usd(balance)}
            </PixelText>
          </div>
          {/* The chosen amount sits BESIDE the chips, not on a row under
              them. A 20px `Value` on its own row cost this column 24px, and
              the screen's own budget arithmetic came to 316 of 320, which is
              exactly the margin this repo has twice discovered it does not
              have. Same size, same prominence, one row fewer, and it reads
              better anyway: the number lands where the chip that set it is. */}
          <div className="flex items-baseline gap-1">
            {PRESETS.map((preset) => (
              <Chip
                key={preset}
                label={String(preset)}
                selected={amount === preset}
                // Disabled, not hidden: the balance ceiling has to be visible,
                // not merely enforced.
                disabled={preset > balance}
                onSelect={() => onChangeAmount(Math.min(preset, balance))}
              />
            ))}
            <Value amount={amount} decimals={2} className="ml-1" />
            <PixelText role="micro" tone="dim" upper>
              {pool.tokenY.symbol}
            </PixelText>
          </div>
        </div>

        <div
          className={`flex flex-col gap-1 p-1 ${focusRow === 'width' ? 'bg-sunk' : ''}`}
        >
          <div className="flex items-center gap-1">
            <FocusCursor active={focusRow === 'width'} />
            <PixelText role="micro" tone="dim" upper>
              How wide?
            </PixelText>
          </div>
          {/* Chips and their caption share a gapless block, so the sentence
              that explains the chips sits ON them rather than floating four
              pixels off looking like it belongs to the range picture below.
              The 4px the column gap would have put here is the difference
              between a caption and an unrelated line. */}
          <div className="flex flex-col">
            <div className="flex gap-1">
              {WIDTH_SLOTS.map((slot) => (
                <Chip
                  key={slot}
                  label={slot}
                  // APPLIED, not focused. Neither WIDE nor TIGHT reads as
                  // applied once a hand moved edge is in play: showing WIDE as
                  // chosen while the funded range is actually the player's own
                  // edit would be a lie the picture below contradicts.
                  selected={
                    slot === 'manual'
                      ? manualRange !== null
                      : width === slot && !manualRange
                  }
                  // FOCUSED, which is a different fact. Only drawn while the
                  // width row holds the row cursor, so a solid ink chip never
                  // appears on a row the arrow keys are not currently driving.
                  cursor={focusRow === 'width' && widthCursor === slot}
                  onSelect={() => {
                    setWidthCursor(slot)
                    setFocusRow('width')
                    if (slot === 'manual') setManualOpen(true)
                    else onChangeWidth(slot)
                  }}
                />
              ))}
            </div>
            {/* Fixed height whether or not the text differs, so toggling width
                never shifts the range picture below it. That shift was a real
                S5 bug when a strip appeared and disappeared above the field it
                was meant to sit under.

                The user asked, correctly, where a tight/wide price comes from.
                This is that derivation in eight pixels: the volatility read
                off the pool, and the half width WIDE or TIGHT turns it into.
                Once a hand moved edge exists it says MANUAL and prints the
                edges instead, because the same eight pixels crediting the
                player's own number to the pool's volatility would be worse
                than saying nothing. */}
            <div className="h-3">
              <PixelText role="micro" tone="dim">
                {manualRange
                  ? `manual  ${pct(manualRange.lowerPct, 0)} / +${pct(manualRange.upperPct, 0)}`
                  : `vol ${pct(vol * 100, 0)} -> +/-${pct(range.requestedWidthPct, 1)}`}
              </PixelText>
            </div>
          </div>
        </div>
      </div>

      {/* THE RANGE PICTURE. Biggest single element on the screen on purpose:
          a correct screen with empty space read as unfinished twice already
          this build, and this is the thing the screen is actually about.

          It takes `flex-1`, and that is the fix for a bug this screen shipped
          twice: the footer went off the bottom edge in silence. `overflow:
          hidden` on the viewport does not warn, and jsdom does no layout, so
          no test could see it, which left a hand-summed budget of six fixed
          blocks against 320px as the only defence. That budget is a guess
          about how a font renders. This is not a guess. The strip is the one
          element on the screen whose exact height carries no information, so
          it absorbs the remainder and every other block keeps its natural
          size. The footer cannot be pushed off, because nothing is pushing.

          `min-h-0` is load bearing. A flex item defaults to `min-height:
          auto`, which refuses to shrink below its content, and that is
          precisely how a "flexible" row overflows its parent anyway. */}
      <div className="flex min-h-0 flex-1 flex-col gap-1">
        {/* The two edge prices, with the strip's colour key between them.
            The key was under the strip and is above it now, because that row
            had to be emptied for the "now" marker (see below) and because the
            key belongs on the same side of the picture as the two numbers it
            colours. Without it the strip is a two-tone bar and the split
            sentence lower down is an unrelated claim; with it the picture IS
            the explanation, PRD.md 8.4 point 2. It replaces the words "your
            range", which the screen title already says. */}
        <div className="flex items-center justify-between">
          <PixelText role="micro" className="tabular-nums">
            {price(lowPrice)}
          </PixelText>
          <span className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className="bg-sunk border-edge inline-block h-2 w-2 border"
            />
            <PixelText role="micro" tone="dim" upper>
              {pool.tokenY.symbol}
            </PixelText>
            <span
              aria-hidden="true"
              className="bg-accent border-edge ml-1 inline-block h-2 w-2 border"
            />
            <PixelText role="micro" tone="dim" upper>
              {pool.tokenX.symbol}
            </PixelText>
          </span>
          <PixelText role="micro" className="tabular-nums">
            {price(highPrice)}
          </PixelText>
        </div>
        {/* No gap between the strip and its marker: the ▲ points at the bin
            directly above it, so any space between them is space the eye has
            to cross to believe they are the same thing. */}
        {/* The minHeight is the WHOLE block, strip plus marker, not the strip.
            `min-h-0` is what lets a flex child be squeezed below its content,
            which is exactly what this idiom is for; without a floor that counts
            every child, this block was squeezed to the strip's own 56 and the
            12px NowMarker was pushed out the bottom, landing on top of the
            clamp sentence below it. Reachable on any pool whose default WIDE
            range clamps, which is 2 of the 14 fixtures.
            The 2026-08-05 log says one block absorbs the remainder AND keeps a
            minHeight floor. The floor was there and it was counting one child. */}
        <div
          className="flex min-h-0 flex-1 flex-col"
          style={{
            width: STRIP_WIDTH,
            minHeight: STRIP_MIN_HEIGHT + NOW_MARKER_HEIGHT,
          }}
        >
          <RangeStrip plan={range.plan} minHeight={STRIP_MIN_HEIGHT} />
          <NowMarker leftPct={nowLeftPct} />
        </div>
        {/* Bin step, bin count, and the clamp notice on one flowed row.
            Flowed, not absolute: three absolutely positioned labels sharing a
            12px box is how "▲ now" ended up sitting on top of the sentence
            under it, and two flex children cannot land on each other.

            Never hide a clamp. The player asked for a wider range than fits in
            one transaction (CLAUDE.md rule 4, bins.ts planRange) and got a
            narrower one; that is said in plain words, in the same wording the
            manual editor uses, not silently substituted. */}
        <div
          className="flex items-baseline justify-between gap-2"
          style={{ width: STRIP_WIDTH }}
        >
          <PixelText role="micro" tone="dim" className="tabular-nums">
            {range.plan.binStep} bps steps, {range.plan.totalBins} bins
          </PixelText>
          {range.plan.clamped ? (
            <PixelText role="micro" className="text-right">
              wider than one transaction fits, so this is narrower.
            </PixelText>
          ) : null}
        </div>
      </div>

      {/* YOU WILL HOLD. Mandatory and load bearing per SCREEN-DETAIL.md
          section 9: never collapsed, and the fix for PRD.md 8.4 point 2. A
          Panel here, not a bare row, so the one sentence a beginner most
          needs to read does not compete for weight with everything above it.

          Two lines, guaranteed, no more: `flex-wrap` on the first line and a
          sentence long enough to wrap on the second were the two known ways
          this panel could clip a real phone in silence (jsdom does no layout,
          so neither one failed a test). `whitespace-nowrap` on line one and
          a line two kept under ~55 characters make both structurally
          impossible rather than merely usually-fine. p-1, not p-2: the panel
          has to fit inside a budget that was already accounted for at p-2. */}
      <Panel className="flex flex-col gap-1 p-1">
        <div className="flex items-baseline gap-1 whitespace-nowrap">
          <PixelText role="micro" tone="dim" upper>
            You will hold
          </PixelText>
          <Value amount={quoteAmount} prefix="$" decimals={2} />
          <PixelText role="micro" tone="dim" upper>
            {pool.tokenY.symbol}
          </PixelText>
          <PixelText role="micro" tone="dim">
            +
          </PixelText>
          <Value amount={baseAmount} prefix="$" decimals={2} />
          <PixelText role="micro" tone="dim" upper>
            {pool.tokenX.symbol}
          </PixelText>
        </div>
        {/* The swap cost is labelled an estimate and stays that way until
            there is a real quote path. PRD.md 9.5. */}
        <PixelText role="micro" tone="dim" className="whitespace-nowrap">
          {`we swap part of your ${pool.tokenY.symbol} first. swap cost ~${usd(swapCostEstimate)} est.`}
        </PixelText>
      </Panel>

      {/* AUTOPILOT. Fee is a percentage of earnings, never per action,
          PRD.md 8.5 point 3, and the name is a token per CLAUDE.md rule 9.
          The caption sits on the toggle's own row: it is six words, and a
          second row for it costs the same 16px as a row of the range picture. */}
      <div
        className={`flex items-center gap-2 p-1 ${focusRow === 'autopilot' ? 'bg-sunk' : ''}`}
      >
        <FocusCursor active={focusRow === 'autopilot'} />
        <Toggle
          on={autopilot}
          label={brand.AUTOPILOT_NAME}
          onChange={onToggleAutopilot}
        />
        <PixelText role="micro" tone="dim">
          {`keeps you in range. fee: ${pct(AUTOPILOT_FEE_PCT, 0)} of earnings.`}
        </PixelText>
      </div>

      {/* Footer, pinned with mt-auto so it never floats when the content
          above it changes height. A real S5 bug.

          Bare text, exactly like S3, S4, S5 and S8: bordered boxes made this
          one screen's footer look like a toolbar while every other screen's
          reads as a key legend, and a control row that changes shape between
          screens is a control row a player has to re-learn each time. They are
          still <button>s, so a mouse and a thumb keep working; the border was
          the only thing that had to go.

          Button name, then action. The KEY each button answers to is the
          console shell's job (Console.tsx's legend), never a screen's. */}
      <DepositNotice deposit={deposit} />

      <div className="grid grid-cols-3 items-center gap-1">
        {/* The one slot on this screen that rewrites itself, and it has to.
            A means CONFIRM everywhere except on the MANUAL chip, where it
            opens the editor, and a key that quietly means two things is how a
            player funds a position they meant to edit. This label is the whole
            licence for that branch in the intent handler. */}
        {focusRow === 'width' && widthCursor === 'manual' ? (
          <FooterButton
            label="A edit range"
            onClick={() => setManualOpen(true)}
          />
        ) : (
          <FooterButton
            label={confirmLabel(deposit)}
            onClick={deposit.status === 'sending' ? () => undefined : onConfirm}
          />
        )}
        <FooterButton label="B back" align="center" onClick={onBack} />
        {/* "Select manual", not "manual range": the overlay's own heading
            says "Manual range", and the test for "SELECT opens the editor"
            checks that phrase is absent before the press. Two controls
            saying the same two words would make that check meaningless. */}
        <FooterButton
          label="Select manual"
          align="right"
          onClick={() => setManualOpen(true)}
        />
      </div>

      {manualOpen ? (
        <ManualRangeEditor
          pool={pool}
          range={range}
          manualRange={manualRange}
          onApply={(next) => {
            onChangeManualRange(next)
            setManualOpen(false)
          }}
          onCancel={() => setManualOpen(false)}
          onUseSuggestion={() => {
            onChangeManualRange(null)
            setManualOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}

/** START walks toward a wider downside, END toward a wider upside. Presets
 * are the offers PRD.md 8.2 names ("current price, -10%, -25%"); past either
 * end of the list, LEFT/RIGHT falls back to a 1% nudge the same way the
 * amount row does. */
const START_PRESETS = [-25, -15, -10, -5] as const
const END_PRESETS = [5, 10, 15, 25] as const
const MANUAL_FINE_STEP = 1
/** planAsymmetric throws if an edge reaches or crosses 0 (bins.ts: a range
 * has to straddle the price, or it is a resting limit order, a different
 * position). These clamps keep both edges strictly on their own side of it,
 * so the editor can never construct an input that throws. */
const START_MIN = -90
const START_MAX = -1
const END_MIN = 1
const END_MAX = 400

type EditRow = 'start' | 'end'
const EDIT_ROWS: ReadonlyArray<EditRow> = ['start', 'end']

/**
 * The manual range editor. PRD.md 8.2: "behind a toggle... start and end
 * price, with presets." A full 480x320 overlay rather than more rows on the
 * base screen, because the base screen's own budget is already spent and
 * this needs a picture of its own to be worth building at all.
 *
 * A separate component, mounted only while `manualOpen` is true, so its
 * useConsoleIntent subscription does not exist to fire when the base
 * screen's does. That is the real guarantee behind "A on the overlay can
 * never reach onConfirm", not just the early-return in SetRange's handler.
 */
function ManualRangeEditor({
  pool,
  range,
  manualRange,
  onApply,
  onCancel,
  onUseSuggestion,
}: {
  pool: Pool
  range: PlannedRange
  manualRange: ManualRange | null
  onApply: (next: ManualRange) => void
  onCancel: () => void
  onUseSuggestion: () => void
}) {
  // Seeded once, at mount, from whatever the player was already looking at:
  // the manual range itself if one exists, or the ACHIEVED edges of the
  // WIDE/TIGHT plan otherwise (not the requested width, which the bin cap
  // may have clamped away from). The user's own instruction was "pick wide
  // or tight, the price range appears, and then that is editable again by
  // the user": an editor that opened anywhere else would be a second,
  // competing control rather than an edit on top of the first one.
  const [start, setStart] = useState(() =>
    manualRange
      ? manualRange.lowerPct
      : -Math.round(widthFromBins(range.plan.binsBelow, range.plan.binStep)),
  )
  const [end, setEnd] = useState(() =>
    manualRange
      ? manualRange.upperPct
      : Math.round(widthFromBins(range.plan.binsAbove, range.plan.binStep)),
  )
  const [editRow, setEditRow] = useState<EditRow>('start')

  // planForOffsets, the same function S6 and S7 both call through
  // planForSession, so the plan drawn here previews exactly what APPLY would
  // fund. start/end are clamped strictly inside (-90,0) and (0,400), so this
  // can never hit the RangeError planAsymmetric throws for a non-straddling
  // range: a thrown RangeError inside render is a white screen on stage.
  const preview = useMemo(
    () => planForOffsets(pool, { lowerPct: start, upperPct: end }),
    [pool, start, end],
  )

  useConsoleIntent((intent) => {
    if (intent === 'B') {
      onCancel()
      return
    }
    if (intent === 'A') {
      onApply({ lowerPct: start, upperPct: end })
      return
    }
    if (intent === 'SELECT') {
      onUseSuggestion()
      return
    }
    if (intent === 'UP' || intent === 'DOWN') {
      const idx = EDIT_ROWS.indexOf(editRow)
      const nextIdx = idx + (intent === 'UP' ? -1 : 1)
      if (nextIdx >= 0 && nextIdx < EDIT_ROWS.length) {
        setEditRow(EDIT_ROWS[nextIdx])
      }
      return
    }
    if (intent === 'LEFT' || intent === 'RIGHT') {
      const direction = intent === 'LEFT' ? -1 : 1
      if (editRow === 'start') {
        setStart((s) =>
          stepPreset(
            s,
            direction,
            START_PRESETS,
            MANUAL_FINE_STEP,
            START_MIN,
            START_MAX,
          ),
        )
      } else {
        setEnd((s) =>
          stepPreset(
            s,
            direction,
            END_PRESETS,
            MANUAL_FINE_STEP,
            END_MIN,
            END_MAX,
          ),
        )
      }
    }
  })

  const lowPrice = poolPriceFromBinId(
    preview.lowerBinId,
    pool.binStep,
    pool.tokenX.decimals,
    pool.tokenY.decimals,
  )
  const highPrice = poolPriceFromBinId(
    preview.upperBinId,
    pool.binStep,
    pool.tokenX.decimals,
    pool.tokenY.decimals,
  )

  return (
    <div className="bg-screen absolute inset-0 flex flex-col gap-1 p-2">
      <PixelText role="body" upper>
        Manual range
      </PixelText>

      <EditRowLine
        label="Start"
        pctValue={start}
        priceLabel={price(lowPrice)}
        active={editRow === 'start'}
      />
      <EditRowLine
        label="End"
        pctValue={end}
        priceLabel={price(highPrice)}
        active={editRow === 'end'}
      />

      {/* The same picture the base screen shows, so moving an edge here is
          seen, not just read as two changing numbers. That correspondence is
          the entire point of this screen. The base screen's own "now" marker
          was dropped from the first draft of this row, which is the thing
          the user found hidden: without it, this strip cannot say where the
          price actually is relative to the edges being dragged. */}
      <div className="flex min-h-0 flex-1 flex-col gap-1">
        <div
          className="flex min-h-0 flex-1 flex-col"
          style={{ width: STRIP_WIDTH }}
        >
          <RangeStrip
            plan={preview.plan}
            minHeight={OVERLAY_STRIP_MIN_HEIGHT}
          />
          <NowMarker
            leftPct={
              ((preview.plan.binsBelow + 0.5) / preview.plan.totalBins) * 100
            }
          />
        </div>
        <div style={{ width: STRIP_WIDTH }}>
          <PixelText role="micro" tone="dim" className="tabular-nums">
            {preview.plan.clamped
              ? 'wider than one transaction fits, so this is narrower.'
              : `${preview.plan.binStep} bps steps, ${preview.plan.totalBins} bins`}
          </PixelText>
        </div>
      </div>

      {/* Same three-slot footer as the base screen, same bare-text shape, and
          each slot names its button. The overlay had a fourth child in this
          grid ("Select suggestion") that wrapped to a second row underneath
          the other three, which is why the row read as a broken toolbar. */}
      <div className="grid grid-cols-3 items-center gap-1">
        <FooterButton
          label="A apply"
          onClick={() => onApply({ lowerPct: start, upperPct: end })}
        />
        <FooterButton label="B cancel" align="center" onClick={onCancel} />
        <FooterButton
          label="Select use suggestion"
          align="right"
          onClick={onUseSuggestion}
        />
      </div>
    </div>
  )
}

/** One editable edge: a percent offset plus the price it lands on. Two of
 * these are the whole editor body, which is why this is a component rather
 * than JSX repeated twice with the label swapped. */
function EditRowLine({
  label,
  pctValue,
  priceLabel,
  active,
}: {
  label: string
  pctValue: number
  priceLabel: string
  active: boolean
}) {
  return (
    <div className={`flex flex-col gap-1 p-1 ${active ? 'bg-sunk' : ''}`}>
      <div className="flex items-center gap-1">
        <FocusCursor active={active} />
        <PixelText role="micro" tone="dim" upper>
          {label}
        </PixelText>
        <PixelText role="micro" tone="dim" className="ml-auto tabular-nums">
          {pctValue > 0 ? `+${pct(pctValue, 0)}` : pct(pctValue, 0)}
        </PixelText>
      </div>
      <PixelText role="value" className="tabular-nums">
        {priceLabel}
      </PixelText>
    </div>
  )
}

/**
 * The "you are here" marker under a range strip.
 *
 * It gets a row of its own, and that is the whole point of extracting it.
 * The marker used to share a 12px box with the colour key and the bin-step
 * label, all three absolutely positioned with `top` left to the static
 * position, and it rendered a line below them: on top of the clamp sentence
 * underneath, which is the second time a player has reported this marker as
 * hidden. One absolutely positioned child, `top-0` stated rather than
 * inferred, and nothing else in the box, has no line to be pushed onto.
 *
 * `leftPct` is read off the plan, never hardcoded to 50%, so an asymmetric
 * manual range does not draw "now" in the wrong place.
 */
function NowMarker({ leftPct }: { leftPct: number }) {
  return (
    <div className="relative h-3 shrink-0" style={{ width: STRIP_WIDTH }}>
      <span
        className="absolute top-0 -translate-x-1/2"
        style={{ left: `${leftPct}%` }}
      >
        <PixelText role="micro" tone="dim">
          ▲ now
        </PixelText>
      </span>
    </div>
  )
}

/**
 * A footer control.
 *
 * Bare text on purpose, so this screen's footer is the same shape as every
 * other screen's key legend. It is a real `<button>` underneath because a
 * phone has no A button, and `pressable` is the same 1px-down affordance the
 * console's other controls use, so it still answers a thumb. What it must not
 * do is grow a border and read as a toolbar, which is what it did.
 */
function FooterButton({
  label,
  align = 'left',
  onClick,
}: {
  label: string
  align?: 'left' | 'center' | 'right'
  onClick: () => void
}) {
  const justify =
    align === 'center'
      ? 'justify-self-center'
      : align === 'right'
        ? 'justify-self-end'
        : 'justify-self-start'

  return (
    <button type="button" onClick={onClick} className={`pressable ${justify}`}>
      <PixelText role="micro" upper>
        {label}
      </PixelText>
    </button>
  )
}

/**
 * The row focus indicator.
 *
 * A left-edge fill, not a ring. S5's lesson (see the log): a ring-2 on a
 * small shape reads as "a slightly fatter shape," not as a cursor. A block
 * that is either fully there or fully gone reads as a cursor from a phone
 * held at arm's length, which a 2px outline did not.
 *
 * h-3, matching the 12px line box of the micro label it sits beside. At h-4
 * it was the tallest thing in that row and set the row's height, which cost
 * every label row on this screen 4px it did not have to spend.
 *
 * It renders NOTHING when inactive rather than a transparent block holding
 * its place. Reserving the space meant all three section labels sat 8px in
 * from the left edge of their own block permanently, which reads as an
 * indent nobody chose. Now the labels are flush left and the focused row
 * steps forward by exactly the width of the cursor that arrived. The movement
 * IS the second focus signal, alongside the `bg-sunk` fill.
 */
function FocusCursor({ active }: { active: boolean }) {
  if (!active) return null
  return <span aria-hidden="true" className="bg-ink h-3 w-1 shrink-0" />
}

/**
 * A horizontal preset chip.
 *
 * Three fills, because a chip has to answer two independent questions and one
 * of them only became visible when MANUAL joined this row:
 *
 *   `selected`  APPLIED. The accent fill. This is the range being funded.
 *   `cursor`    FOCUSED. The ink fill. This is where the arrow keys are.
 *
 * On WIDE and TIGHT the two coincide, because landing on either applies it,
 * so for a whole build the distinction did not exist and `selected` alone
 * looked sufficient. MANUAL is where they come apart: walking onto it has to
 * look like something before any edge has been edited, and `manualRange !==
 * null` is still null at that moment. Applied wins when both are true, since
 * the row's own `bg-sunk` already says which row the cursor is on.
 *
 * Selection is the same solid accent fill Row uses in ui/select.tsx; this is
 * not that component because Row is a list item (role="option", full width,
 * vertical stack) and a chip is none of those.
 */
function Chip({
  label,
  selected,
  cursor = false,
  disabled = false,
  onSelect,
}: {
  label: string
  selected: boolean
  cursor?: boolean
  disabled?: boolean
  onSelect?: () => void
}) {
  const fill = disabled
    ? 'bg-sunk'
    : selected
      ? 'bg-accent'
      : cursor
        ? 'bg-ink'
        : 'bg-panel'
  const tone = disabled ? 'dim' : selected || cursor ? 'invert' : 'ink'

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      aria-pressed={selected}
      className={`pressable border-edge border px-2 py-1 ${fill} disabled:opacity-50`}
    >
      <PixelText role="micro" tone={tone} upper>
        {label}
      </PixelText>
    </button>
  )
}

/**
 * The range picture's bin strip.
 *
 * ui/data.tsx's BinStrip carries BinState = empty/in-range/active/out, which
 * has no notion of "this bin holds only the quote token" versus "this bin
 * holds only the base token." That asymmetry (PRD.md 8.4, bins BELOW the
 * active bin hold token Y, bins ABOVE hold token X) is the entire reason
 * this screen shows a split preview, so reusing a status palette that
 * cannot say which token a bin holds would draw a picture that disagrees
 * with the sentence under it. A small local strip, two tones plus one
 * active tile, says it correctly.
 */
function RangeStrip({
  plan,
  minHeight,
}: {
  plan: RangePlan
  minHeight: number
}) {
  const tiles: Array<'quote' | 'base' | 'active'> = []
  for (let delta = -plan.binsBelow; delta <= plan.binsAbove; delta += 1) {
    tiles.push(delta === 0 ? 'active' : delta < 0 ? 'quote' : 'base')
  }

  const TILE_CLASS: Record<(typeof tiles)[number], string> = {
    quote: 'bg-sunk',
    base: 'bg-accent',
    active: 'bg-ink',
  }

  return (
    <div
      className="border-edge bg-screen flex min-h-0 flex-1 items-stretch gap-px border p-1"
      style={{ minHeight }}
      role="img"
      aria-label={`Range from ${plan.binsBelow} bins below to ${plan.binsAbove} bins above the current price`}
    >
      {tiles.map((tone, i) => (
        <span key={i} className={`flex-1 ${TILE_CLASS[tone]}`} />
      ))}
    </div>
  )
}
