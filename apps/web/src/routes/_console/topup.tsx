import {
  createFileRoute,
  useHydrated,
  useNavigate,
} from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'
import { TopUp } from '../../game/screens/TopUp'
import { useSession } from '../../state/session'
import type { TopUpState } from '../../game/screens/TopUp'

export const Route = createFileRoute('/_console/topup')({
  component: TopUpRoute,
})

/** What `GET /api/faucet/status` answers. */
interface FaucetStatus {
  enabled: boolean
  dripMon: string
  reason: string | null
}

/**
 * The top-up route. ARCHITECTURE.md 2.1: the route owns the network, the screen
 * owns the drawing, and the split is what makes `TopUp` testable with no fetch.
 *
 * Every endpoint it calls answers 200 whatever happened, so there is no error
 * branch here either — only a `TopUpState` to hand down. The one case the API
 * cannot report on itself is a transport failure, and that is caught into the
 * same shape rather than thrown.
 *
 * WITHOUT A CARD THIS SCREEN HAS NOTHING TO DO. A player who reaches it on the
 * fixture path, or before Privy has a wallet, is sent straight on to the disks.
 * It is a step in a flow, not a destination worth stranding anyone on.
 */
function TopUpRoute() {
  const navigate = useNavigate()
  const hydrated = useHydrated()
  const cardAddress = useSession((s) => s.cardAddress)

  const [state, setState] = useState<TopUpState>({ status: 'checking' })
  const [balanceMon, setBalanceMon] = useState<number | null>(null)
  const [dripMon, setDripMon] = useState('0.05')

  const onContinue = useCallback(() => {
    void navigate({ to: '/disks' })
  }, [navigate])

  const refreshBalance = useCallback(async (address: string) => {
    const res = await fetch(`/api/faucet/balance/${address}`)
    const body = (await res.json()) as { balanceMon: string | null }
    if (body.balanceMon !== null) setBalanceMon(Number(body.balanceMon))
    return body.balanceMon === null ? null : Number(body.balanceMon)
  }, [])

  // Read the faucet's own state and the card's balance together. Both are
  // needed before the screen can say anything true, and asking in parallel
  // keeps the "checking" frame short enough that it reads as a load rather
  // than as a step.
  useEffect(() => {
    if (!hydrated || !cardAddress) return

    // A mutable object rather than a boolean, because the cleanup writes this
    // after the async body has been scheduled: eslint's no-unnecessary-condition
    // narrows a `let cancelled = false` to a constant it can never see change,
    // and the guard is load bearing.
    const cancelled = { value: false }
    void (async () => {
      try {
        const [statusRes, balance] = await Promise.all([
          fetch('/api/faucet/status').then(
            (r) => r.json() as Promise<FaucetStatus>,
          ),
          refreshBalance(cardAddress),
        ])
        if (cancelled.value) return

        setDripMon(statusRes.dripMon)
        if (!statusRes.enabled) {
          setState({
            status: 'unavailable',
            reason: statusRes.reason ?? 'top up is switched off',
          })
          return
        }
        // A CARD THAT IS ALREADY FUNDED NEVER SEES THIS SCREEN.
        //
        // The player did not ask to be here; the login flow routed them. If
        // there is nothing to do, doing it silently is better than a screen
        // whose only content is "no action required" and whose only control
        // dismisses itself. A returning player goes card -> disks as before.
        //
        // The threshold is the API's `NEEDS_GAS_BELOW_MON`, which is also what
        // `drip` refuses above, so the screen and the server agree on "enough".
        if (balance !== null && balance >= 0.02) {
          onContinue()
          return
        }
        setState({ status: 'idle' })
      } catch {
        if (!cancelled.value) {
          setState({
            status: 'unavailable',
            reason: 'no answer from the console',
          })
        }
      }
    })()

    return () => {
      cancelled.value = true
    }
  }, [hydrated, cardAddress, refreshBalance, onContinue])

  const onTopUp = useCallback(() => {
    if (!cardAddress) return
    setState({ status: 'sending' })

    void fetch('/api/faucet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: cardAddress }),
    })
      .then((r) => r.json())
      .then(async (result) => {
        if (result.funded) {
          await refreshBalance(cardAddress)
          setState({
            status: 'funded',
            amountMon: result.amountMon ?? '',
            txHash: result.txHash ?? '',
            explorerUrl: null,
          })
          return
        }
        // "already has enough" is a refusal the player should read as success,
        // because from their side the card works. Every other refusal is
        // reported in the server's own words.
        if (result.reason === 'address already has enough gas') {
          setState({ status: 'already' })
          return
        }
        setState({
          status: 'unavailable',
          reason: result.reason ?? 'unavailable',
        })
      })
      .catch(() =>
        setState({
          status: 'unavailable',
          reason: 'no answer from the console',
        }),
      )
  }, [cardAddress, refreshBalance])

  // No card, nothing to power. Runs as an effect rather than a bare redirect so
  // it cannot fire during the server render, where there is no router to move.
  useEffect(() => {
    if (hydrated && !cardAddress) void navigate({ to: '/disks' })
  }, [hydrated, cardAddress, navigate])

  return (
    <TopUp
      cardAddress={cardAddress}
      balanceMon={balanceMon}
      dripMon={dripMon}
      state={state}
      onTopUp={onTopUp}
      onContinue={onContinue}
    />
  )
}
