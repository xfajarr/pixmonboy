import {
  createFileRoute,
  useHydrated,
  useNavigate,
} from '@tanstack/react-router'
import { useCallback, useMemo, useState } from 'react'
import { useSendTransaction } from '@privy-io/react-auth'
import { testnet } from '@pixmon-boy/sdk'
import { SetRange } from '../../../game/screens/SetRange'
import { findPool } from '../../../game/fixtures'
import { useSession } from '../../../state/session'
import { buildDepositCalls } from '../../../lib/deposit/plan'
import { planForSession } from '../../../lib/range/plan'
import { poolPriceFromBinId } from '../../../lib/range/bins'
import type { DepositState } from '../../../game/screens/SetRange'

export const Route = createFileRoute('/_console/play/range/$id')({
  component: SetRangeRoute,
})

/**
 * S6's route.
 *
 * Two paths, split on the one fact the route can verify: whether there is a
 * card that can sign. The FIXTURE path confirms straight through to S7 exactly
 * as it always did, so the game is playable with no wallet, no chain and no
 * faucet. The LIVE path opens a real Liquidity Book position first.
 *
 * The split exists for the same reason card.tsx's does — `useSendTransaction`
 * needs a mounted PrivyProvider, which does not exist during SSR — and it is
 * also the honest product answer: a player who skipped the top-up still gets to
 * play, they just do not get a position.
 */
function SetRangeRoute() {
  const hydrated = useHydrated()
  const cardAddress = useSession((s) => s.cardAddress)
  const canSign =
    hydrated && !!import.meta.env.VITE_PRIVY_APP_ID && !!cardAddress

  return canSign ? <LiveRange /> : <FixtureRange />
}

/** Everything both paths share: the pool, the session, and where B goes. */
function useRangeScreen() {
  const { id } = Route.useParams()
  const navigate = useNavigate()
  const session = useSession()
  const pool = useMemo(
    () => findPool(id, session.difficulty, session.godMode)?.pool,
    [id, session.difficulty, session.godMode],
  )

  return {
    id,
    pool,
    session,
    toLive: () => void navigate({ to: '/play/live/$id', params: { id } }),
    toTracker: () => void navigate({ to: '/play/tracker' }),
  }
}

/** No card, no chain. Confirm walks to S7 and nothing is signed. */
function FixtureRange() {
  const { pool, session, toLive, toTracker } = useRangeScreen()

  return (
    <SetRange
      pool={pool}
      balance={session.balance}
      amount={session.amount}
      width={session.width}
      manualRange={session.manualRange}
      autopilot={session.autopilot}
      deposit={{ status: 'idle' }}
      onChangeAmount={session.setAmount}
      onChangeWidth={session.setWidth}
      onChangeManualRange={session.setManualRange}
      onToggleAutopilot={session.setAutopilot}
      onConfirm={toLive}
      onBack={toTracker}
    />
  )
}

/**
 * The live path. CONFIRM opens a real position before the game starts.
 *
 * Five transactions, sent in order and awaited one at a time. Sequential rather
 * than fired together because each one depends on the last: the approvals are
 * worthless before the mints land, and `addLiquidity` reverts before either.
 */
function LiveRange() {
  const { pool, session, toLive, toTracker } = useRangeScreen()
  const { sendTransaction } = useSendTransaction()
  const [deposit, setDeposit] = useState<DepositState>({ status: 'idle' })

  const onConfirm = useCallback(() => {
    // A finished deposit turns CONFIRM into CONTINUE rather than depositing
    // twice. The footer label says so; this is the half that enforces it.
    if (deposit.status === 'opened') {
      toLive()
      return
    }
    if (!pool || !session.cardAddress) return
    const card = session.cardAddress as `0x${string}`

    const router = testnet.contracts.lbRouter
    if (!router) {
      setDeposit({ status: 'failed', reason: 'no router on this chain' })
      return
    }

    const plan = planForSession(pool, session.width, session.manualRange)
    const priceQuotePerBase = poolPriceFromBinId(
      pool.activeBinId,
      pool.binStep,
      pool.tokenX.decimals,
      pool.tokenY.decimals,
    )

    const calls = buildDepositCalls(
      {
        pool,
        plan: plan.plan,
        activeBinId: pool.activeBinId,
        amountQuote: session.amount,
        account: card,
        router,
        nowSeconds: Math.floor(Date.now() / 1000),
      },
      priceQuotePerBase,
    )

    void (async () => {
      for (const [index, call] of calls.entries()) {
        setDeposit({
          status: 'sending',
          step: index + 1,
          total: calls.length,
          label: call.label,
        })
        try {
          // `address` is not optional here, whatever the type says.
          //
          // Privy resolves the signer as `address ? findLinkedEmbedded(address)
          // : defaultEmbedded(user)`, and ONLY reaches its external-wallet
          // branch inside the `!wallet && address` arm. Omit the option and a
          // player who arrived through S1's "bring your own card" row has no
          // embedded wallet to fall back to and no address to look their
          // connected one up by, so the send fails before it is ever offered:
          // "No embedded or connected wallet found for address." card.tsx's own
          // comment names that player — an external wallet lands in `wallets`
          // without ever flipping `authenticated` — and the card is built from
          // `wallets[0]` precisely so they get one.
          //
          // Passing the card also closes a quieter hole. `wallets[0]` is not
          // required to be the embedded wallet even when one exists (an
          // already-connected extension can sit ahead of it), and the default
          // signer is. The deposit calldata is built with `account: card` as
          // the recipient of the liquidity, so the two disagreeing means
          // signing from one wallet and minting to another.
          const { hash } = await sendTransaction(
            {
              to: call.to,
              data: call.data,
              chainId: testnet.id,
            },
            { address: card },
          )
          if (index === calls.length - 1) {
            setDeposit({
              status: 'opened',
              txHash: hash,
              explorerUrl: `${testnet.explorer}/tx/${hash}`,
            })
          }
        } catch (error) {
          // The chain's own words, trimmed to one line. Liquidity Book's
          // custom errors are in the ABI precisely so this string is readable,
          // and rewriting it here would discard the only thing that says what
          // actually happened.
          setDeposit({
            status: 'failed',
            reason: (error as Error).message.split('\n')[0].slice(0, 80),
          })
          return
        }
      }
    })()
  }, [deposit.status, pool, session, sendTransaction, toLive])

  return (
    <SetRange
      pool={pool}
      balance={session.balance}
      amount={session.amount}
      width={session.width}
      manualRange={session.manualRange}
      autopilot={session.autopilot}
      deposit={deposit}
      onChangeAmount={session.setAmount}
      onChangeWidth={session.setWidth}
      onChangeManualRange={session.setManualRange}
      onToggleAutopilot={session.setAutopilot}
      onConfirm={onConfirm}
      onBack={toTracker}
    />
  )
}
