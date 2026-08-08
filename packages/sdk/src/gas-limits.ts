/**
 * Explicit gas limits for every transaction we send.
 *
 * On Monad the user pays `gas_limit * price_per_gas`, NOT what the transaction
 * consumed. There is no refund. So a lazy limit is not a safety margin, it is
 * money taken from the player.
 *
 * SMART-CONTRACTS.md section 7 and the `gas` skill in monskills.
 *
 * ---------------------------------------------------------------------------
 * THE NUMBERS BELOW ARE MEASURED. HERE IS EXACTLY HOW.
 * ---------------------------------------------------------------------------
 *
 * `eth_estimateGas` against Monad testnet on 2026-08-07, called on the DEPLOYED
 * contract at `chains.testnet.contracts.diskRegistry`. Not Foundry, not
 * arithmetic. Two things were proven on chain while taking them, and both
 * change how a frontend has to be written.
 *
 * 1. A MONAD RECEIPT REPORTS `gasUsed` EQUAL TO `gasLimit`. Every time.
 *
 *      deploy      limit 723,652   receipt gasUsed 723,652
 *      createDisk  limit 162,035   receipt gasUsed 162,035
 *
 *    Two real transactions, tx `0x566a008b...` and `0xc63dc18e...`. This is the
 *    charge-on-limit rule showing up in the data, and it has a sharp corollary:
 *    YOU CANNOT LEARN ACTUAL CONSUMPTION FROM A RECEIPT ON MONAD. Anything that
 *    reads `receipt.gasUsed` to report "what this cost to run" is reading the
 *    limit back to itself. `eth_estimateGas` is the only signal.
 *
 * 2. FORGE MULTIPLIES ITS ESTIMATE BY 1.3 BEFORE BROADCASTING.
 *
 *      eth_estimateGas    556,656
 *      forge sent         723,652   = 556,656 x 1.30 exactly
 *
 *    On Ethereum that multiplier is free insurance because the surplus is
 *    refunded. On Monad it is a 30% bill. The deploy that produced these
 *    numbers overpaid by 166,996 gas for exactly this reason, because it was
 *    broadcast without `--gas-limit`. Deploy.s.sol now documents the flag as
 *    mandatory, and it is right to.
 */

/** True: every value in MEASURED came from a Monad RPC, not from Foundry. */
export const MEASURED_ON_MONAD = true

/** The date the measurements below were taken. Re-measure after a redeploy. */
export const MEASURED_ON = '2026-08-07'

/**
 * `eth_estimateGas` per code path, on the deployed contract.
 *
 * Measured per PATH rather than once per function, because the spread is real
 * and a single number would either overcharge the common case or under-fund the
 * worst one. On a chain that bills the limit, both of those are defects.
 */
export const MEASURED = {
  /** Create. Dominated by the 200-gas-per-byte code deposit, which Monad does
   *  not reprice, which is why it lands within 1% of Foundry's 551,305. */
  deploy: 556_656n,

  createDisk: {
    /** Caller has never been seen on chain. Cold account access, worst case. */
    coldCaller: 150_116n,
    /** Caller exists, owns no disks yet. The realistic first-disk path. */
    warmCallerFirstDisk: 147_305n,
    /** Caller already owns a disk, so the id array slot is not new. Cheapest. */
    warmCallerLaterDisk: 132_948n,
  },

  recordRun: {
    /** The run beats the best, so bestScore and bestDamage are both written. */
    updatesBest: 54_458n,
    /** A losing run. Still counted, still emitted, best untouched. */
    keepsBest: 53_695n,
    /** uint64 maxima for score and damage. Worst case. */
    maxValues: 54_651n,
  },
} as const

/**
 * Safety margin over the measured worst case.
 *
 * Five percent, not the `gas` skill's ten. The skill's 10% is an upper bound
 * for an ESTIMATE of unknown quality; these are measurements of a contract with
 * no unbounded loop and no external call, and the observed spread across every
 * path is already captured in MEASURED. What is left to cover is a chain
 * upgrade repricing an opcode, not our own variance.
 *
 * It is deliberately not zero. An out-of-gas transaction on Monad still bills
 * the full limit and delivers nothing, so under-shooting is strictly worse than
 * over-shooting by a little.
 */
export const SAFETY_MARGIN_PERCENT = 5n

function withMargin(worstCase: bigint): bigint {
  return worstCase + (worstCase * SAFETY_MARGIN_PERCENT) / 100n
}

/** Ship these. Measured worst case per function, plus the margin above. */
export const GAS_LIMITS = {
  createDisk: withMargin(MEASURED.createDisk.coldCaller),
  recordRun: withMargin(MEASURED.recordRun.maxValues),
} as const

/**
 * Deploy is not in GAS_LIMITS because the frontend never deploys. It is here so
 * the next person redeploying passes `--gas-limit` and does not repeat the 1.3x
 * overpayment described at the top of this file.
 */
export const DEPLOY_GAS_LIMIT = withMargin(MEASURED.deploy)

/**
 * Views are `eth_call` and cost the caller nothing. Listed so nobody adds a
 * limit for them out of symmetry.
 */
export const VIEW_FUNCTIONS = ['getDisk', 'diskIdsOf', 'totalDisks'] as const

/** Monad's per-transaction ceiling. A limit above this is always a bug. */
export const MONAD_TX_GAS_LIMIT = 30_000_000n

/**
 * Kept for the record, and because the reasoning earned it.
 *
 * Before anything was measured, this file predicted Monad cost as the Foundry
 * maximum plus 6,000 gas per distinct cold storage slot, with the slots counted
 * by hand from the source. Against the measurements above:
 *
 *   createDisk   predicted 148,983   measured 147,305   off by 1.1%
 *   recordRun    predicted  53,786   measured  54,458   off by 1.2%
 *
 * The model holds, which is worth knowing for the next contract: you can size a
 * Monad gas limit from a Foundry report and a careful slot count before you
 * have a deployment to measure. It is not a licence to skip the measurement.
 */
export const COLD_SLOT_SURCHARGE = 6_000n
export const PREDICTED_BEFORE_MEASUREMENT = {
  createDisk: 148_983n,
  recordRun: 53_786n,
} as const
