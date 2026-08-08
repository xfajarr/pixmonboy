/**
 * Lane A's data source until Phase 3.
 *
 * BUILD-PLAN.md section 2.3: Lane A reads fixtures and never waits for Lane B.
 * Every screen imports from this module and from nowhere else, so Phase 3 is a
 * swap of the four functions below for server functions rather than a hunt
 * through nine screens for JSON imports.
 *
 * Nothing here fabricates a number. It parses a committed snapshot, runs the
 * real lib/scoring over it, and returns the real result. If the tracker looks
 * wrong, the model is wrong, which is the point.
 */

// The REAL Liquidity Book pools on Monad mainnet, read from chain by
// `bun run --cwd packages/sdk snapshot:pools` and committed. A snapshot rather
// than a live call because CLAUDE.md forbids anything in the demo path that can
// fail on stage, and the 2026-08-01 log says a tool that only produces data
// runs offline and commits its output.
//
// The file records, per field, what was read and what was not. `volume24hUsd`
// and `realizedVol24h` are null because this RPC caps eth_getLogs at 100 blocks
// and twenty four hours is 216,000 of them; `createdAtIsExact` is false for
// every pool because state is pruned nine days back, so each `createdAt` is a
// timestamp the pool provably predates rather than its birthday.
//
// data/pools.fixture.json is kept for the tests, which need invented pools that
// fail specific gates on purpose. Real pools will not oblige.
import poolsJson from '../../../../data/pools.self-testnet.json'
import momentumJson from '../../../../data/momentum.json'
import { brand } from '../config/brand'
import { gatesFor, selfTestnetProfile } from '../config/thresholds'
import { evaluateGates } from '../lib/scoring/gates'
import { scorePool } from '../lib/scoring/score'
import { zMomentumSnapshot, zPoolsFixture } from '../types/domain'
import type { GateResult } from '../lib/scoring/gates'
import type {
  Difficulty,
  GateSet,
  Pool,
  PoolScore,
  SaveDisk,
} from '../types/domain'

/**
 * Which chain profile the fixtures describe.
 *
 * ONE LINE. This is the config edit that BUILD-PLAN.md 0.3 promised the chain
 * decision would cost. Switching to the self-deployed path means changing this
 * import and the fixture file above, and nothing else in src/.
 */
const PROFILE = selfTestnetProfile

const POOLS = zPoolsFixture.parse(poolsJson)
const MOMENTUM = zMomentumSnapshot.parse(momentumJson)

/**
 * The clock is the snapshot, not the wall.
 *
 * Pool age feeds SAFETY, so using Date.now() against a frozen fixture would
 * make every score drift a little every day and every screenshot in this repo
 * disagree with the next one. A snapshot has a time, and this is it.
 */
export const FIXTURE_NOW = Math.floor(Date.parse(POOLS.capturedAt) / 1000)

const MOMENTUM_AGE_SECONDS =
  FIXTURE_NOW - Math.floor(Date.parse(MOMENTUM.computedAt) / 1000)

export interface ScoredPool {
  pool: Pool
  score: PoolScore
  gates: GateResult
  /** True when this pool is playable at the requested difficulty. */
  passes: boolean
}

/**
 * Honeypot status is not in the fixture because it is not a property of a pool,
 * it is the result of a simulated sell. Lane B runs that check for real in
 * Phase 3. Until then every snapshot pool is treated as clean, which is the
 * only honest default: inventing a honeypot to make the screen more dramatic
 * would be fabricating the one number the product promises never to fake.
 *
 * CLAUDE.md rule 6 still holds. The gate runs, it is just fed a known input.
 */
const HONEYPOT_CLEAN = true

/**
 * Every pool in the snapshot, scored and gated for one difficulty.
 *
 * Filtered-out pools are RETURNED, not dropped. S5 draws them as dim pins so
 * the filter is observably doing work, which is worth more to a judge than a
 * shorter list. SCREEN-DETAIL.md section 8.
 */
/**
 * The gate set the fixtures are scored against.
 *
 * S5 draws its passing region from these numbers rather than hard-coding a
 * rectangle, so the shaded box on the map and the diamonds outside it can
 * never disagree: they are the same two thresholds read twice.
 */
export function fixtureGates(difficulty: Difficulty): GateSet {
  return gatesFor(difficulty, PROFILE)
}

export function scoredPools(
  difficulty: Difficulty,
  godMode = false,
): Array<ScoredPool> {
  const gates = fixtureGates(difficulty)

  return POOLS.pools.map((pool) => {
    const score = scorePool(
      {
        pool,
        momentum: MOMENTUM.entries.find((e) => e.symbol === pool.tokenX.symbol),
        momentumAgeSeconds: MOMENTUM_AGE_SECONDS,
        honeypotClean: HONEYPOT_CLEAN,
        nowSeconds: FIXTURE_NOW,
      },
      PROFILE,
    )

    const result = evaluateGates(pool, score, gates, FIXTURE_NOW)

    // GOD MODE turns off every filter EXCEPT the honeypot check, which is the
    // one gate that never turns off. CLAUDE.md rule 6, and the sentence on the
    // GOD MODE screen that says so out loud.
    const passes = godMode ? score.honeypotClean : result.passed

    return { pool, score, gates: result, passes }
  })
}

/** One pool by pair address. Undefined is a render state, never a throw. */
export function findPool(
  pairAddress: string | null,
  difficulty: Difficulty = 'easy',
  godMode = false,
): ScoredPool | undefined {
  if (!pairAddress) return undefined
  return scoredPools(difficulty, godMode).find(
    (p) => p.pool.pairAddress.toLowerCase() === pairAddress.toLowerCase(),
  )
}

/** The live count S4 shows as proof the filter is real. PRD.md section 11. */
export function passingCount(difficulty: Difficulty, godMode = false): number {
  return scoredPools(difficulty, godMode).filter((p) => p.passes).length
}

/** Bin steps the venue offers. Live list in Phase 3, presets until then. */
export function availableBinSteps(): Array<number> {
  return [...new Set(POOLS.pools.map((p) => p.binStep))].sort((a, b) => a - b)
}

// ---------------------------------------------------------------------------
// THE MEMORY CARD, THE SAVE DISKS, AND THE CARTRIDGES
//
// S1, S2 and S3 read these three the same way S5 and S6 read the pools: one
// module, swapped whole in Phase 3. The card becomes a Privy embedded wallet
// (INTEGRATIONS.md section 5) and the disks become `DiskRegistry.disksOf()`
// (SMART-CONTRACTS.md section 4). Neither screen changes when they do.
// ---------------------------------------------------------------------------

/**
 * The card in the slot until Privy issues a real one.
 *
 * A literal address, and every screen that shows it also says FIXTURE, the same
 * eight pixels of honesty S6 carries. A demo that silently shows a fake wallet
 * address as if it were the judge's is the sort of thing a peer judge checks.
 */
export const FIXTURE_CARD_ADDRESS = '0x7a2b9c4d5e6f708192a3b4c5d6e7f8091a2b3c3f'

/**
 * Three disks per card, and the number is a product rule, not a limit we hit.
 * SCREEN-DETAIL.md section 5: isolated portfolios, exactly like separate save
 * files on a handheld, which is why it needs no explanation to anyone who has
 * held one.
 */
export const MAX_DISKS = 3

/**
 * The disks on the fixture card. Two used, one slot free.
 *
 * Every field here is one `DiskRegistry.Disk` carries and nothing else. The
 * S2 wireframe draws "last played 2h ago" and "1 position active"; the struct
 * (SMART-CONTRACTS.md section 4) has neither, and inventing them here would
 * mean S2 renders two numbers that cannot survive Phase 3. `runs`, `createdAt`,
 * `bestScore` and `bestDamage` are what the chain actually knows.
 *
 * Disk 2 is a GOD MODE disk that lost money, on purpose. PnL is coloured,
 * arrowed, and never hidden including when it is negative (CLAUDE.md rule 2),
 * and a fixture where every disk is green cannot demonstrate that.
 */
const DISKS: Array<SaveDisk> = [
  {
    diskId: 1,
    owner: FIXTURE_CARD_ADDRESS,
    name: 'safe money',
    difficulty: 'easy',
    godMode: false,
    createdAt: FIXTURE_NOW - 6 * 86_400,
    runs: 7,
    bestScore: 12.4,
    bestDamage: 0,
    attested: false,
  },
  {
    diskId: 2,
    owner: FIXTURE_CARD_ADDRESS,
    name: 'degen box',
    difficulty: 'hard',
    godMode: true,
    createdAt: FIXTURE_NOW - 86_400,
    runs: 2,
    bestScore: 4.8,
    bestDamage: 7.9,
    attested: false,
  },
]

/** Every disk on the card, in slot order. Empty slots are absence, never a
 * placeholder row in the data: S2 draws `MAX_DISKS - length` of them. */
export function saveDisks(): Array<SaveDisk> {
  return DISKS.map((d) => ({ ...d }))
}

/** One disk by id. Undefined is a render state, never a throw. Gate 2.4. */
export function findDisk(diskId: number | null): SaveDisk | undefined {
  if (diskId === null) return undefined
  return saveDisks().find((d) => d.diskId === diskId)
}

/**
 * A disk's net result, which is the one number S2 leads with.
 *
 * Score MINUS damage, never score alone. `bestScore` on its own is the number
 * a product that only shows green would print, and CLAUDE.md rule 2 is that
 * damage sits at the same weight. Negative here is a real, expected value.
 */
export function diskNetUsd(disk: SaveDisk): number {
  return disk.bestScore - disk.bestDamage
}

export interface Cartridge {
  id: string
  /** Null while locked: an unreleased title has no name to show. */
  title: string | null
  tagline: string | null
  locked: boolean
}

/**
 * The cartridge shelf.
 *
 * The two locked slots are NOT filler. SCREEN-DETAIL.md section 6: they make
 * the platform claim legible in one glance, to a room of peer judges who will
 * never read a README and will not sit through a roadmap slide. That is a lot
 * of work for two dashed rectangles, and it is why they are modelled as real
 * entries rather than drawn as decoration by the screen.
 *
 * The one real title is read from `brand.ts`, CLAUDE.md rule 9.
 */
export function cartridges(): Array<Cartridge> {
  return [
    {
      id: 'cart-01',
      title: brand.CARTRIDGE_01,
      tagline:
        'provide liquidity without knowing what that means. pick a character, pick a pool, stay in range.',
      locked: false,
    },
    {
      id: 'cart-02',
      title: brand.CARTRIDGE_02,
      tagline:
        'read the live Monad price and call the next ten seconds. the monster is watching.',
      locked: false,
    },
    { id: 'cart-03', title: null, tagline: null, locked: true },
  ]
}
