import { useEffect, useMemo, useState } from 'react'
import { useConsoleIntent } from '../console/useConsoleInput'
import { PixelText } from '../ui'

export interface GodModeGateProps {
  onConfirm: () => void
  onCancel: () => void
}

/**
 * The word a player spells to enter GOD MODE. Five letters, the space
 * dropped: the console has no keyboard, so "I KNOW" survives as five
 * deliberate choices instead of nine keystrokes typed against a QWERTY that
 * does not exist here.
 */
const WORD = ['I', 'K', 'N', 'O', 'W'] as const

/**
 * Every letter that can stand in as a decoy. I, K, N, O, W are excluded so a
 * decoy at one position is never the letter a different position actually
 * needs, which would let an earlier wrong guess double as a hint later.
 */
const DECOYS = [
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'J',
  'L',
  'M',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'X',
  'Y',
  'Z',
] as const

/**
 * Four of the six orderings of three items, chosen by hand rather than all
 * six.
 *
 * The excluded two, [0,1,2] and [0,2,1], are the only ones that would put the
 * correct letter in the FIRST slot. Highlight always resets to slot 0 on a
 * new position (see the effect below), so if the correct answer could ever
 * land there, mashing A without ever pressing LEFT or RIGHT would spell part
 * of the word by accident. Restricting the rotation to these four is what
 * makes "look, then choose" the only way through, not a lucky default.
 */
const PERMUTATIONS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
]

/**
 * The three candidates for one position of the word: the real letter and two
 * decoys, in a fixed shuffle.
 *
 * Pure in `position` alone, seeded by it rather than by `Math.random()` at
 * render time. A reel that reshuffled on every render would be untestable
 * (the "right" button would not stay the right button between an assertion
 * and the click that follows it) and unusable (a player who spotted the
 * correct letter would watch it jump to a different slot the moment any
 * state changed). Keying the order off the position also means returning to
 * a position, by pressing B to erase forward of it, shows the exact layout
 * it showed the first time.
 */
function candidatesFor(position: number): readonly [string, string, string] {
  const correct = WORD[position]
  const decoyA = DECOYS[(position * 7) % DECOYS.length]
  const decoyB = DECOYS[(position * 13 + 5) % DECOYS.length]
  const order = PERMUTATIONS[position % PERMUTATIONS.length]
  const items = [correct, decoyA, decoyB]
  return [items[order[0]], items[order[1]], items[order[2]]]
}

/**
 * GOD MODE's confirmation. SCREEN-DETAIL.md's GOD MODE subsection.
 *
 * The wireframe says `TYPE " I KNOW " TO CONTINUE`, and this console has no
 * keyboard. A letter reel keeps what the typed gate was actually for, five
 * deliberate correct choices standing between an accidental button press and
 * the honeypot check becoming the only safety net left, without needing a
 * QWERTY to do it. CLAUDE.md rule 6: that check is never disabled, including
 * here, and the last line on this screen says so before the player agrees to
 * anything.
 */
export function GodModeGate({ onConfirm, onCancel }: GodModeGateProps) {
  const [word, setWord] = useState<Array<string>>([])
  const [highlight, setHighlight] = useState(0)
  const [rejected, setRejected] = useState(false)

  const position = word.length
  const candidates = useMemo(() => candidatesFor(position), [position])

  // A fresh position always starts on slot 0. Carrying the previous highlight
  // forward would sometimes land on a decoy for free by inheriting whichever
  // slot the last correct pick happened to sit in.
  useEffect(() => setHighlight(0), [position])

  function attempt(letter: string) {
    if (letter !== WORD[position]) {
      // Rejected, not ignored: the position holds and the screen says so,
      // rather than the press quietly doing nothing and leaving the player
      // to guess whether it registered at all.
      setRejected(true)
      return
    }
    setRejected(false)
    const next = [...word, letter]
    if (next.length === WORD.length) {
      // The only thing that fires onConfirm. Five correct picks, never one.
      onConfirm()
      return
    }
    setWord(next)
  }

  useConsoleIntent((intent) => {
    if (intent === 'LEFT') {
      setHighlight((i) => (i + candidates.length - 1) % candidates.length)
      setRejected(false)
      return
    }
    if (intent === 'RIGHT') {
      setHighlight((i) => (i + 1) % candidates.length)
      setRejected(false)
      return
    }
    if (intent === 'A') {
      attempt(candidates[highlight])
      return
    }
    if (intent === 'B') {
      if (word.length === 0) {
        onCancel()
        return
      }
      setWord((w) => w.slice(0, -1))
      setRejected(false)
    }
  })

  const progress = WORD.map((_, i) => word[i] ?? '_').join(' ')

  return (
    /* bg-alarm, and every PixelText below at its default `ink` tone rather
       than `invert`: --color-ink and --color-alarm-ink are the same hex
       value, so the default tone IS the documented "never white" pairing for
       text on this surface. InRange's OUT OF RANGE banner leans on the same
       identity for the same reason; this screen just does it full bleed. */
    <div className="bg-alarm flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
      {/* A dagger, not the skull the wireframe draws. Departure Mono maps
          1079 codepoints and U+2620 SKULL AND CROSSBONES is not one of them,
          nor is U+26A0 WARNING SIGN: both render as a tofu box, and a tofu
          box on the loudest screen in the product reads as a broken build
          rather than as menace. U+2020 is in the font and was checked, not
          assumed. Same lesson as the pause glyph in InRange.tsx. */}
      <PixelText role="title" upper>
        {'†'}&nbsp;&nbsp;G O D&nbsp;&nbsp;M O D E&nbsp;&nbsp;{'†'}
      </PixelText>

      <div className="flex flex-col gap-1">
        <PixelText role="body">every filter is off.</PixelText>
        <PixelText role="body">no minimum liquidity. no minimum age.</PixelText>
        <PixelText role="body">no safety score. no ranking. no help.</PixelText>
      </div>

      <PixelText role="body">
        the only check left is whether you can sell.
      </PixelText>

      <div className="mt-2 flex flex-col items-center gap-1">
        <PixelText role="micro" upper>
          spell it: I K N O W
        </PixelText>
        <PixelText role="value" className="tabular-nums">
          &gt; {progress}
        </PixelText>

        {/* Tappable and D-pad reachable for the same reason S5's zoom buttons
            are both: a click here does exactly what LEFT/RIGHT-then-A does,
            select and commit in one step, so it adds no action the D-pad
            cannot already reach on its own. */}
        <div className="mt-1 flex gap-2">
          {candidates.map((letter, index) => {
            const isHighlighted = index === highlight
            return (
              <button
                key={`${position}-${index}`}
                type="button"
                aria-pressed={isHighlighted}
                onClick={() => {
                  setHighlight(index)
                  attempt(letter)
                }}
                className={`pressable border-edge flex h-8 w-8 items-center justify-center border ${
                  isHighlighted ? 'bg-ink' : 'bg-loss'
                }`}
              >
                <PixelText role="value" tone="invert">
                  {letter}
                </PixelText>
              </button>
            )
          })}
        </div>

        {rejected ? (
          <PixelText role="micro" upper>
            not that one. try again.
          </PixelText>
        ) : null}
      </div>
    </div>
  )
}
