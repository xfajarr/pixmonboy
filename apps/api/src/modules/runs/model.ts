import { t } from 'elysia'

/**
 * A finished run, in the shape `DiskRegistry.recordRun` accepts.
 *
 * The bounds are the contract's own types, not opinions. score, damage and
 * timestamp are uint64; durationSeconds is uint32; inRangeBps is uint16 and is
 * basis points, so 10,000 is 100%. Validating here means a bad number is a 422
 * with a readable message instead of a revert that costs a full gas limit.
 */
export const recordRunBody = t.Object({
  diskId: t.Integer({ minimum: 0 }),
  /** Fees earned, in whole cents. See the note on scaling in service.ts. */
  scoreCents: t.Integer({ minimum: 0, maximum: 9_007_199_254_740_991 }),
  /** Damage taken, in whole cents. Always sent, never optional. Rule 2. */
  damageCents: t.Integer({ minimum: 0, maximum: 9_007_199_254_740_991 }),
  durationSeconds: t.Integer({ minimum: 0, maximum: 4_294_967_295 }),
  inRangeBps: t.Integer({ minimum: 0, maximum: 10_000 }),
})

export type RecordRunBody = typeof recordRunBody.static

/**
 * Every field a screen needs to tell the truth about what just happened.
 *
 * `recorded` is the only field a caller must branch on. `signer` and
 * `signedBy` exist because the honest sentence is "the app's keeper key wrote
 * this", not "your wallet did": the player never signs anything here, and a
 * screen that implies otherwise is making a claim rule 1 forbids.
 */
export const recordRunResult = t.Object({
  recorded: t.Boolean(),
  /** Present when recorded. Null otherwise, never an empty string. */
  txHash: t.Nullable(t.String()),
  /** True only if a receipt came back inside the budget. */
  confirmed: t.Boolean(),
  explorerUrl: t.Nullable(t.String()),
  chainId: t.Number(),
  contract: t.Nullable(t.String()),
  /** The address that actually signed. Never the player. */
  signer: t.Nullable(t.String()),
  signedBy: t.Union([t.Literal('keeper'), t.Literal('nobody')]),
  /** Why nothing was written. Always populated when recorded is false. */
  reason: t.Nullable(t.String()),
  gasLimit: t.Nullable(t.String()),
})

export type RecordRunResult = typeof recordRunResult.static

/** Whether writing is even possible right now, without attempting one. */
export const writeStatus = t.Object({
  enabled: t.Boolean(),
  configured: t.Boolean(),
  chainId: t.Number(),
  contract: t.Nullable(t.String()),
  signer: t.Nullable(t.String()),
  reason: t.Nullable(t.String()),
})
