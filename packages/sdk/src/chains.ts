/**
 * The ONE place a chain id, an RPC url, or a contract address is written down.
 *
 * `SMART-CONTRACTS.md` section 10: a deployed address goes here and NOWHERE
 * else, so a redeploy is a config change rather than a rebuild. Both the web
 * app and the API read this module, which is the reason it lives in a package
 * instead of inside either one of them.
 *
 * CLAUDE.md rule 11: never trust a published contract address. Every address
 * below was checked with `cast code` against the live RPC on the date in
 * `VERIFIED_ON`. An address that has never returned bytecode is `null`, not a
 * hopeful string, so a caller cannot accidentally send a transaction into a
 * hole. Re-run `bun run --cwd packages/sdk verify:addresses` before trusting
 * this file on a new date.
 */

/** The date every address in this file was last checked with `cast code`. */
export const VERIFIED_ON = '2026-08-07'

export type ChainKey = 'mainnet' | 'testnet'

export interface ChainConfig {
  key: ChainKey
  id: number
  name: string
  rpcUrl: string
  explorer: string
  nativeSymbol: string
  contracts: ChainContracts
}

export interface ChainContracts {
  multicall3: `0x${string}` | null
  /**
   * Wrapped native. NULL ON TESTNET, and that is not an oversight.
   *
   * The `monad-crypto/protocols` registry publishes a canonical testnet WMON at
   * `0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701`. It holds no bytecode. Checked
   * against three independent RPC providers on 2026-08-06, all agreeing on
   * chain 10143 at block ~51.38M. Thirteen of the fourteen canonical testnet
   * contracts DO have code; WMON is the only one that does not, which is also
   * the one an LP app needs most.
   */
  wrappedNative: `0x${string}` | null
  usdc: `0x${string}` | null
  /** LFJ Liquidity Book. See the note on `testnet` below before using these. */
  lbFactory: `0x${string}` | null
  lbRouter: `0x${string}` | null
  lbQuoter: `0x${string}` | null
  /** LFJ's read helper. Pool data without hand-rolling a multicall. */
  lbDexLens: `0x${string}` | null
  /**
   * The pool the demo reads. WMON/USDC at bin step 5, the deepest pair on
   * Monad that is not stable-against-stable. See the note on `mainnet`.
   */
  lbDemoPair: `0x${string}` | null
  /**
   * Pyth. The same address on both chains, and one of the few things that is
   * genuinely live on testnet. This is the honest replacement for the
   * `realizedVol24h` fixture whenever Lane B gets to it.
   */
  pythPriceFeed: `0x${string}` | null
  /** Ours. Null until Lane C deploys it. `SMART-CONTRACTS.md` section 10. */
  diskRegistry: `0x${string}` | null
}

/**
 * Liquidity Book is real here, and thinner than you would guess.
 *
 * Enumerated from `LBFactory.getNumberOfLBPairs()` on 2026-08-06: 78 pairs
 * exist and 46 of them are completely empty. Prices below were computed from
 * each pair's active bin, not assumed.
 *
 *   AUSD/USDC   bin 1    ~$102k   stable against stable, price never moves
 *   WMON/USDC   bin 5     ~$46k   the deepest pair that actually moves
 *   WMON/USDC   bin 10     ~$6k
 *   WMON/USDC   bin 100    ~$2k   the only one where a +/-20% range fits
 *
 * `lbDemoPair` is the bin-5 WMON/USDC pool. Two things follow from its size and
 * both matter on stage:
 *
 *   Each bin holds roughly $64, so a few hundred dollars of swap walks the
 *   price several bins. SMART-CONTRACTS.md 12.6 recommends path B because only
 *   a self-deployed pair lets you force the out-of-range moment on demand. That
 *   is no longer true; this pool is thin enough to drive from mainnet.
 *
 *   `MAX_BINS_PER_TX` is 50, and at bin step 5 a +/-1% range is already 41
 *   bins. Anything wider than that has to move to a coarser bin step, which
 *   means a shallower pool. That tension is real and belongs to PRD 8.4's
 *   coupled control, not to this file.
 */
export const mainnet: ChainConfig = {
  key: 'mainnet',
  id: 143,
  name: 'Monad',
  rpcUrl: 'https://rpc.monad.xyz',
  explorer: 'https://monadscan.com',
  nativeSymbol: 'MON',
  contracts: {
    multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
    wrappedNative: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A',
    usdc: '0x754704Bc059F8C67012fEd69BC8A327a5aafb603',
    lbFactory: '0xb43120c4745967fa9b93E79C149E66B0f2D6Fe0c',
    lbRouter: '0x18556DA13313f3532c54711497A8FedAC273220E',
    lbQuoter: '0x9A550a522BBaDFB69019b0432800Ed17855A51C3',
    lbDexLens: '0x7ac3Dd4B5A3F7013116D8a28f0579a678282EA5c',
    lbDemoPair: '0x5AFD3EC861f6104af26e8755aBcc1f876de77620',
    pythPriceFeed: '0x2880aB155794e7179c9eE2e38200202908C17B43',
    diskRegistry: null,
  },
}

/**
 * There is no Liquidity Book here, and there is no wrapped MON either.
 *
 * `SMART-CONTRACTS.md` section 0 established the first half: the LFJ docs and
 * the `monad-crypto/protocols` registry both publish LB addresses for chain
 * 10143 that are byte-identical to mainnet and hold no bytecode.
 *
 * Auditing the whole testnet registry on 2026-08-06 found it is worse than one
 * protocol. Of the sixteen protocols listed for testnet, these are empty
 * despite being marked `live: true`:
 *
 *   WMON            0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701
 *   LFJ LB          factory, router, quoter
 *   nad.fun         QUOTER_V3, DEX_ROUTER, BONDING_CURVE_ROUTER
 *   Magma           StakeManager
 *
 * And these are genuinely alive, which is the control proving the RPC is fine:
 * USDC, Multicall3, Pyth, Kuru's proxies, Permit2, CreateX, and all three
 * ERC-4337 EntryPoints. Thirteen of fourteen canonical contracts have code.
 * WMON is the one that does not.
 *
 * What this means for the product, plainly: an LP position on testnet is not
 * possible without first deploying joe-v2 AND a wrapped-native AND test tokens
 * AND seeding liquidity. That is strictly more than section 12.5's path B
 * assumed, so its "two to three hours, five realistic" no longer holds.
 *
 * `diskRegistry` does NOT need any of that. It touches no LB, no WMON, and no
 * liquidity, so it deploys here for the price of faucet gas and satisfies the
 * submission's "deployed on Monad" on its own.
 */
export const testnet: ChainConfig = {
  key: 'testnet',
  id: 10143,
  name: 'Monad Testnet',
  rpcUrl: 'https://testnet-rpc.monad.xyz',
  explorer: 'https://testnet.monadscan.com',
  nativeSymbol: 'MON',
  contracts: {
    multicall3: '0xcA11bde05977b3631167028862bE2a173976CA11',
    wrappedNative: null,
    usdc: '0x534b2f3A21130d7a60830c2Df862319e593943A3',
    lbFactory: null,
    lbRouter: null,
    lbQuoter: null,
    lbDexLens: null,
    lbDemoPair: null,
    pythPriceFeed: '0x2880aB155794e7179c9eE2e38200202908C17B43',
    diskRegistry: '0x5b23e4da5861213c980052f1a174ca5cca8f38d6',
  },
}

export const chains: Record<ChainKey, ChainConfig> = { mainnet, testnet }

/**
 * The demo is split across two chains, on purpose, and this is the honest way
 * to say so in code rather than in a slide.
 *
 * We TRANSACT on testnet, because `DiskRegistry` is the piece that has to be
 * "deployed on Monad" for the submission and it costs faucet gas to put there.
 * We READ liquidity from mainnet, because Liquidity Book does not exist on
 * testnet and no amount of wanting changes that.
 *
 * One sentence in the pitch covers it, and a judge can verify both halves in
 * ten seconds: the save disks are live on Monad testnet, the pool data is read
 * from Liquidity Book on Monad mainnet, and LB is not on testnet.
 */
export const DEFAULT_CHAIN: ChainKey = 'testnet'

/** Where Liquidity Book actually exists, and therefore where pools are read. */
export const LIQUIDITY_CHAIN: ChainKey = 'mainnet'

export function chainFor(key: ChainKey = DEFAULT_CHAIN): ChainConfig {
  return chains[key]
}

export function chainById(id: number): ChainConfig | null {
  return Object.values(chains).find((c) => c.id === id) ?? null
}

/**
 * True when this chain can host a real Liquidity Book position today.
 *
 * A screen that offers to fund a position must ask this first, because on
 * testnet the honest answer is no and PRD honesty rules say we show that
 * rather than failing at the transaction.
 */
export function hasLiquidityBook(chain: ChainConfig): boolean {
  return (
    chain.contracts.lbFactory !== null &&
    chain.contracts.lbRouter !== null &&
    chain.contracts.lbQuoter !== null
  )
}
