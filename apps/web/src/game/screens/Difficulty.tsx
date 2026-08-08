import { useEffect, useState } from 'react'
import { useConsoleIntent } from '../../console/useConsoleInput'
import { characters } from '../../config/brand'
import { fixtureGates, passingCount, scoredPools } from '../fixtures'
import { ageInDays, compactUsd } from '../../lib/format'
import { GodModeGate } from '../GodModeGate'
import { Meter, PixelText, Row, Sprite, Toggle } from '../../ui'
import type { CharacterId } from '../../config/brand'
import type { Difficulty as DifficultyTier, GateSet } from '../../types/domain'

/**
 * S4, the difficulty select. SCREEN-DETAIL.md section 7.
 *
 * A component, not a route, exactly like `InRange` and `PoolTracker`: it
 * takes the already-chosen difficulty and GOD MODE flag plus four callbacks,
 * and knows nothing about `useSession` or `useNavigate`.
 */
export interface DifficultyProps {
  difficulty: DifficultyTier
  godMode: boolean
  onChange: (difficulty: DifficultyTier) => void
  onConfirm: (difficulty: DifficultyTier, godMode: boolean) => void
  onBack: () => void
}

/** The Monanimal tied to each tier. Duplicated from the route files rather
 * than shared: PRD.md 7.6, the binding is fixed, and three lines derived from
 * a three-entry union is not worth a shared module across four call sites. */
const CHARACTER_BY_DIFFICULTY: Record<DifficultyTier, CharacterId> = {
  easy: 'molandak',
  normal: 'moyaki',
  hard: 'mouch',
}

const TIER_ORDER: ReadonlyArray<DifficultyTier> = ['easy', 'normal', 'hard']

/**
 * Not one word of jargon. SCREEN-DETAIL.md section 7: "deep pools only", not
 * "minimum TVL 250,000 USD". A keyed table rather than three ternaries in the
 * JSX below, so a new tier or a copy edit touches one object and not a
 * branch tree.
 */
const DESCRIPTIONS: Record<DifficultyTier, { tagline: string; body: string }> =
  {
    easy: {
      tagline: 'MOLANDAK curls up when things get scary.',
      body: 'deep pools only. been around a while. paired with money you know.',
    },
    normal: {
      tagline: 'MOYAKI rides the current and stays balanced.',
      body: 'solid pools, not brand new, paired with money people trust.',
    },
    hard: {
      tagline: 'MOUCH is a prankster who loves the chaos.',
      body: 'looser rules. newer pools allowed. still avoids junk pairs.',
    },
  }

/** Every pool in the fixture, regardless of difficulty: `scoredPools` always
 * returns the full snapshot with a `passes` flag per pool, so the count is
 * the same array length whichever tier is asked. This is the denominator
 * for the strip below; "14 pools passed" with nothing to divide it by is not
 * evidence of a filter doing work, it is a number with no shape. */
const TOTAL_POOLS = scoredPools('easy').length

/**
 * S4's live gate readout. Every number is read from `fixtureGates`, never
 * typed as a literal: PRD.md 7.4 says this table drifted from the code once
 * already, and a screen that reads the config instead of copying it cannot
 * drift again.
 *
 * SAFETY is here and `minHeat` is not, and the difference is not stylistic.
 * `minSafety` is LIVE: gates.ts checks `score.safety < gates.minSafety` and
 * every tier's floor is reachable, so a readout that claims to show "the
 * filter this tier applies" while hiding a gate that actually rejects pools
 * is making a claim it does not keep. `minHeat` is 0 at every tier, so no
 * pool can fail it; drawing it as a satisfied check would be theatre.
 * BUILD-PLAN.md's S5 open item 2 tracks it, and it becomes a row here the
 * day a tier wants a floor.
 *
 * SAFETY and HEAT are named product concepts the player meets on S5, which
 * is what makes them admissible on a screen whose rule is no jargon. The
 * field names they come from are not.
 */
function gateRows(gates: GateSet): Array<{ label: string; value: string }> {
  return [
    { label: 'Pools deeper than', value: compactUsd(gates.minTvlUsd) },
    { label: 'Older than', value: ageInDays(gates.minAgeSeconds) },
    { label: 'Paired with', value: gates.allowedQuoteSymbols.join(', ') },
    { label: 'Safety at least', value: `${gates.minSafety}` },
    { label: 'Calmer than', value: `${gates.maxHeat} heat` },
  ]
}

/** Which row on the D-pad currently has focus. GOD MODE is only reachable
 * from HARD, so `godmode` is not a state the other two tiers can enter. */
type Focus = 'tier' | 'godmode'

export function Difficulty({
  difficulty,
  godMode,
  onChange,
  onConfirm,
  onBack,
}: DifficultyProps) {
  const [focus, setFocus] = useState<Focus>('tier')
  // GOD MODE is a local commitment, not the session's live value: nothing in
  // this screen's props lets it push a change back except the final
  // onConfirm, exactly like `amount` and `width` are S6's business and never
  // reported mid-screen. Seeded once from the prop so re-entering the screen
  // with GOD MODE already chosen shows it chosen.
  const [godModeOn, setGodModeOn] = useState(godMode)
  const [overlayOpen, setOverlayOpen] = useState(false)

  // GOD MODE cannot survive a downgrade off HARD. `session.ts`'s
  // `chooseDifficulty` enforces the same rule at the store; this is the
  // screen's own copy of it so the toggle never shows ON under a tier it is
  // not a modifier of.
  useEffect(() => {
    if (difficulty !== 'hard') {
      setFocus('tier')
      setGodModeOn(false)
    }
  }, [difficulty])

  const gates = fixtureGates(difficulty)
  const description = DESCRIPTIONS[difficulty]

  function activateGodMode() {
    setFocus('godmode')
    if (difficulty !== 'hard') return
    if (godModeOn) {
      // Turning it back OFF needs no ceremony. The gate exists to make
      // turning it ON deliberate; leaving is never the dangerous direction.
      setGodModeOn(false)
    } else {
      setOverlayOpen(true)
    }
  }

  useConsoleIntent((intent) => {
    // The overlay has its own subscriber and its own B and A meanings. Both
    // handlers fire on every intent (the input store fans out to every
    // subscriber, ARCHITECTURE.md), so this screen has to go silent while
    // the overlay is open or B would erase a letter AND back out of S4 on
    // the same keypress.
    if (overlayOpen) return

    if (intent === 'B') {
      onBack()
      return
    }
    if (intent === 'A') {
      if (focus === 'godmode') {
        activateGodMode()
        return
      }
      onConfirm(difficulty, godModeOn)
      return
    }
    if (intent === 'LEFT' || intent === 'RIGHT') {
      if (focus !== 'tier') return
      // No wrap. Three items that wrap feel broken, and RIGHT at HARD or
      // LEFT at EASY has nowhere honest to go.
      const index = TIER_ORDER.indexOf(difficulty)
      const nextIndex = intent === 'RIGHT' ? index + 1 : index - 1
      if (nextIndex >= 0 && nextIndex < TIER_ORDER.length) {
        onChange(TIER_ORDER[nextIndex])
      }
      return
    }
    if (intent === 'UP' || intent === 'DOWN') {
      // Nothing to focus outside HARD, so the row shows why instead of the
      // console pretending the press did something.
      if (difficulty !== 'hard') return
      setFocus((current) => (current === 'tier' ? 'godmode' : 'tier'))
    }
  })

  return (
    /* gap-1, not gap-2. Six gaps at 8px is 48px of a 320px viewport spent on
       nothing, and this screen carries a 64px sprite row, a description, a
       five row gate readout, a count strip, and a control row. The viewport
       clips silently at 320, so a gap that is merely generous is a footer
       nobody ever sees. */
    <div className="bg-screen relative flex h-full w-full flex-col gap-1 p-2">
      <PixelText role="title" upper>
        Choose your Monanimal
      </PixelText>

      {/* The three characters. The selected one is the biggest thing on the
          screen at 64px; the other two are 32, `Sprite`'s only other allowed
          size. That size jump, not a ring, is what reads as "this one is
          chosen" from across a phone screen. */}
      <div className="flex items-end justify-between gap-1">
        {TIER_ORDER.map((tier) => {
          const characterId = CHARACTER_BY_DIFFICULTY[tier]
          const character = characters[characterId]
          const selected = tier === difficulty
          return (
            <div key={tier} className="flex flex-1 flex-col items-center gap-1">
              <Sprite
                character={characterId}
                animation="idle"
                size={selected ? 64 : 32}
              />
              {/* The accent fill sits on the label cell, never behind the
                  art: the cast and the interface accent are the same purple
                  (`ui/motion.tsx`'s Sprite comment, DESIGN-SYSTEM.md 4.5),
                  so a sprite drawn on an accent fill would vanish into it. */}
              {/* Name and tier share one line. Stacked, they cost a second
                  row on the tallest block of the screen to separate two words
                  that are read as one label anyway ("MOLANDAK, the easy one"),
                  and the tier already gets a column of its own in the count
                  strip below. */}
              <div
                className={`flex items-baseline gap-1 px-2 py-1 ${
                  selected ? 'bg-accent' : ''
                }`}
              >
                <PixelText role="body" tone={selected ? 'invert' : 'ink'} upper>
                  {character.label}
                </PixelText>
                <PixelText
                  role="micro"
                  tone={selected ? 'invert' : 'dim'}
                  upper
                >
                  {character.tier}
                </PixelText>
              </div>
            </div>
          )
        })}
      </div>

      {/* The description. Plain sentences, no jargon, from the keyed table
          above so a new tier is a data edit and not a JSX branch. */}
      <div className="border-edge bg-panel flex flex-col border p-1">
        <PixelText role="body">{description.tagline}</PixelText>
        <PixelText role="micro" tone="dim">
          {description.body}
        </PixelText>
      </div>

      {/* THE LIVE GATE READOUT. Every value is `fixtureGates(difficulty)`
          read back onto the screen, never a literal: tune `thresholds.ts`
          and this table moves with it.

          No gap between rows. Five 12px lines stacked flush read as a table,
          which is what they are, and 4px of air between each would spend 16px
          separating rows that a right-aligned value column already separates. */}
      <div className="border-edge bg-sunk flex flex-col border p-1">
        {gateRows(gates).map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-2"
          >
            <PixelText role="micro" tone="dim" upper>
              {row.label}
            </PixelText>
            <PixelText role="micro" className="tabular-nums" upper>
              {row.value}
            </PixelText>
          </div>
        ))}
      </div>

      {/* THE THREE-TIER COUNT STRIP. Live proof the filter is doing work
          right now, for every tier at once, without three columns of prose
          fighting each other at 412px.

          One row per tier, not a stack: the label, the meter, and the count
          all sit on a single 12px baseline, because a 5-segment meter is 8px
          tall and giving it a row of its own would triple the strip's height
          to say nothing more. */}
      <div className="flex items-center justify-between gap-2">
        {TIER_ORDER.map((tier) => {
          const passing = passingCount(tier, false)
          const selected = tier === difficulty
          return (
            <div key={tier} className="flex flex-1 items-center gap-1">
              <PixelText role="micro" tone={selected ? 'ink' : 'dim'} upper>
                {characters[CHARACTER_BY_DIFFICULTY[tier]].tier}
              </PixelText>
              <Meter value={passing} max={TOTAL_POOLS} segments={5} />
              {/* The denominator is not decoration. "14 pools passed" with
                  nothing to divide it by is a number with no shape; "14 of
                  24" is evidence a filter rejected ten. */}
              <PixelText role="micro" tone="dim" className="tabular-nums">
                {passing} of {TOTAL_POOLS}
              </PixelText>
            </div>
          )
        })}
      </div>

      {/* GOD MODE. A modifier on HARD, never a fourth tier: disabled and
          dimmed on the other two, with the reason printed next to it rather
          than left for the player to guess. */}
      <Row
        selected={focus === 'godmode'}
        disabled={difficulty !== 'hard'}
        onSelect={activateGodMode}
      >
        <Toggle on={godModeOn} label="God mode" />
        <PixelText role="micro" tone="dim" upper>
          hard only
        </PixelText>
      </Row>

      {/* Footer, pinned to the bottom edge whatever the content above it did.
          The console owns the key legend (BUILD-PLAN.md's S5 lesson: this
          screen names the BUTTON, never the key it happens to be bound to on
          a keyboard). */}
      <div className="mt-auto flex items-center justify-between">
        {/* U+25C4 and U+25BA, not U+25C0 and U+25B6. Departure Mono maps
            1079 codepoints and the pointing-triangle pair is not among them,
            so the obvious glyphs render as two tofu boxes on the first row a
            player reads. Checked against the font file, not assumed. */}
        <PixelText role="micro" upper>
          {'◄►'} Select
        </PixelText>
        <PixelText role="micro" upper>
          A Confirm
        </PixelText>
        <PixelText role="micro" upper>
          B Back
        </PixelText>
      </div>

      {overlayOpen ? (
        <div className="absolute inset-0">
          <GodModeGate
            onConfirm={() => {
              setGodModeOn(true)
              setOverlayOpen(false)
            }}
            onCancel={() => setOverlayOpen(false)}
          />
        </div>
      ) : null}
    </div>
  )
}
