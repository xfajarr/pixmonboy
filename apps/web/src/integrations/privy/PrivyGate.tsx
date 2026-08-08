import { useHydrated } from '@tanstack/react-router'
import { PrivyProvider } from '@privy-io/react-auth'
import { testnet } from '@pixmon-boy/sdk'
import type { Chain } from '@privy-io/chains'
import type { ReactNode } from 'react'

/**
 * Monad testnet, built from the SDK rather than imported.
 *
 * `@privy-io/chains` ships `monadMainnet` and no testnet counterpart, so this
 * is hand-assembled. It is assembled FROM `packages/sdk/src/chains.ts` and not
 * typed out again, because that module is the one place allowed to know a chain
 * id or an RPC url, and a second copy here is a second thing to get wrong on
 * the day the RPC moves.
 */
const monadTestnet: Chain = {
  id: testnet.id,
  name: testnet.name,
  nativeCurrency: {
    name: testnet.nativeSymbol,
    symbol: testnet.nativeSymbol,
    decimals: 18,
  },
  rpcUrls: { default: { http: [testnet.rpcUrl] } },
  blockExplorers: {
    default: { name: 'Monadscan', url: testnet.explorer },
  },
  testnet: true,
}

/**
 * Privy, mounted only on the client.
 *
 * Privy talks to localStorage and window, so it cannot render during SSR. The
 * shell route renders this wrapper everywhere; before hydration it hands the
 * children straight through, and after hydration it wraps them in PrivyProvider.
 * TanStack's `useHydrated` is the switch, which is why this file is a component
 * and not a module-level call.
 *
 * The default chain is Monad TESTNET, because that is the only chain this
 * wallet can ever do anything on. DiskRegistry is deployed there, the faucet
 * refuses to drip anywhere else (apps/api/src/modules/faucet/service.ts), and
 * a wallet defaulted to mainnet is a wallet whose first transaction goes to a
 * chain where it holds nothing and we cannot fund it.
 *
 * Testnet is the ONLY supported chain, not merely the default. Mainnet was in
 * this list for a while on the theory that pool data is read from it, and that
 * was a bad reason: the pools arrive as a committed snapshot at build time
 * (apps/web/src/game/fixtures.ts) and no wallet is involved in reading them.
 * A chain in `supportedChains` is a chain the player can be switched onto, and
 * a chain we can neither fund nor write to is not one worth offering.
 *
 * `showWalletLoginFirst: false` is a product decision, not a style one: a
 * wallet modal is exactly the intimidating artifact this product removes. The
 * wallet row is still there for the player who already owns one, it just sits
 * below the Google and email rows instead of above them.
 *
 * The appearance block is the Daylight system (styles/tokens.css) mapped onto
 * Privy's theme: the screen field as the modal field, ink for text, the accent
 * purple as the button fill, and the MONADBOY wordmark as the logo.
 */
export function PrivyGate({ children }: { children: ReactNode }) {
  const hydrated = useHydrated()
  const appId = import.meta.env.VITE_PRIVY_APP_ID

  // No app id configured means the demo runs on the fixture card, and the
  // screen says so. Same shape, no provider, nothing to fail.
  if (!hydrated || !appId) return <>{children}</>

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ['google', 'email', 'wallet'],
        embeddedWallets: {
          ethereum: { createOnLogin: 'users-without-wallets' },
          /**
           * NO CONFIRMATION MODAL PER TRANSACTION, and this is the same product
           * decision as `showWalletLoginFirst: false` below rather than a new
           * one.
           *
           * Opening a Liquidity Book position is five transactions, not one
           * (apps/web/src/lib/deposit/plan.ts says why): two mints, two
           * approvals, then `addLiquidity`. With the default UI that is five
           * modals stacked on the exact screen whose thesis is that depositing
           * should feel like a handheld and not like a wallet.
           *
           * What replaces them is not nothing. S6's footer counts the steps
           * ("2/5 signing") and names the one in flight, so the player watches
           * a progress bar they understand instead of approving five things
           * they do not. The card is a testnet account holding faucet MON and
           * openly mintable tokens, so there is nothing here worth a
           * per-transaction guard.
           */
          showWalletUIs: false,
        },
        defaultChain: monadTestnet,
        supportedChains: [monadTestnet],
        appearance: {
          showWalletLoginFirst: false,
          theme: '#f4f1ff',
          accentColor: '#6e54ff',
          logo: <PrivyLogo />,
          landingHeader: 'MONADBOY',
          loginMessage: 'Insert a memory card to carry your save.',
        },
      }}
    >
      {children}
    </PrivyProvider>
  )
}

/**
 * The MONADBOY wordmark, drawn as a pixel-art cartridge rather than a logo.
 *
 * Privy overwrites the `style` prop of a logo element, so the sizing lives in
 * CSS (`.privy-brand-logo` in styles.css) and this component only carries the
 * className and the two rows of text. Same vocabulary as the console: the
 * wallet is a MEMORY CARD, so the mark is a card, and there is no wallet
 * anywhere on it.
 */
function PrivyLogo() {
  return (
    <span className="privy-brand-logo" aria-hidden="true">
      <span className="privy-brand-card">
        <span className="privy-brand-pads" />
      </span>
      <span className="privy-brand-word">MONADBOY</span>
    </span>
  )
}
