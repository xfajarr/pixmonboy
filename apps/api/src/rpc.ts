/**
 * Server-only RPC resolution.
 *
 * `packages/sdk/src/chains.ts` ships the public Monad endpoints as defaults,
 * which is the right place for a checked-in default that both the web app and
 * the API can read. This file exists because the API can go faster than the
 * public endpoint: a keyed QuikNode url is read from env and used in its
 * place, and it must never live in `chains.ts` where the web bundle would
 * ship it to every browser. `chain/service.ts` has the same rule and says so.
 *
 * Everything here is explicit: the env var names are written down once, and a
 * chain without an override gets its SDK default. No implicit behaviour.
 */

const TESTNET_HTTP_ENV = 'TESTNET_RPC_URL'
const TESTNET_WSS_ENV = 'TESTNET_RPC_WS_URL'

/**
 * The HTTP RPC for the given chain, env override first.
 *
 * Only the testnet has a keyed override; mainnet keeps its public endpoint.
 */
export function rpcHttpFor(
  config: { key: string; rpcUrl: string },
): string {
  if (config.key === 'testnet') {
    return process.env[TESTNET_HTTP_ENV] || config.rpcUrl
  }
  return config.rpcUrl
}

/**
 * The websocket RPC for the given chain, env override first.
 *
 * WSS is the real-time path: pending transactions, new blocks, live bin
 * updates. Falls back to the SDK default when no override is configured.
 */
export function rpcWssFor(config: {
  key: string
  rpcWssUrl: string | null
}): string | null {
  if (config.key === 'testnet') {
    return process.env[TESTNET_WSS_ENV] || config.rpcWssUrl
  }
  return config.rpcWssUrl
}
