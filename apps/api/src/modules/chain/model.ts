import { t } from 'elysia'

/**
 * What a client is allowed to learn about the chain we are pointed at.
 *
 * Addresses are echoed as nullable on purpose. `packages/sdk/src/chains.ts`
 * stores `null` for anything that has never returned bytecode, and flattening
 * that to a string here would reintroduce exactly the lie rule 11 exists to
 * prevent.
 */
export const chainContracts = t.Object({
  multicall3: t.Nullable(t.String()),
  wrappedNative: t.Nullable(t.String()),
  usdc: t.Nullable(t.String()),
  lbFactory: t.Nullable(t.String()),
  lbRouter: t.Nullable(t.String()),
  lbQuoter: t.Nullable(t.String()),
  lbDexLens: t.Nullable(t.String()),
  lbDemoPair: t.Nullable(t.String()),
  pythPriceFeed: t.Nullable(t.String()),
  diskRegistry: t.Nullable(t.String()),
})

export const chainSummary = t.Object({
  key: t.Union([t.Literal('mainnet'), t.Literal('testnet')]),
  id: t.Number(),
  name: t.String(),
  explorer: t.String(),
  nativeSymbol: t.String(),
  /** False on testnet today. See chains.ts, and SMART-CONTRACTS.md section 0. */
  liquidityBookAvailable: t.Boolean(),
  /** The date the addresses were last checked with eth_getCode. */
  verifiedOn: t.String(),
  contracts: chainContracts,
})

export const chainNotFound = t.Literal('Unknown chain')

export type ChainSummary = typeof chainSummary.static
