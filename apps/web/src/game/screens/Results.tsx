import { useConsoleIntent } from '../../console/useConsoleInput'
import { characters } from '../../config/brand'
import { duration, pct } from '../../lib/format'
import { Dialog, Meter, Panel, PixelText, Sprite, Value } from '../../ui'
import type { SpriteAnimation } from '../../ui'
import type { CharacterId } from '../../config/brand'
import type { RunSummary } from '../sim'
import type { Pool } from '../../types/domain'

/**
 * Above this `timeInRangePct`, a run reads as genuinely well flown rather
 * than merely lucky. Set closer to the top than the middle on purpose: 50
 * is a coin flip, and a coin flip is exactly the run this screen has to be
 * honest is not the same thing as skill (the "scrappy" line below exists
 * for that run).
 */
const STRONG_TIME_IN_RANGE_PCT = 60

/**
 * One outcome bucket drives both the sprite's face and the line it says.
 *
 * CLAUDE.md's S7 lesson was that a motion preference could make the
 * Monanimal smile while the player was losing. The fix there was making the
 * face a pure function of the numbers; the fix here is making the face and
 * the WORDS a pure function of the SAME three-way value, so a future edit to
 * one cannot drift from the other the way two separate ternaries could.
 */
type Outcome = 'strong' | 'scrappy' | 'negative'

function outcomeFor(run: RunSummary): Outcome {
  if (run.netUsd < 0) return 'negative'
  return run.timeInRangePct > STRONG_TIME_IN_RANGE_PCT ? 'strong' : 'scrappy'
}

const ANIMATION_BY_OUTCOME: Record<Outcome, SpriteAnimation> = {
  strong: 'happy',
  scrappy: 'idle',
  negative: 'sit',
}

/**
 * Never scolding, never congratulating luck as if it were skill. The
 * "scrappy" line says the quiet part out loud instead of pretending net
 * positive always means the player did something right.
 */
const LINE_BY_OUTCOME: Record<Outcome, string> = {
  strong: 'you stayed on your feet. that is the whole job.',
  scrappy:
    'you came out ahead. you were also lucky. those are different things.',
  negative:
    'price walked off your ground. that happens. the range was the bet.',
}

export interface ResultsProps {
  /** Undefined is a render state, never a throw. Gate 2.4. */
  pool: Pool | undefined
  /** Null when there is no finished run to report. Also a render state. */
  run: RunSummary | null
  characterId: CharacterId
  /**
   * Accepted and deliberately NOT rendered. See the rebalance line below: this
   * is the setting, not a record of who moved the range, and the screen must
   * report the second thing. Kept on the props so the route and the tests do
   * not churn when autopilot becomes real and earns its own counter.
   */
  autopilot: boolean
  /**
   * What the chain knows, as a state machine rather than three booleans.
   *
   * The route owns the request; this screen only renders what came back.
   * `failed` is a first-class state and not an exception, because the whole
   * point of the endpoint answering 200 with a reason is that a screen can
   * show the reason instead of breaking. Gate 2.4.
   */
  save: SaveState
  /** Fires on SELECT. The screen guards against a second press itself. */
  onSaveRun: () => void
  onBackToDisks: () => void
}

/**
 * Whether this run has reached the chain, and what to say about it.
 *
 * `saved` carries the signer because the honest sentence names it. The app's
 * keeper key signs; the player has no wallet in this build and signs nothing.
 * A screen that shows a transaction hash without saying whose key made it is
 * implying the player's wallet did, which is a claim rule 1 forbids.
 */
export type SaveState =
  | { status: 'idle' }
  | { status: 'saving' }
  | {
      status: 'saved'
      txHash: string
      confirmed: boolean
      signer: string
      explorerUrl: string | null
    }
  | { status: 'failed'; reason: string }

/**
 * S8, the results screen. SCREEN-DETAIL.md section 11.
 *
 * A component, not a route: same shape as InRange, testable with
 * `renderScreen` and a keypress instead of a router. ARCHITECTURE.md 2.1.
 */
export function Results({
  pool,
  run,
  characterId,
  save,
  onSaveRun,
  onBackToDisks,
}: ResultsProps) {
  useConsoleIntent((intent) => {
    // B repeats A on purpose. A back button that does nothing on the last
    // screen of a flow is a dead end, and S8 is the last screen of the flow.
    if (intent === 'A' || intent === 'B') {
      onBackToDisks()
      return
    }
    if (intent === 'SELECT') {
      // SELECT used to fire a documented no-op share. It writes the run to
      // DiskRegistry now, which is a real action with a real cost, so the
      // guard below matters: pressing it twice must not send twice, and
      // pressing it while writing is off must not pretend to do anything.
      if (save.status === 'idle' || save.status === 'failed') onSaveRun()
    }
  })

  if (!run) {
    return (
      <div className="bg-screen flex h-full w-full flex-col items-center justify-center gap-3 p-4">
        <Panel className="flex flex-col gap-2">
          <PixelText role="title" upper>
            No session to report
          </PixelText>
          <PixelText role="body">
            Nothing has finished yet. Play a round and come back.
          </PixelText>
        </Panel>
        <PixelText role="micro" tone="dim" upper>
          A back to disks
        </PixelText>
      </div>
    )
  }

  if (!pool) {
    return (
      <div className="bg-screen flex h-full w-full flex-col items-center justify-center gap-3 p-4">
        <Panel className="flex flex-col gap-2">
          <PixelText role="title" upper>
            Pool not found
          </PixelText>
          <PixelText role="body">
            This pool is not on the current save disk. The run still happened,
            its numbers are just not shown here.
          </PixelText>
        </Panel>
        <PixelText role="micro" tone="dim" upper>
          A back to disks
        </PixelText>
      </div>
    )
  }

  const outcome = outcomeFor(run)
  const spriteAnimation = ANIMATION_BY_OUTCOME[outcome]

  return (
    <div className="bg-screen flex h-full w-full flex-col gap-1 p-2">
      {/* Title band. One row, not two: stacking SESSION OVER over the pair
          tag costs a whole extra title-role line height (24px) this screen
          does not have to spare, and reading them left to right loses
          nothing a beginner needs. */}
      <div className="flex items-baseline justify-center gap-2">
        <PixelText role="title" upper>
          Session over
        </PixelText>
        <PixelText role="micro" tone="dim" upper>
          {pool.tokenX.symbol}/{pool.tokenY.symbol}
        </PixelText>
        <PixelText role="micro" tone="dim" upper>
          Fixture
        </PixelText>
      </div>

      {/* The Monanimal and the money block share a row.
          SCREEN-DETAIL.md 11 draws them stacked, but that ASCII art was not
          drawn against a real 320px height budget: a 64px sprite plus its
          name, the three-row money panel, the instrument block, and the
          Dialog line do not all fit full width and stacked without something
          getting clipped by .viewport's overflow:hidden. Side by side here
          is what buys the room for the block that actually carries rule 2. */}
      <div className="grid grid-cols-[96px_1fr] items-start gap-2">
        <div className="flex flex-col items-center gap-1">
          <Sprite
            character={characterId}
            animation={spriteAnimation}
            scale={1}
            size={64}
          />
          <PixelText role="micro" tone="dim" upper>
            {characters[characterId].label}
          </PixelText>
        </div>

        <Panel flush className="flex flex-col gap-1 p-1">
          <div className="flex items-baseline justify-between">
            <PixelText role="body" upper>
              Fees earned
            </PixelText>
            <Value
              amount={run.feesEarnedUsd}
              prefix="+$"
              decimals={2}
              tone="gain"
            />
          </div>
          <div className="flex items-baseline justify-between">
            <PixelText role="body" upper>
              Damage taken
            </PixelText>
            {/* Not `signed`, same reasoning as InRange.tsx: damageUsd is
                stored positive and is never a gain, so `signed` would render
                a green +$0.00 the moment a session ends without a loss. The
                minus and the loss tone are stated explicitly instead, which
                is the only way DAMAGE keeps SCORE's size without also losing
                rule 2's colour. This row is the whole reason S8 exists. */}
            <Value
              amount={run.damageUsd}
              prefix="-$"
              decimals={2}
              tone="loss"
            />
          </div>
          <div className="border-edge border-t" />
          <div className="flex items-baseline justify-between">
            <PixelText role="body" upper>
              Net
            </PixelText>
            {/* The one row on this screen allowed to be `signed`: NET can
                actually land on either side, so its glyph has to be derived
                from the amount rather than asserted by a hardcoded prefix
                like the two rows above it. `role="hero"` because
                tokens.css marks --text-hero for exactly this: "boot,
                results, score". Largest thing on the screen, on purpose. */}
            <Value
              amount={run.netUsd}
              prefix="$"
              decimals={2}
              signed
              role="hero"
            />
          </div>
        </Panel>
      </div>

      {/* Instrument block. Time in range gets a body-weight row and its own
          Meter, both bigger than the two rows under them: SCREEN-DETAIL.md
          11 calls it "the real score" because it is the only number here
          that measures a skill rather than a deposit size, and a
          profit-ranked leaderboard would just reward whoever put in most. */}
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline justify-between">
          <PixelText role="body" upper>
            Time in range
          </PixelText>
          <PixelText role="body" className="tabular-nums">
            {pct(run.timeInRangePct, 0)}
          </PixelText>
        </div>
        <Meter value={run.timeInRangePct} />
        <PixelText role="micro" tone="dim">
          the roadmap leaderboard ranks on this, not on profit.
        </PixelText>
        <div className="grid grid-cols-2">
          <PixelText role="micro" upper>
            {/* Always "Rebalanced", never the autopilot name.
                `run.rebalances` is written by one function, `recordRebalance`
                in sim.ts, and that function has exactly one caller: the A
                keypress branch in InRange.tsx. Nothing in this repo fires
                autopilot. Keying the label off the autopilot SETTING credited a
                machine for presses the player made with their own thumb, and
                worse: with autopilot on, S7's alarm banner says "not moving:
                the swap costs more than it earns back" and then this screen
                claimed it moved twice. Two screens contradicting each other in
                front of someone who watched the presses.
                When autopilot is real it gets its own counter in RunSummary,
                and this line branches on that counter, not on a checkbox. */}
            Rebalanced {run.rebalances}x
          </PixelText>
          {/* SCREEN-DETAIL.md 11 draws "BEST RUN   412 m", but there is no
              distance anywhere in sim.ts, only elapsed seconds and streak
              length: the wireframe's unit belongs to a runner mini-game,
              not this one. Printing a metres figure here would be inventing
              a number on the one screen whose entire job is refusing to do
              that, so this prints the longest unbroken in-range streak as a
              time instead. */}
          <PixelText
            role="micro"
            tone="dim"
            className="text-right tabular-nums"
            upper
          >
            Best run {duration(run.bestStreakSeconds)}
          </PixelText>
        </div>
      </div>

      {/* The line, keyed on the same `outcome` the sprite animation reads
          above, so the face and the words can never tell two different
          stories about one run. */}
      {/* No portrait. Dialog's portrait well is a fixed 64px square, and the
          same character is already on screen at 64px twenty pixels above it:
          a second copy of one Monanimal is redundancy, not richness, and it
          costs a fifth of the remaining height budget to say nothing new. */}
      <Dialog speaker={characters[characterId].label}>
        {LINE_BY_OUTCOME[outcome]}
      </Dialog>

      {/* What the chain knows about this run, and who told it.
          One line, only after something has actually happened, so an idle
          screen spends no height on it. `signer` is printed on purpose: the
          keeper signed, not the player, and a screen that leaves that out is
          making a bigger claim than the build can support. Rule 1. */}
      {save.status !== 'idle' ? (
        <PixelText
          role="micro"
          tone={save.status === 'failed' ? 'loss' : 'dim'}
          upper
        >
          {save.status === 'saving' ? 'Writing to Monad...' : null}
          {save.status === 'saved'
            ? `Onchain ${save.confirmed ? 'confirmed' : 'sent'} ${save.txHash.slice(0, 10)} signed by keeper ${save.signer.slice(0, 6)}`
            : null}
          {save.status === 'failed' ? `Not written: ${save.reason}` : null}
        </PixelText>
      ) : null}

      {/* Footer, pinned to the bottom whatever the block above it needed.
          The SELECT label rewrites itself to name the action it will actually
          perform, which is the licence a context-dependent key needs. */}
      <div className="mt-auto flex items-center justify-between">
        <PixelText role="micro" upper>
          A back to disks
        </PixelText>
        <PixelText
          role="micro"
          tone={save.status === 'idle' ? 'ink' : 'dim'}
          upper
        >
          {save.status === 'idle' ? 'Select save to chain' : null}
          {save.status === 'saving' ? 'Saving...' : null}
          {save.status === 'saved' ? 'Saved' : null}
          {save.status === 'failed' ? 'Select retry' : null}
        </PixelText>
      </div>
    </div>
  )
}
