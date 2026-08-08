/**
 * Read the REAL Liquidity Book pools on Monad mainnet and commit the result.
 *
 *   bun run --cwd packages/sdk snapshot:pools
 *
 * WHY A SNAPSHOT AND NOT A LIVE CALL
 *
 * CLAUDE.md's first rule is that nothing in the demo path may fail on stage,
 * and the 2026-08-01 log says it again: if a tool only produces data, run it
 * offline and commit the output, because a committed snapshot has no uptime and
 * no live failure mode. So this is a build-time job, not a server.
 *
 * WHY EVERY CALL GOES THROUGH viem
 *
 * The first version of this file hand-wrote the function selectors and decoded
 * the return data by slicing hex. Seven of the ten selectors were wrong when
 * checked against keccak, and a wrong selector does not throw: it returns
 * something that decodes into a plausible number. viem derives selectors from
 * the ABI and decodes with it, which removes the entire class of error rather
 * than fixing this instance of it.
 *
 * WHAT IS REAL HERE AND WHAT IS NOT, FIELD BY FIELD
 *
 * Every number below is either read from chain or explicitly null. Nothing is
 * estimated, extrapolated, or filled in to make a screen look better.
 *
 *   pairAddress, tokenX, tokenY   read  LBFactory + ERC20 symbol/decimals
 *   binStep, activeBinId          read  the pair
 *   tvlUsd                        read  reserves priced off the active bin
 *   createdAt                     NULL  the RPC serves block headers back to
 *                                       genesis but PRUNES STATE about a
 *                                       million blocks back, so eth_getCode
 *                                       cannot be bisected for the creation
 *                                       block. A lower bound from the prune
 *                                       horizon would make the age gate reject
 *                                       pools that are in fact old enough,
 *                                       which is worse than admitting it.
 *   lpConcentration               read  busiest bin's share of the liquidity
 *                                       around active, from a bin scan
 *   volume24hUsd                  NULL  eth_getLogs is capped at a 100 block
 *                                       range on this RPC, about forty seconds
 *                                       of Monad. Twenty four hours is 216,000
 *                                       blocks. Extrapolating forty seconds
 *                                       into a day is exactly the invented
 *                                       number rule 1 forbids.
 *   realizedVol24h                NULL  needs price history, same cap
 *
 * A pool only enters the file if it holds real liquidity priced against a
 * stable leg. 46 of the 78 pairs on chain are completely empty.
 */

import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { createPublicClient, defineChain, http, erc20Abi } from 'viem'

import { chains } from '../src/chains'
import type { ChainKey } from '../src/chains'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * Which chain to snapshot. `mainnet` unless told otherwise.
 *
 *   bun run --cwd packages/sdk snapshot:pools            LFJ's book on mainnet
 *   bun run --cwd packages/sdk snapshot:pools testnet    OUR book on testnet
 *
 * The two are read by identical code on purpose. Liquidity Book is the same
 * contracts either way, so a testnet path with its own reader would be a second
 * implementation to keep honest; the only things that differ are which factory
 * to ask and which file to write.
 */
const CHAIN_KEY: ChainKey =
  process.argv[2] === 'testnet' ? 'testnet' : 'mainnet'

/**
 * `self-testnet` is the schema's name for a book we deployed ourselves
 * (apps/web/src/types/domain.ts, `zPoolsFixture`). It is a different claim from
 * `mainnet` and the file says which one it is, so a reader never has to infer
 * whether these pools are LFJ's or ours.
 */
const PROFILE = CHAIN_KEY === 'testnet' ? 'self-testnet' : 'mainnet'

// Not `.fixture.json`. That suffix is taken by the hand-written placeholder set
// the tests use, and overwriting it would delete the pools that fail specific
// gates on purpose. This file is read from chain; that one never was.
const OUT = resolve(REPO, `data/pools.${PROFILE}.json`)
const REFERENCE_BIN_ID = 8_388_608

/** Below this a pool is noise on a tracker, not a choice. */
const MIN_TVL_USD = 250

/**
 * How far above the measured state floor it is safe to probe.
 *
 * The floor is where state STOPS being served, and it advances continuously as
 * the node prunes. Monad produces roughly 150 blocks a minute and a snapshot
 * run takes several, so a probe aimed at the floor measured at startup is aimed
 * at a block that no longer exists by the time it fires. 50,000 blocks is about
 * five hours of headroom, which is far longer than any run and utterly small
 * against a window measured in millions.
 */
const FLOOR_SAFETY_BLOCKS = 50_000n

/** Bins either side of active to scan for the concentration figure. */
const CONCENTRATION_SPAN = 12

/**
 * Priced at one dollar, so a reserve can be valued without an oracle.
 *
 * `tUSD` is ours (contracts/src/TestToken.sol) and is a dollar by DEFINITION
 * rather than by market: it is the stable leg of every pair we seeded on
 * testnet, and nothing trades it against anything else. Listing it here is what
 * lets `tvlUsd` be computed at all on that chain, and the profile name in the
 * output file is what stops a reader mistaking those dollars for mainnet ones.
 */
const STABLES = new Set(['USDC', 'AUSD', 'USDT0', 'USDT', 'USD1', 'tUSD'])

const factoryAbi = [
  {
    type: 'function',
    name: 'getNumberOfLBPairs',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getLBPairAtIndex',
    stateMutability: 'view',
    inputs: [{ type: 'uint256' }],
    outputs: [{ type: 'address' }],
  },
] as const

const pairAbi = [
  {
    type: 'function',
    name: 'getTokenX',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'getTokenY',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'address' }],
  },
  {
    type: 'function',
    name: 'getBinStep',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint16' }],
  },
  {
    type: 'function',
    name: 'getActiveId',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint24' }],
  },
  {
    type: 'function',
    name: 'getReserves',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint128' }, { type: 'uint128' }],
  },
  {
    type: 'function',
    name: 'getBin',
    stateMutability: 'view',
    inputs: [{ type: 'uint24' }],
    outputs: [{ type: 'uint128' }, { type: 'uint128' }],
  },
] as const

const config = chains[CHAIN_KEY]

/**
 * The endpoint to read from, keyed override first.
 *
 * Same rule and same variable name as `apps/api/src/rpc.ts`: the public
 * endpoint is the checked-in default in chains.ts, and a keyed QuikNode url
 * lives in the environment because chains.ts is committed and the web bundle
 * reads it. This script is a build-time tool that never ships to a browser, so
 * it is free to use the fast endpoint, and it wants to: this run makes hundreds
 * of sequential `eth_getCode` calls bisecting for pool birthdays, and the
 * public endpoint rate-limits long before it finishes.
 */
const RPC_URL =
  (CHAIN_KEY === 'testnet' ? process.env.TESTNET_RPC_URL : undefined) ||
  config.rpcUrl

console.log(
  `reading ${CHAIN_KEY} via ${RPC_URL === config.rpcUrl ? 'the public endpoint' : 'the keyed endpoint from TESTNET_RPC_URL'}`,
)
const monad = defineChain({
  id: config.id,
  name: config.name,
  nativeCurrency: {
    name: config.nativeSymbol,
    symbol: config.nativeSymbol,
    decimals: 18,
  },
  rpcUrls: { default: { http: [RPC_URL] } },
})
const client = createPublicClient({
  chain: monad,
  transport: http(config.rpcUrl),
})

/**
 * The oldest block whose STATE this RPC still serves.
 *
 * Block headers go back to genesis; state does not. Found by bisecting on
 * whether eth_getCode answers at all, so it is measured on the day rather than
 * assumed, and it moves as the node prunes.
 */
async function stateFloor(head: bigint): Promise<bigint> {
  let low = 0n
  let high = head
  while (low < high) {
    const mid = (low + high) / 2n
    let ok = true
    try {
      await client.getCode({ address: FACTORY_PROBE, blockNumber: mid })
    } catch {
      ok = false
    }
    if (ok) high = mid
    else low = mid + 1n
  }
  return low
}

/**
 * The exact block a pair was born, WHEN THAT IS KNOWABLE.
 *
 * Bisecting on "does this address have bytecode yet" only works inside the
 * window where state is still served. A pair that already existed at the floor
 * returns null, and the caller records a proven lower bound on its age instead
 * of inventing a birthday. The distinction matters for the product: a pool
 * young enough to be worth filtering out was necessarily born inside the
 * window, so its age is exact. Only pools that are provably old come back
 * unknown, and those are the ones the age gate is not aimed at.
 */
async function creationBlock(
  address: `0x${string}`,
  floor: bigint,
  head: bigint,
): Promise<bigint | null> {
  // NEVER PROBE AT THE FLOOR ITSELF. The floor is the EDGE of the pruning
  // window and the window slides while this script runs: Monad produces roughly
  // 150 blocks a minute, so the exact block that answered during `stateFloor`
  // has usually been pruned by the time this loop reaches it, and the probe
  // fails with a bare "Invalid parameters" that reads like a bug in the call.
  // That is what it did on the first testnet run: four pairs, four skips.
  //
  // The margin costs one bisection step and buys a floor that is still valid
  // several minutes later. It is deliberately large against the window, which
  // is millions of blocks, and small against nothing that matters.
  const safeFloor = floor + FLOOR_SAFETY_BLOCKS
  if (safeFloor >= head) return null

  // A read that throws is an UNKNOWN birthday, not a young pool. Returning null
  // makes the caller fall back to the floor timestamp, which the pair provably
  // predates, so an RPC that prunes mid-run costs precision and never invents a
  // pool that is newer than it really is.
  const codeAt = async (blockNumber: bigint): Promise<string | null> => {
    try {
      return (await client.getCode({ address, blockNumber })) ?? '0x'
    } catch {
      return null
    }
  }

  const atFloor = await codeAt(safeFloor)
  if (atFloor === null) return null
  if (atFloor !== '0x') return null

  let low = safeFloor
  let high = head
  while (low < high) {
    const mid = (low + high) / 2n
    const code = await codeAt(mid)
    if (code === null) return null
    if (code === '0x') low = mid + 1n
    else high = mid
  }
  return low
}

const FACTORY = config.contracts.lbFactory
if (!FACTORY) throw new Error(`${CHAIN_KEY} lbFactory is null in chains.ts`)
const FACTORY_PROBE: `0x${string}` = FACTORY

function priceFromBinId(
  activeId: number,
  binStep: number,
  dx: number,
  dy: number,
): number {
  return (
    (1 + binStep / 10_000) ** (activeId - REFERENCE_BIN_ID) * 10 ** (dx - dy)
  )
}

interface TokenMeta {
  address: string
  symbol: string
  decimals: number
}

const tokenCache = new Map<string, TokenMeta>()

async function token(address: `0x${string}`): Promise<TokenMeta> {
  const key = address.toLowerCase()
  const hit = tokenCache.get(key)
  if (hit) return hit
  const [symbol, decimals] = await Promise.all([
    client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
    client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
  ])
  const meta: TokenMeta = { address, symbol, decimals }
  tokenCache.set(key, meta)
  return meta
}

/**
 * Share of nearby liquidity sitting in the single busiest bin.
 *
 * A true concentration figure needs every LP's position. This is the cheap
 * proxy the Pool type documents as "null when it cannot be read cheaply",
 * measured across the bins a range would actually occupy.
 */
async function concentration(
  pair: `0x${string}`,
  activeId: number,
  priceYPerX: number,
  dx: number,
  dy: number,
): Promise<number | null> {
  try {
    const ids: Array<number> = []
    for (let i = -CONCENTRATION_SPAN; i <= CONCENTRATION_SPAN; i += 1)
      ids.push(activeId + i)
    const bins = await Promise.all(
      ids.map((id) =>
        client.readContract({
          address: pair,
          abi: pairAbi,
          functionName: 'getBin',
          args: [id],
        }),
      ),
    )
    const values = bins.map(
      ([x, y]) => (Number(x) / 10 ** dx) * priceYPerX + Number(y) / 10 ** dy,
    )
    const total = values.reduce((a, b) => a + b, 0)
    if (total <= 0) return null
    return Math.min(1, Math.max(0, Math.max(...values) / total))
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------

const head = await client.getBlockNumber()
const floor = await stateFloor(head)
const headTimestamp = Number(
  (await client.getBlock({ blockNumber: head })).timestamp,
)
const floorTimestamp = Number(
  (await client.getBlock({ blockNumber: floor })).timestamp,
)
console.log(
  `state is served back to block ${floor}, ` +
    `${((headTimestamp - floorTimestamp) / 86_400).toFixed(1)} days`,
)
const count = await client.readContract({
  address: FACTORY,
  abi: factoryAbi,
  functionName: 'getNumberOfLBPairs',
})
console.log(`LBFactory reports ${count} pairs at block ${head}`)

const addresses = await Promise.all(
  Array.from({ length: Number(count) }, (_, i) =>
    client.readContract({
      address: FACTORY,
      abi: factoryAbi,
      functionName: 'getLBPairAtIndex',
      args: [BigInt(i)],
    }),
  ),
)

interface SnapshotPool {
  pairAddress: string
  tokenX: TokenMeta
  tokenY: TokenMeta
  binStep: number
  activeBinId: number
  tvlUsd: number
  volume24hUsd: number | null
  /** The birthday, or a timestamp the pair provably existed at or before. */
  createdAt: number
  createdAtIsExact: boolean
  lpConcentration: number | null
  realizedVol24h: number | null
}

const pools: Array<SnapshotPool> = []
let skippedEmpty = 0
let skippedThin = 0

for (const pair of addresses) {
  try {
    const read = <
      T extends
        | 'getTokenX'
        | 'getTokenY'
        | 'getBinStep'
        | 'getActiveId'
        | 'getReserves',
    >(
      functionName: T,
    ) => client.readContract({ address: pair, abi: pairAbi, functionName })

    const [x, y, binStepRaw, activeRaw, reserves] = await Promise.all([
      read('getTokenX'),
      read('getTokenY'),
      read('getBinStep'),
      read('getActiveId'),
      read('getReserves'),
    ])

    const [rx, ry] = reserves
    if (rx === 0n && ry === 0n) {
      skippedEmpty += 1
      continue
    }

    const [tokenX, tokenY] = await Promise.all([token(x), token(y)])

    const binStep = Number(binStepRaw)
    const activeBinId = Number(activeRaw)
    const price = priceFromBinId(
      activeBinId,
      binStep,
      tokenX.decimals,
      tokenY.decimals,
    )

    const amountX = Number(rx) / 10 ** tokenX.decimals
    const amountY = Number(ry) / 10 ** tokenY.decimals

    // One leg has to be priceable at a dollar, or the USD value is a guess. A
    // pool with no stable leg is skipped rather than valued from an oracle this
    // build does not have.
    let tvlUsd: number
    if (STABLES.has(tokenY.symbol)) tvlUsd = amountX * price + amountY
    else if (STABLES.has(tokenX.symbol)) tvlUsd = amountX + amountY / price
    else {
      skippedThin += 1
      continue
    }

    if (!Number.isFinite(tvlUsd) || tvlUsd < MIN_TVL_USD) {
      skippedThin += 1
      continue
    }

    const lpConcentration = await concentration(
      pair,
      activeBinId,
      price,
      tokenX.decimals,
      tokenY.decimals,
    )

    const born = await creationBlock(pair, floor, head)
    // A real timestamp either way, so `now - createdAt` is always a valid age.
    // When the birthday is unreadable this is the floor's timestamp, which the
    // pair provably predates, so the figure understates rather than flatters.
    const createdAt =
      born === null
        ? floorTimestamp
        : Number((await client.getBlock({ blockNumber: born })).timestamp)
    const createdAtIsExact = born !== null

    pools.push({
      pairAddress: pair,
      tokenX,
      tokenY,
      binStep,
      activeBinId,
      tvlUsd: Math.round(tvlUsd),
      volume24hUsd: null,
      createdAt,
      createdAtIsExact,
      lpConcentration,
      realizedVol24h: null,
    })

    console.log(
      `  ${`${tokenX.symbol}/${tokenY.symbol}`.padEnd(16)}bin ${String(binStep).padStart(3)}  ` +
        `$${Math.round(tvlUsd).toLocaleString().padStart(10)}  ` +
        (createdAtIsExact
          ? `age ${((headTimestamp - createdAt) / 86_400).toFixed(1)}d exact`
          : `age over ${((headTimestamp - createdAt) / 86_400).toFixed(1)}d`),
    )
  } catch (error) {
    console.log(`  ${pair} skipped: ${(error as Error).message.split('\n')[0]}`)
  }
}

pools.sort((a, b) => b.tvlUsd - a.tvlUsd)

const snapshot = {
  profile: PROFILE,
  chainId: config.id,
  capturedAt: new Date(headTimestamp * 1000).toISOString(),
  capturedAtBlock: Number(head),
  stateFloorBlock: Number(floor),
  stateWindowDays: Number(
    ((headTimestamp - floorTimestamp) / 86_400).toFixed(2),
  ),
  source: {
    pairAddress: 'chain',
    tokenX: 'chain',
    tokenY: 'chain',
    binStep: 'chain',
    activeBinId: 'chain',
    tvlUsd: 'chain, reserves priced off the active bin against a stable leg',
    createdAt:
      'chain, bisected inside the state window. When the pair already existed at the floor this is the floor timestamp, which the pair provably predates, so it is an upper bound on the birthday and therefore a lower bound on age.',
    createdAtIsExact:
      'chain. False means the pool is AT LEAST this old and possibly much older.',
    lpConcentration: 'chain, busiest bin share across the active neighbourhood',
    volume24hUsd: 'NOT READ. eth_getLogs is capped at 100 blocks on this RPC.',
    realizedVol24h: 'NOT READ. Needs price history the same cap forbids.',
  },
  pools,
}

await writeFile(OUT, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8')

console.log()
console.log(`wrote ${OUT}`)
console.log(
  `  ${pools.length} kept, ${skippedEmpty} empty, ${skippedThin} thin or unpriceable`,
)
if (pools.length === 0) {
  console.error('No pools survived. Refusing to call that a snapshot.')
  process.exit(1)
}
