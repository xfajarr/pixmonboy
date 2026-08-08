# PIXMON BOY

A virtual Game Boy in the browser, built for **Monad Blitz Jakarta, 8 August 2026**.

DeFi on Monad, disguised as a game nobody is scared of. Real Liquidity Book
positions underneath — every screen a real number in a costume.

Two cartridges, one console:

| Cartridge | Game |
| --- | --- |
| **STAY IN RANGE** | Provide liquidity without knowing what that means. Pick a Monanimal, pick a pool, keep the price in your range. |
| **MONSPELL** | Call whether MON goes UP or DOWN in the next ten seconds — and watch your Monanimal climb and fall with the live price. |

---

## The one-line pitch

> Liquidity provision on Monad is an intimidating wall of numbers. PIXMON BOY
> turns it into a game: a Game Boy whose save disk is a real on-chain position,
> and whose screen never once says the word "wallet".

---

## Quick start

```bash
bun install
bun run dev          # localhost:3000
```

```bash
bun run verify       # typecheck + lint + test. This is the definition of "it works".
bun run build        # must pass before any deploy
```

Bun 1.3 installs, Node 24+ runs. Vite and Vitest are Node processes; Bun is the
package manager and the script runner, never the runtime. Every dependency is
pinned exactly, no carets — a minor bump on the morning of the demo is not a
risk worth carrying.

---

## What you're looking at

A fixed **480×320 pixel grid**, DOM + CSS (no canvas), everything on 4px, the
Departure Mono bitmap font at exactly 8, 16, or 32px. A purple-on-lavender
"Daylight" design system whose every token is tested.

The hardware metaphor is load-bearing, not decoration:

```
┌──────────────────────────────┐
│  PIXMON BOY                  │
│  ┌────────────────────────┐  │
│  │  MEMORY CARD  │ streak │  │   ← every screen, one Monanimal
│  │  (live chart)          │  │      standing on the price
│  └────────────────────────┘  │
│  ◄► Choose   A Start   B Back │
└──────────────────────────────┘
```

- **MEMORY CARD** is the wallet, in console language. Google, email, or bring
  your own wallet via Privy. The word "wallet" appears nowhere on the console.
- **SAVE DISK** is the on-chain position record, written to a real contract.
- The **Monanimal is the chart**: it stands on the price and climbs when the
  market climbs.

---

## Cartridges

### STAY IN RANGE — the LP game

The nine-screen flow: card → disks → cartridges → difficulty → pool tracker →
set range → in range → results.

1. Insert a MEMORY CARD (Privy login).
2. Pick a SAVE DISK — each one is bound to a difficulty (EASY/NORMAL/HARD),
   each difficulty to a Monanimal: **MOLANDAK**, **MOYAKI**, **MOUCH**.
3. Pick a pool from ten **real Monad pools read from Liquidity Book on
   mainnet** (STAY IN RANGE's tracker lists actual pools, actual TVL, actual
   price).
4. Set a range, deposit a size, then play: keep the price in your range while
   the sim ticks. Scoring rewards time-in-range and penalizes out-of-range
   damage. A honeypot gate keeps a HARD disk honest.
5. Results are written to **`DiskRegistry` on Monad testnet** — keeper-signed,
   gas-billed-on-limit-aware, and off by default behind the `ONCHAIN_RUNS`
   flag so nothing in the demo path can fail on stage.

### MONSPELL — the live price game

- Call **UP or DOWN**. Ten seconds on the clock.
- The Monanimal **is** the chart: a requestAnimationFrame loop glides it up
  and down with the live MON price, smooth at display frame rate.
- A **jail line** sits at your entry price. The monster has to leave it in the
  direction you called.
- The price comes from **Pyth's Hermes API** (the freshest MON/USD, publish
  age a few seconds — not the tens-of-seconds-old on-chain copy), zoomed with
  a tight ±0.05% window so real movement reads as visible movement.
- Win/lose/draw, streak counter, characters from your disk's difficulty.

---

## Deployed contracts

Verified with `cast code` against the live RPC on **2026-08-08**. The
single source of truth is `packages/sdk/src/chains.ts`; a redeploy is a config
change there, never a rebuild.

### Monad Testnet (chain 10143) — where we transact

| Contract | Address |
| --- | --- |
| **DiskRegistry** (our save-disks contract) | `0x5b23e4da5861213c980052f1a174ca5cca8f38d6` |
| **WMON** (our wrapped native — the registry's published one has no bytecode) | `0x623aC037C6BA42b367e3278962729bC486E0566d` |
| **tUSD** (6 decimals, mintable) | `0x69fD07A282eACa193d257Eb7bF7e0ce8e07dC872` |
| **tMON** (18 decimals, mintable) | `0xde16B034034d431E6E3480c552EE183e936893aa` |
| **tBTC** (8 decimals, mintable) | `0xEa8DD1b372764E06a7c87CB6842c1CB5850083D3` |
| **LBFactory** (our joe-v2 deploy, not the empty registry one) | `0x19444deb5b24d57F54D5dC8C2a9CCfeFC185790E` |
| **LBRouter** | `0x17dc9CF08ceEF1B44AD0ECf01E79a8A6Ab138E0a` |
| **LBQuoter** | `0xBB497F0b3c4Ae63E88a130163abf746e1DD85087` |
| **tMON/tUSD pool, bin step 5** (the demo pair) | `0xA3a7452c414f7cAc68fa1F9c03C980A35a1afEF3` |

Explorer: https://testnet.monadscan.com

### Monad Mainnet (chain 143) — where we read liquidity

| Contract | Address |
| --- | --- |
| **LBFactory** | `0xb43120c4745967fa9b93E79C149E66B0f2D6Fe0c` |
| **WMON/USDC demo pair** (bin step 5, ~$46k) | `0x5AFD3EC861f6104af26e8755aBcc1f876de77620` |
| **Pyth price feed** (MON/USD read via Hermes) | `0x2880aB155794e7179c9eE2e38200202908C17B43` |
| **Multicall3** | `0xcA11bde05977b3631167028862bE2a173976CA11` |

Explorer: https://monadscan.com

> **Why two chains?** We *transact* on testnet (DiskRegistry costs faucet gas
> and has to be "deployed on Monad" for the submission). We *read* liquidity
> from mainnet, because Liquidity Book does not exist on testnet — and no
> amount of wanting changes that. The pitch says it in one sentence, and a
> judge can verify both halves in ten seconds.

> **Why is our testnet LB our own?** The `monad-crypto/protocols` registry
> publishes testnet LB addresses that are byte-identical to mainnet and hold
> **no bytecode**. WMON's published testnet address is empty too. So we
> deployed joe-v2, a WMON, three mintable test tokens, and four seeded pools
> ourselves on 2026-08-08 — rehearsed on anvil first, 26.8M gas over 23
> transactions. The first deployment was abandoned: its pools were seeded at a
> made-up $2/MON when five mainnet pools put MON at $0.0209. A pool's price is
> fixed at creation and cannot be rewritten, so the fix was a redeploy. Every
> number in this build now traces to data that was read, never picked.

---

## Architecture

A Bun workspace. Anything both the app and the API need lives in `packages/`,
which is why an address is written down exactly once.

```
apps/web/src/
  routes/     TanStack Start file routes, one per screen
  console/    the shell. Knows nothing about DeFi. Enforced by lint AND a test.
  ui/         ~15 pixel primitives, all rectangles
  game/       screens, fixtures, the sim, and MONSPELL's live chart
  lib/        pure. No React, no network, no chain. Fully tested.
  design/     the Daylight palette mirror and its tests
  styles/     tokens.css, the source of truth for every visual value
  server/     server functions, never imported by the client
  state/      session choices only, never data
  config/     brand names, thresholds
  integrations/  tanstack-query, Privy wallet gate

apps/api/     Elysia. Mounted INSIDE the web app (one process, one deploy).
  modules/    chain, health, price, runs, faucet
packages/sdk/ chains.ts — the ONE place a chain id, RPC url, or address lives.
contracts/    Foundry. joe-v2 vendored unmodified, our WMON, test tokens, and
              the deploy/seed scripts.
data/         pool + momentum snapshots (real, read from mainnet).
```

**The one rule that matters more than the rest:** `apps/web/src/console/` must
never know that this application is about money. Enforced by a lint rule *and*
a test. That boundary is what keeps the hardware honest — the console is a
Game Boy, full stop.

**Everything is mounted in one process.** The Elysia API lives at
`routes/api.$.ts` inside the web app. No second server, no CORS, no extra URL
to get wrong, and nothing extra that can be down at 18:00 on stage.

---

## API

All under `/api`, same process as the screens.

| Endpoint | What it does |
| --- | --- |
| `GET /api/health` | liveness probe |
| `GET /api/chain` | the chain this build targets |
| `GET /api/chain/all` | both chains we have verified addresses for |
| `GET /api/price/mon` | live MON/USD from Pyth Hermes (discriminated union: fresh / stale / reason) |
| `POST /api/runs` | record a finished run to DiskRegistry (off unless `ONCHAIN_RUNS=1`) |
| `POST /api/faucet` | a MON drip so an embedded wallet can afford its first writes |
| `GET /api/faucet/status`, `GET /api/faucet/balance/:address` | faucet state and a card's balance |

Every endpoint answers 200 with a reason when it cannot do the work. Nothing
in the demo path throws a stack trace onto a screen.

---

## The engineering promises

- **Nothing in the demo path can fail on stage.** Every external call has a
  failure ladder with a canned fallback. A missing pool, a dead RPC, a faucet
  that says no — all render as a state to draw, never a crash.
- **Honesty markers.** When something on screen is a fixture, it says
  `FIXTURE` out loud. A screen that pretends a fake login is real is the kind
  of thing a peer judge checks.
- **Real numbers in costumes.** Pool TVL, prices, and run outcomes trace back
  to chain reads or the sim — never to a number somebody picked in a config.
- **Every length is a multiple of 4px; type is 8, 16, or 32px only.** The
  bitmap-font illusion dies the moment you let it resample.
- **Product names live only in `apps/web/src/config/brand.ts`.** A rename is
  one line.
- **Never trust a published contract address.** Verify with `eth_getCode`
  first. We got burned by exactly this (see the two-chain story above).

---

## Test suite

```bash
bun run verify     # typecheck (3 workspaces) + lint + 500+ tests
cd contracts && forge test   # contract tests
```

The pure logic (`lib/scoring`, `lib/range`, MONSPELL's round math) is TDD'd at
~98% coverage. The screens are tested with keyboard/touch cursor navigation.
The design tokens have a contrast contract. The console/money boundary has a
test of its own.

---

## Built for the pitch

- **Screens open directly at their URL** — every one renders standalone, so a
  judge can click through nine screens without playing the preamble.
- **No spinner is a terminal state.** `.....` and `no disk` are real states,
  drawn on purpose.
- **The demo has two games**, and the second one (MONSPELL) is a guaranteed
  crowd-pleaser: live price, a monster that climbs, ten seconds, done.

---

*Built in a weekend for Monad Blitz Jakarta. All product names are tokens in
`brand.ts`. All addresses are verified in `chains.ts`. All tests are green.*
