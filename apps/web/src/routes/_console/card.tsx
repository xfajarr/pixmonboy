import { createFileRoute, useHydrated, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { usePrivy, useWallets } from '@privy-io/react-auth'
import { MemoryCard } from '../../game/screens/MemoryCard'
import { FIXTURE_CARD_ADDRESS } from '../../game/fixtures'
import { useSession } from '../../state/session'

export const Route = createFileRoute('/_console/card')({
  component: MemoryCardRoute,
})

/**
 * S1's route. ARCHITECTURE.md 2.1: a route owns navigation and nothing else.
 *
 * Two paths, split by one fact the route can actually verify.
 *
 * With no `VITE_PRIVY_APP_ID`, or before hydration (PrivyGate mounts only on
 * the client), both sign-in rows land on the committed fixture card and the
 * screen says FIXTURE out loud. With Privy configured and the client
 * hydrated, the rows open Privy's login modal, the embedded wallet's address
 * becomes the card, and the marker disappears because a login really happened.
 *
 * The split is a guard, not a duplicate: `usePrivy` throws outside a mounted
 * PrivyProvider, and the provider does not exist during SSR, so calling it
 * from this route unconditionally would break the first render on the server.
 */
function MemoryCardRoute() {
  const hydrated = useHydrated()
  const appId = import.meta.env.VITE_PRIVY_APP_ID

  if (!hydrated || !appId) return <FixtureCard />

  return <LiveCard />
}

/** The committed-fixture path. Two rows, one fake card, marker on. */
function FixtureCard() {
  const navigate = useNavigate()
  const { cardAddress, insertCard, clearCard } = useSession()

  return (
    <MemoryCard
      cardAddress={cardAddress}
      isFixture
      onInsert={() => {
        insertCard(FIXTURE_CARD_ADDRESS)
        navigate({ to: '/disks' })
      }}
      onEject={() => {
        // A fixture card has no account to sign out of, so ejecting it is
        // purely local: drop the session and stay on the card screen.
        clearCard()
      }}
      onBack={() => navigate({ to: '/' })}
    />
  )
}

/**
 * The live path. Only rendered after hydration with an app id, which is also
 * exactly when PrivyGate has mounted the provider, so `usePrivy` is safe here.
 */
function LiveCard() {
  const navigate = useNavigate()
  const { cardAddress, insertCard, clearCard, ejected, resetEjected } =
    useSession()
  const { ready, authenticated, user, login, logout, connectWallet } =
    usePrivy()
  const { wallets } = useWallets()

  /**
   * The card is the wallet the player arrives with.
   *
   * `user.wallet` is the embedded wallet minted by a Google or email login.
   * A wallet connected through "Bring your own card" is NOT that field: it is
   * an external wallet that lives in `useWallets().wallets`, and Privy reports
   * `authenticated` false for it until the player logs the account in. Both
   * must be read, because both are a valid card.
   */
  const firstWallet = wallets.length > 0 ? wallets[0] : null
  const walletAddress = firstWallet
    ? firstWallet.address
    : (user?.wallet?.address ?? null)

  // A returning player is already signed in by the time Privy hydrates, so the
  // card is inserted the moment a wallet exists rather than waiting for a
  // button press. A fresh player lands on the insert screen and presses.
  //
  // The gate is `walletAddress`, not `authenticated`: connecting an external
  // wallet through S1's third row lands in `wallets` without flipping the auth
  // flag, and the card must not wait on a flag that never changes.
  //
  // `ejected` is the exception to the auto-insert rule. A Privy logout does
  // not disconnect an external wallet, so after an eject the wallet is still
  // sitting in `wallets`; without the flag the effect would re-insert the card
  // the player just took out and bounce them straight back to /disks.
  // Straight to TOP UP rather than to the disks. The wallet Privy just minted
  // holds zero MON and cannot send one transaction, so the step immediately
  // after "you have a card" is "your card has power". That screen forwards to
  // /disks on its own when there is nothing to do, so a returning player with a
  // funded card never sees it.
  useEffect(() => {
    if (ejected || !ready || !walletAddress) return
    insertCard(walletAddress)
    navigate({ to: '/topup' })
  }, [ready, walletAddress, ejected, insertCard, navigate])

  return (
    <MemoryCard
      cardAddress={cardAddress}
      isFixture={false}
      onInsert={() => {
        // Signed in but the effect above has not fired yet, or a returning
        // player whose wallet is still loading: pressing again must not open
        // a modal they just closed. The effect owns the transition.
        if (!authenticated) {
          resetEjected()
          login()
        }
      }}
      onConnectWallet={() => {
        // Bring your own card: link an external wallet the player already
        // owns. The embedded-wallet effect above does not run for a wallet
        // that was linked, not minted, so the wallet is read the same way —
        // `user.wallet.address` is the first linked wallet either way.
        if (!authenticated) {
          resetEjected()
          connectWallet()
        }
      }}
      onEject={() => {
        // Eject the card: sign out of Privy and drop the session. The wallet
        // still exists on Privy's side; this is the current player leaving.
        // We are already on /card, so there is nothing to navigate to.
        clearCard()
        logout()
      }}
      onBack={() => navigate({ to: '/' })}
    />
  )
}
