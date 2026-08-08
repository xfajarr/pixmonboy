import { useConsoleIntent } from '../../console/useConsoleInput'
import { brand } from '../../config/brand'
import { Meter, Panel, PixelText } from '../../ui'

/**
 * What the top-up is doing right now.
 *
 * Same shape as `Results`'s `SaveState` and for the same reason: the faucet
 * endpoint answers 200 whether it funded, refused, or is switched off, so there
 * is no error path to throw and every outcome is a state this screen draws.
 * Gate 2.4 — a spinner is not a terminal state.
 */
export type TopUpState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'sending' }
  | {
      status: 'funded'
      amountMon: string
      txHash: string
      explorerUrl: string | null
    }
  | { status: 'already' }
  | { status: 'unavailable'; reason: string }

export interface TopUpProps {
  /** The embedded wallet's address. Null before Privy has one. */
  cardAddress: string | null
  /** Native balance in MON, or null while it has never been read. */
  balanceMon: number | null
  /** What one press of the button will send, e.g. "0.05". */
  dripMon: string
  state: TopUpState
  onTopUp: () => void
  onContinue: () => void
}

/**
 * Below this the wallet cannot pay for its own first transaction.
 *
 * Mirrors `NEEDS_GAS_BELOW_MON` in apps/api/src/modules/faucet/service.ts. It
 * is duplicated rather than imported because the API's copy is the one that
 * DECIDES and this one only decides what to SAY: a screen that reads a
 * server-side constant would still be guessing, and a screen that guesses
 * differently from the server is worse than one that admits it is asking.
 */
const LOW_BALANCE_MON = 0.02

/**
 * `0.05123` becomes `0.0512`. Three significant figures is enough to tell a
 * funded wallet from an empty one, and a wallet balance rendered to eighteen
 * decimals is the exact intimidating artifact this product removes.
 */
function shortMon(amount: number): string {
  if (amount === 0) return '0'
  return String(Number(amount.toPrecision(3)))
}

/** `0x7a2b...3c3f` becomes `0x7a..3f`, the same truncation S1 uses. */
function shortAddress(address: string): string {
  return `${address.slice(0, 4)}..${address.slice(-2)}`
}

/**
 * TOP UP. The screen that makes a fresh memory card able to do anything.
 *
 * WHY THIS SCREEN HAS TO EXIST
 *
 * On EVM the sender pays. A Privy embedded wallet is minted with a zero
 * balance, so the moment after a player signs in with Google they own an
 * account that cannot send a single transaction. Every other screen in this
 * product would work and the first write would fail, which is the worst
 * possible place to discover it.
 *
 * THE VOCABULARY RULE STILL HOLDS
 *
 * S1 removes the words "wallet", "connect" and "seed phrase". This screen is
 * where "gas" would normally appear, and it does not: the card needs POWER, the
 * console TOPS IT UP, and the number next to it is a balance the way any
 * handheld shows a battery. `brand.WALLET_UNIT` keeps the noun in one place.
 * A test fails if the forbidden words appear here.
 *
 * WHAT IT REFUSES TO PRETEND
 *
 * The faucet can be off (no keeper key, wrong chain, budget spent) and the
 * screen says so in the server's own words rather than retrying into a wall.
 * `onContinue` is always available, because a player who cannot be funded can
 * still play the whole game — nothing before the deposit needs a funded wallet,
 * and blocking them here would trade a working demo for a broken one.
 */
export function TopUp({
  cardAddress,
  balanceMon,
  dripMon,
  state,
  onTopUp,
  onContinue,
}: TopUpProps) {
  const busy = state.status === 'checking' || state.status === 'sending'
  const funded = state.status === 'funded'
  const low = balanceMon !== null && balanceMon < LOW_BALANCE_MON

  useConsoleIntent((intent) => {
    if (intent === 'B') {
      onContinue()
      return
    }
    if (intent === 'A' && !busy && !funded) onTopUp()
    else if (intent === 'A' && funded) onContinue()
  })

  return (
    <div className="bg-screen flex h-full w-full flex-col gap-2 p-2">
      <div className="flex items-baseline justify-between">
        <PixelText role="body" upper>
          Power up {brand.WALLET_UNIT}
        </PixelText>
        {cardAddress ? (
          <PixelText role="micro" tone="dim" upper>
            {shortAddress(cardAddress)}
          </PixelText>
        ) : null}
      </div>

      {/* The battery. The largest thing on the screen because it is the thing
          the screen is about, and a meter rather than a number because a bar
          at one segment reads as "nearly empty" to someone who has never seen
          a balance before. */}
      <Panel className="flex flex-1 flex-col justify-center gap-2">
        <div className="flex items-baseline justify-between">
          <PixelText role="micro" tone="dim" upper>
            Charge
          </PixelText>
          <PixelText role="title" className="tabular-nums">
            {balanceMon === null ? '--' : shortMon(balanceMon)}
          </PixelText>
        </div>

        {/* Full at four times the low-water mark, so a topped-up card reads as
            comfortably full rather than pinned at the maximum. The meter is a
            feeling, and the number above it is the fact. */}
        <Meter
          value={Math.min(balanceMon ?? 0, LOW_BALANCE_MON * 4)}
          max={LOW_BALANCE_MON * 4}
          segments={12}
        />

        <PixelText role="micro" tone="dim">
          {describe(state, balanceMon, low, dripMon)}
        </PixelText>
      </Panel>

      <button
        type="button"
        onClick={funded ? onContinue : onTopUp}
        disabled={busy}
        className={`pressable border-edge flex items-center justify-center border px-2 py-1 disabled:opacity-40 ${
          funded ? 'bg-panel' : 'bg-accent'
        }`}
      >
        <PixelText role="body" tone={funded ? 'ink' : 'invert'} upper>
          {buttonLabel(state)}
        </PixelText>
      </button>

      <div className="mt-auto flex items-center justify-between">
        <PixelText role="micro" upper>
          {funded ? 'A Continue' : 'A Top up'}
        </PixelText>
        <PixelText role="micro" upper>
          B Skip
        </PixelText>
      </div>
    </div>
  )
}

function buttonLabel(state: TopUpState): string {
  switch (state.status) {
    case 'checking':
      return 'Checking'
    case 'sending':
      return 'Topping up'
    case 'funded':
      return 'Continue'
    case 'already':
      return 'Continue'
    case 'unavailable':
      return 'Continue anyway'
    case 'idle':
      return 'Top up'
  }
}

/**
 * One sentence per state, and never a number the screen did not receive.
 *
 * The unavailable branch prints the SERVER's reason verbatim. It is written for
 * a person ("faucet is empty for this session", "already funded this address
 * once") and inventing a friendlier paraphrase here would mean two descriptions
 * of one condition, drifting apart the first time the service changes.
 */
function describe(
  state: TopUpState,
  balanceMon: number | null,
  low: boolean,
  dripMon: string,
): string {
  switch (state.status) {
    case 'checking':
      return 'reading the card'
    case 'sending':
      return 'sending power to the card'
    case 'funded':
      return `added ${state.amountMon}. the card can write to the chain now`
    case 'already':
      return 'this card already has enough. nothing to do'
    case 'unavailable':
      return state.reason
    case 'idle':
      if (balanceMon === null) return 'press A to fill the card'
      if (low) return `empty cards cannot save. press A for ${dripMon}`
      return 'this card has enough to play'
  }
}
