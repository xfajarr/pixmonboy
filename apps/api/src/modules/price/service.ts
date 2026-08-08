/**
 * Reads the live MON price from Pyth's Hermes API.
 *
 * WHERE THE PRICE COMES FROM, SAID PLAINLY
 *
 * MON/USD on Pyth is an aggregate of market prices, republished by Pyth a few
 * times a minute. The freshest copy of it is not on the Monad chain: Pyth
 * keepers batch updates onchain, and `getPriceUnsafe` on Monad returns a
 * reading that can be tens of seconds old. Hermes is Pyth's own read side —
 * the same feed, delivered the moment it is published — so the "latest price"
 * lives there, not behind an eth_call that lags it.
 *
 * This file reads the feed id through Hermes for exactly that reason: the
 * product is a game about a moving price, and a monster animated by a stale
 * number stands still. An onchain read is the wrong way to ask "what is the
 * price NOW". The feed id is the same one the first onchain build used, so
 * the number cannot disagree with the chain when both are fresh; Hermes is
 * just earlier.
 *
 * WHY AN OFFCHAIN READ IS NOT A LIE
 *
 * The price shown is still Pyth's published MON/USD price. Reading it over
 * HTTPS instead of eth_call changes the transport, not the source: the same
 * keepers publish, the same feed id resolves, and the screen never invents a
 * number. It is fresher, which is the whole point of a price game.
 *
 * THE FAILURE LADDER (CLAUDE.md: nothing in the demo path may fail)
 *
 * Hermes is a live third-party service and can have a bad afternoon. The read
 * has a hard budget; past it the endpoint answers `{ ok: false, reason }`
 * with the last good price if there is one. The screen never sees a stack
 * trace.
 */

const READ_BUDGET_MS = 1_500

/** Crypto.MON/USD on Pyth. Verified readable on 2026-08-08. */
const MON_USD_FEED_ID =
  '0x31491744e2dbf6df7fcf4ac0820d18a609b49076d45066d3568424e62f686cd1'

const HERMES_PRICE_URL =
  'https://hermes.pyth.network/v2/updates/price/latest?ids[]=' + MON_USD_FEED_ID

export type MonPriceResult =
  | { ok: true; priceUsd: number; at: number }
  | { ok: false; priceUsd: number; at: number; stale: true }
  | { ok: false; reason: string }

/** The last price we read, so a second consecutive failure is still not a
 *  crash on screen: the screen gets the last known number, clearly stamped. */
let lastGoodPrice: { priceUsd: number; at: number } | null = null

export async function liveMonPrice(): Promise<MonPriceResult> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), READ_BUDGET_MS)
  try {
    const res = await fetch(HERMES_PRICE_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`hermes http ${res.status}`)
    const body = (await res.json()) as {
      parsed: Array<{ price: { price: string; expo: number; publish_time: number } }>
    }
    // Length check, not a truthiness check on `parsed[0]`: noUncheckedIndexedAccess
    // is off, so an out-of-bounds read is typed present while being undefined
    // at runtime. An empty feed is a real state and must not throw in silence.
    if (body.parsed.length < 1) throw new Error('hermes returned no MON/USD feed')
    const feed = body.parsed[0]

    const priceUsd = Number(feed.price.price) * 10 ** feed.price.expo
    lastGoodPrice = { priceUsd, at: Date.now() }
    return { ok: true, priceUsd, at: Date.now() }
  } catch (error) {
    // Stale-but-stamped beats nothing: the screen shows the last known price
    // and the timestamp proves it is not pretending to be fresh.
    if (lastGoodPrice) {
      return { ok: false, ...lastGoodPrice, stale: true as const }
    }
    const message =
      error instanceof Error ? error.message.split('\n')[0] : String(error)
    return { ok: false, reason: `price read failed: ${message}` }
  } finally {
    clearTimeout(timeout)
  }
}
