import { useEffect, useMemo, useRef, useState } from 'react'
import { useConsoleIntent } from '../../console/useConsoleInput'
import { brand } from '../../config/brand'
import {
  binIdsForPlan,
  edgeProximity,
  priceFromBinId,
  rangeState,
} from '../../lib/range/bins'
import { planForSession } from '../../lib/range/plan'
import { duration, price } from '../../lib/format'
import { createSim, nudge, recordRebalance, step, summarize } from '../sim'
import { PriceField } from '../PriceField'
import { Meter, Panel, PixelText, Value } from '../../ui'
import type { SpriteAnimation } from '../../ui'
import type { CharacterId } from '../../config/brand'
import type { ManualRange, RangeWidth } from '../../state/session'
import type { RunSummary } from '../sim'
import type { Pool } from '../../types/domain'

/** SELECT walks this many bins per press toward the nearer edge. Enough
 * presses to feel deliberate on stage, not so many that a presenter is still
 * mashing the button when the pitch clock is running. Tuned by hand against
 * the fixture pools' typical bin counts (SCREEN-DETAIL.md 10, "decisively"). */
const NUDGE_BINS_PER_PRESS = 4

/** A tap of A that visibly leaves the ground and comes back. PRD.md 10: hold
 * to jump was the pitch, but a fixed-length swap is the whole mini-game and
 * costs four lines instead of a hold-timer and a physics curve. */
const JUMP_MS = 300

/** The sim ticks twice a second. ARCHITECTURE.md: setInterval, not
 * requestAnimationFrame, because the runner is CSS on the compositor and a
 * per-frame JS loop would burn battery to redraw nothing. */
const TICK_MS = 500

/**
 * Above this edgeProximity the Monanimal is visibly pleased.
 *
 * 0.7 is comfortably inside `calm`, which starts at 0.4 (lib/range/bins.ts,
 * from ERD.md section 4). The gap matters: if happiness started where calm
 * does, the character would smile right up to the moment NAD-SENSE fires, and
 * the face would be reassuring at exactly the wrong time. Happy means the
 * middle, not merely "not yet warned".
 */
const CONTENT_PROXIMITY = 0.7

/**
 * The price field, in pixels.
 *
 * 464 is the 480 screen less 8px of page padding on each side. 200 is what is
 * left after the header (20), the range row (12), the bottom cluster (52), and
 * the gaps, and it is deliberately the largest number that fits: every pixel
 * not spent on a label belongs to the thing the player is actually watching.
 */
const FIELD_WIDTH = 464
const FIELD_HEIGHT = 200

export interface InRangeProps {
  /** Undefined is a render state, never a throw. Gate 2.4. findPool returns
   * exactly this when the id in the URL matches nothing on this save disk. */
  pool: Pool | undefined
  amount: number
  width: RangeWidth
  /** S6's hand moved edges, if any. planForSession treats this as an edit ON
   * TOP of width, never a parallel mode: null plays the WIDE/TIGHT suggestion,
   * present plays exactly what S6 drew. plan.ts owns the precedence. */
  manualRange: ManualRange | null
  autopilot: boolean
  characterId: CharacterId
  /** Hands the finished run out, so S8 can report on it without replaying
   * the seeded walk (a re-run at a different tick count produces different
   * numbers from the ones the player just watched). */
  onWithdraw: (run: RunSummary) => void
  onRebalance: () => void
  onBack: () => void
}

/**
 * S7, the live screen. SCREEN-DETAIL.md section 10.
 *
 * A component, not a route: it takes callbacks, never imports useNavigate,
 * and knows nothing about `$id`. That is what lets this file be tested with
 * `renderScreen` and a keypress instead of a router. ARCHITECTURE.md 2.1.
 */
export function InRange({
  pool,
  amount,
  width,
  manualRange,
  autopilot,
  characterId,
  onWithdraw,
  onRebalance,
  onBack,
}: InRangeProps) {
  // The player's range SHAPE. planForSession is the one entry point plan.ts
  // documents: it reads the width or the manual edit, whichever wins, and
  // answers with a bin step and a bin count either way. That shape is what
  // was funded at deposit time and a rebalance must never change it, only
  // where it sits (see anchorBinId below). Rule 4 says bin step and width are
  // never two raw controls; this is the one place that coupling gets computed.
  const range = useMemo(
    () => (pool ? planForSession(pool, width, manualRange) : null),
    [pool, width, manualRange],
  )

  // Where the shape currently sits, in bin space. Starts at the pool's active
  // bin (deposit time) and only ever moves on a manual rebalance (A while out
  // of range, below). Not derived from `sim`, on purpose: the sim's
  // activeBinId is where PRICE is, and the range's anchor is where the
  // player's LIQUIDITY is. Conflating them is what let a rebalance move
  // nothing while still counting as one.
  //
  // The hook itself is never conditional (pool can be undefined, the
  // not-found path below still has to render), only its initial value is.
  const [anchorBinId, setAnchorBinId] = useState(() => pool?.activeBinId)

  // The live edges: this render's shape, planted at this render's anchor.
  // range.lowerBinId/upperBinId (from plan.ts) are anchored at DEPOSIT time
  // and must not be read here, or a rebalance recomputes the shape but not
  // where it sits.
  const edges = useMemo(
    () =>
      range && anchorBinId !== undefined
        ? binIdsForPlan(range.plan, anchorBinId)
        : null,
    [range, anchorBinId],
  )

  const [sim, setSim] = useState(() =>
    pool && edges
      ? createSim(pool, edges.lowerBinId, edges.upperBinId, amount)
      : null,
  )

  const [jumping, setJumping] = useState(false)
  const jumpTimeout = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    if (!pool || !edges) return
    const id = setInterval(() => {
      setSim((current) =>
        current
          ? step(current, pool, edges.lowerBinId, edges.upperBinId, amount)
          : current,
      )
    }, TICK_MS)
    return () => clearInterval(id)
  }, [pool, edges, amount])

  useEffect(() => () => clearTimeout(jumpTimeout.current), [])

  const state =
    sim && edges
      ? rangeState(sim.activeBinId, edges.lowerBinId, edges.upperBinId)
      : 'calm'

  useConsoleIntent((intent) => {
    if (!pool || !sim || !range || !edges) {
      if (intent === 'B') onBack()
      return
    }
    if (intent === 'B') {
      onWithdraw(summarize(sim))
      return
    }
    if (intent === 'A') {
      if (state === 'out') {
        // recordRebalance is the count S8 prints, and it now means what it
        // says: the range moves to sim.activeBinId in the same press, so the
        // NEXT render is back in range. Before this, the counter went up
        // while the range never moved, which is exactly the "REBALANCED 2x"
        // that implied an action that did not occur (CLAUDE.md rule 2's
        // class of dishonesty). Same shape, new anchor: this crystallises
        // the position around the current price, per PRD.md 8.5's definition
        // of what a rebalance actually is.
        setSim((current) =>
          current ? recordRebalance(current, amount) : current,
        )
        setAnchorBinId(sim.activeBinId)
        onRebalance()
        return
      }
      // The entire mini-game input. PRD.md section 10: hold to jump, kept
      // here as a fixed-length swap, see JUMP_MS above.
      setJumping(true)
      clearTimeout(jumpTimeout.current)
      jumpTimeout.current = setTimeout(() => setJumping(false), JUMP_MS)
      return
    }
    if (intent === 'SELECT') {
      // Walk toward whichever edge is nearer, so repeated presses are always
      // making progress instead of oscillating around the centre.
      const towardLower =
        sim.activeBinId - edges.lowerBinId <= edges.upperBinId - sim.activeBinId
      setSim((current) =>
        current
          ? nudge(current, towardLower ? -1 : 1, NUDGE_BINS_PER_PRESS)
          : current,
      )
    }
  })

  // Gate 2.4. Not a throw, not a spinner: a real panel with a real way out.
  if (!pool || !sim || !range || !edges) {
    return (
      <div className="bg-screen flex h-full w-full flex-col items-center justify-center gap-3 p-4">
        <Panel className="flex flex-col gap-2">
          <PixelText role="title" upper>
            Position not found
          </PixelText>
          <PixelText role="body">
            This pool is not on the current save disk, or it was withdrawn
            already.
          </PixelText>
        </Panel>
        <PixelText role="micro" tone="dim" upper>
          B back
        </PixelText>
      </div>
    )
  }

  const proximity = edgeProximity(
    sim.activeBinId,
    edges.lowerBinId,
    edges.upperBinId,
  )
  const warning = state === 'nad-sense' || state === 'critical'

  /**
   * The character's face is the fastest readout on the screen, so it has to
   * say the same thing the numbers do.
   *
   * `happy` is reserved for the safe middle. It used to be what a reduced
   * motion preference substituted for `run`, which meant the Monanimal could
   * be smiling while price was a bin away from walking off the edge. A motion
   * preference must never change what a screen is saying; the CSS handles
   * reduced motion now by parking the loop, so the frame here is purely a
   * function of where price is.
   */
  const spriteAnimation: SpriteAnimation =
    state === 'out'
      ? 'sit'
      : jumping
        ? 'jump'
        : state === 'calm'
          ? proximity > CONTENT_PROXIMITY
            ? 'happy'
            : 'run'
          : 'alert'

  const lowPrice = priceFromBinId(edges.lowerBinId, pool.binStep)
  const highPrice = priceFromBinId(edges.upperBinId, pool.binStep)
  const nowPrice = priceFromBinId(sim.activeBinId, pool.binStep)

  return (
    /* nad-pulse on the OUTER frame, so the whole screen flinches rather than
       one widget inside it. SCREEN-DETAIL.md 10 asks for the warning to be
       felt, and a border you notice from four metres is the cheapest way to
       say it. Gated behind prefers-reduced-motion in styles.css. */
    <div
      className={`bg-screen flex h-full w-full flex-col gap-1 p-2 ${
        warning ? 'nad-pulse' : ''
      }`}
    >
      {/* Header, on a three column grid so SCORE is genuinely centred rather
          than merely between two things of unequal width.
          CLAUDE.md rule 2: DAMAGE sits at the same visual weight as SCORE. */}
      <div className="grid grid-cols-3 items-baseline">
        <div className="flex items-baseline gap-1">
          <PixelText role="body" upper>
            {pool.tokenX.symbol}/{pool.tokenY.symbol}
          </PixelText>
          {/* Every number here is a simulation over a committed fixture.
              Eight pixels of honesty, gone in Phase 3 with the fixture. */}
          <PixelText role="micro" tone="dim" upper>
            Fixture
          </PixelText>
        </div>

        <div className="flex items-baseline justify-center gap-1">
          <PixelText role="micro" tone="dim" upper>
            Score
          </PixelText>
          <Value amount={sim.feesEarnedUsd} prefix="$" decimals={2} signed />
          {/* A word, not the U+23F8 pause glyph the wireframe draws.
              SCREEN-DETAIL.md is ASCII art and does not know what is in the
              font: Departure Mono is a pixel face with pragmatic coverage,
              and a missing glyph renders as a tofu box next to the headline
              number on the one screen that has to survive a photograph.
              A word also reads from four metres. Gate 2.3. */}
          {state === 'out' ? (
            <PixelText role="micro" tone="loss" upper>
              Paused
            </PixelText>
          ) : null}
        </div>

        <div className="flex items-baseline justify-end gap-1">
          <PixelText role="micro" tone="dim" upper>
            Damage
          </PixelText>
          {/* Not `signed`, because damage is stored positive and is never a
              gain: the tone Value derives from amount<0 would render a green
              +$0.00 at the start of every session. The minus and the loss tone
              are both stated instead. Dropping the tone with the sign would
              leave DAMAGE the same size as SCORE but the same colour as a
              neutral label, which is rule 2 half-kept. */}
          <Value amount={sim.damageUsd} prefix="-$" decimals={2} tone="loss" />
        </div>
      </div>

      {/* The range as numbers, tight under the header. The field draws the
          same two edges as lines; this row is what makes them readable as
          prices rather than as decoration. */}
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-1">
          <PixelText role="micro" tone="dim" upper>
            Range
          </PixelText>
          <PixelText role="micro" className="tabular-nums">
            {price(lowPrice)}
          </PixelText>
          <PixelText role="micro" tone="dim">
            to
          </PixelText>
          <PixelText role="micro" className="tabular-nums">
            {price(highPrice)}
          </PixelText>
        </div>
        <div className="flex items-baseline gap-1">
          <PixelText role="micro" tone="dim" upper>
            Now
          </PixelText>
          <PixelText
            role="micro"
            tone={state === 'out' ? 'loss' : 'ink'}
            className="tabular-nums"
          >
            {price(nowPrice)}
          </PixelText>
        </div>
      </div>

      {/* The screen. Everything above and below is a label on this. */}
      <PriceField
        series={sim.history}
        lowerPrice={lowPrice}
        upperPrice={highPrice}
        width={FIELD_WIDTH}
        height={FIELD_HEIGHT}
        character={characterId}
        animation={spriteAnimation}
        jumping={jumping}
        earning={state !== 'out'}
      />

      {/* The bottom cluster: warning, then instruments, then controls.
          Grouped in its own wrapper with a tighter gap than the screen above
          it, so the three text rows read as one block of chrome and the field
          keeps the space instead of the gaps taking it. */}
      <div className="flex flex-col gap-1">
        {/* ONE banner slot, always in the same place, directly above the
            readings it is warning you about.
            NAD-SENSE used to sit above the field and OUT OF RANGE below it, so
            the two most important messages on the screen taught the player two
            different places to look. The slot is reserved whether or not
            anything is in it: a strip that appeared and disappeared would
            shove the field by its own height at the exact moment price moves. */}
        <div className="h-5 shrink-0">
          {state === 'out' ? (
            /* STATIC, not a marquee. A scrolling line is one line and it is
               the wrong one here: on stage the words OUT OF RANGE would spend
               most of their time off the left edge, and that phrase is the one
               thing the room has to read. Short enough to sit still at 8px
               across 464, including the net-benefit sentence that proves the
               check in PRD.md 8.5 exists. */
            <div className="border-edge bg-alarm flex h-full items-center justify-center overflow-hidden border px-1">
              <PixelText role="body" className="text-center">
                {autopilot
                  ? 'OUT OF RANGE. you stopped earning. not moving: the swap costs more than it earns back.'
                  : 'OUT OF RANGE. you stopped earning. price walked off your ground.'}
              </PixelText>
            </div>
          ) : warning ? (
            <div className="border-edge bg-warn flex h-full items-center justify-center overflow-hidden border px-1">
              <PixelText role="body" className="text-center">
                {`${brand.ALERT_NAME}: price is close to the edge of your range`}
              </PixelText>
            </div>
          ) : null}
        </div>

        {/* Instruments. Always on, in every state: the moment a player most
            needs to know whether autopilot is even on is the moment they are
            out of range, and this row used to be replaced by the alarm.
            Three columns, like the header, so AUTOPILOT is genuinely centred
            rather than parked against whatever the meter's width happens to
            be. Two rows that centre on the same axis read as one instrument
            panel; two rows that merely balance do not. */}
        <div className="grid grid-cols-3 items-center">
          <div className="flex items-center gap-2">
            <PixelText
              role="micro"
              tone={state === 'out' ? 'loss' : 'ink'}
              upper
            >
              {state === 'out' ? 'Out of range' : 'In range'}
            </PixelText>
            <div className="w-16">
              <Meter value={proximity * 100} segments={12} />
            </div>
          </div>
          <PixelText role="micro" className="text-center" upper>
            {brand.AUTOPILOT_NAME} {autopilot ? 'On' : 'Off'}
          </PixelText>
          <PixelText
            role="micro"
            tone="dim"
            className="text-right tabular-nums"
          >
            {duration(sim.elapsedSeconds)}
          </PixelText>
        </div>

        {/* Controls, pinned to the corners. A is jump in range, recentre out
            of range. B always withdraws. PRD.md section 10.
            A real rebalance costs a swap and gas (PRD.md 8.5), so the out of
            range label says so in the same line rather than offering a free
            action. No dollar figure: there is no swap quote path yet, and a
            number this screen made up would be exactly the kind of claim
            rule 1 forbids. */}
        <div className="flex items-center justify-between">
          <PixelText role="micro" upper>
            A {state === 'out' ? 'Recentre, costs a swap' : 'Jump'}
          </PixelText>
          <PixelText role="micro" upper>
            B Withdraw
          </PixelText>
        </div>
      </div>
    </div>
  )
}
