/**
 * Turning a range the player drew into the transactions that open it.
 *
 * PURE. No React, no network, no wallet. It takes a plan and returns a list of
 * calls, which is what makes the interesting part of a real onchain deposit
 * testable without a chain: the encoding, the ordering, and the split between
 * the two tokens are all decided here and merely SENT somewhere else.
 *
 * WHY IT IS A LIST AND NOT ONE CALL
 *
 * `addLiquidity` moves tokens the router does not own yet, so a deposit is
 * never one transaction. The player's freshly minted card holds neither token
 * and has approved nothing, so the honest sequence is:
 *
 *   mint X, mint Y      the pool legs are our own TestToken, openly mintable,
 *                       and a testnet card has no other way to hold them
 *   approve X, approve Y  the router pulls with transferFrom
 *   addLiquidity        the one call that actually opens the position
 *
 * Every step is a real transaction the player's own wallet signs. That is the
 * point: until this file existed the keeper signed everything and the player's
 * card was decoration.
 */

import { encodeFunctionData, parseUnits } from 'viem'
import { lbRouterAbi, testTokenAbi } from '@pixmon-boy/sdk'
import { depositSplit } from '../range/bins'
import type { RangePlan } from '../range/bins'
import type { Pool } from '../../types/domain'

export interface DepositCall {
  /** Shown to the player as one row of the progress list. */
  label: string
  to: `0x${string}`
  data: `0x${string}`
}

export interface DepositRequest {
  pool: Pool
  plan: RangePlan
  /** The bin the range is centred on, read at execution time. */
  activeBinId: number
  /** Quote-token units the player is spending, as a human number. */
  amountQuote: number
  /** The address opening the position. */
  account: `0x${string}`
  router: `0x${string}`
  /** Unix seconds. The deadline is derived from it rather than from a clock. */
  nowSeconds: number
}

/** How long a deposit has to land before the router refuses it. */
const DEADLINE_SECONDS = 15 * 60

/**
 * Slippage, as basis points off the amounts we asked to deposit.
 *
 * Not zero, and not the seeding script's zero either. `SeedPools.s.sol` can use
 * zero because it creates the pool it is funding and nobody else is trading it;
 * a player depositing into a live pool can have the active bin move between
 * building this and it landing, and `addLiquidity` returns less than requested
 * when that happens. 1% is loose enough to survive a bin of drift and tight
 * enough that a genuinely broken quote still reverts.
 */
const SLIPPAGE_BPS = 100n

/**
 * Bins the active id may drift by before the router gives up.
 *
 * The same idea as the slippage above and a different unit, because Liquidity
 * Book checks both: `idSlippage` guards WHERE the liquidity lands, the amount
 * minimums guard HOW MUCH of it does.
 */
const ID_SLIPPAGE = 5n

function withSlippage(amount: bigint): bigint {
  return (amount * (10_000n - SLIPPAGE_BPS)) / 10_000n
}

/**
 * The two token amounts a deposit of `amountQuote` needs.
 *
 * `depositSplit` returns a FRACTION OF VALUE, so the base leg has to be
 * converted through the price before it is a token quantity. Reading the split
 * as a token split instead is the bug S6's own comment warns about, and it is
 * silent: the numbers still add up, they just describe a different position.
 */
export function depositAmounts(
  request: DepositRequest,
  priceQuotePerBase: number,
): { amountX: bigint; amountY: bigint } {
  const split = depositSplit(request.plan)

  const valueBase = request.amountQuote * split.baseFraction
  const valueQuote = request.amountQuote * split.quoteFraction

  // Base tokens = dollars of base / dollars per base token.
  const baseTokens = priceQuotePerBase > 0 ? valueBase / priceQuotePerBase : 0

  return {
    amountX: parseUnits(
      baseTokens.toFixed(request.pool.tokenX.decimals),
      request.pool.tokenX.decimals,
    ),
    amountY: parseUnits(
      valueQuote.toFixed(request.pool.tokenY.decimals),
      request.pool.tokenY.decimals,
    ),
  }
}

/**
 * The uniform distribution `SeedPools.s.sol` uses, rebuilt for the router.
 *
 * Bins below the active one hold only the quote token, bins above hold only the
 * base token, and the active bin holds both at half weight. Each array must sum
 * to exactly 1e18 or the router reverts, so the rounding dust goes to the
 * active bin — the one bin guaranteed to exist in every range.
 *
 * This is the same shape as the Solidity `_uniform`, and it has to be: the seed
 * script and the app are describing one fact about Liquidity Book, and if they
 * disagreed the player's position would sit differently from the liquidity it
 * was drawn against.
 */
export function uniformDistribution(plan: RangePlan): {
  deltaIds: Array<bigint>
  distributionX: Array<bigint>
  distributionY: Array<bigint>
} {
  const deltaIds: Array<bigint> = []
  const distributionX: Array<bigint> = []
  const distributionY: Array<bigint> = []

  const total = plan.binsBelow + plan.binsAbove + 1
  const halfShares = BigInt(total)
  const perHalf = 10n ** 18n / halfShares

  let sumX = 0n
  let sumY = 0n
  let activeIndex = 0

  for (let i = 0; i < total; i += 1) {
    const delta = i - plan.binsBelow
    deltaIds.push(BigInt(delta))

    if (delta > 0) {
      distributionX.push(perHalf * 2n)
      distributionY.push(0n)
      sumX += perHalf * 2n
    } else if (delta < 0) {
      distributionX.push(0n)
      distributionY.push(perHalf * 2n)
      sumY += perHalf * 2n
    } else {
      activeIndex = i
      distributionX.push(perHalf)
      distributionY.push(perHalf)
      sumX += perHalf
      sumY += perHalf
    }
  }

  distributionX[activeIndex] += 10n ** 18n - sumX
  distributionY[activeIndex] += 10n ** 18n - sumY

  return { deltaIds, distributionX, distributionY }
}

/**
 * Every call needed to open the position, in the order they must be sent.
 *
 * The mints are unconditional rather than balance-aware, and that is a choice
 * with a reason: reading two balances and two allowances first would add four
 * round trips to decide something a testnet card is virtually never on the
 * other side of, and a mint of a worthless token costs only gas the faucet
 * already provided. On a chain where the tokens were real this would be wrong,
 * which is why `TestToken` and this file are both testnet-only by construction.
 */
export function buildDepositCalls(
  request: DepositRequest,
  priceQuotePerBase: number,
): Array<DepositCall> {
  const { pool, plan, account, router, activeBinId, nowSeconds } = request
  const { amountX, amountY } = depositAmounts(request, priceQuotePerBase)
  const { deltaIds, distributionX, distributionY } = uniformDistribution(plan)

  const tokenX = pool.tokenX.address as `0x${string}`
  const tokenY = pool.tokenY.address as `0x${string}`

  const mint = (
    token: `0x${string}`,
    amount: bigint,
    symbol: string,
  ): DepositCall => ({
    label: `Get ${symbol}`,
    to: token,
    data: encodeFunctionData({
      abi: testTokenAbi,
      functionName: 'mint',
      args: [account, amount],
    }),
  })

  const approve = (
    token: `0x${string}`,
    amount: bigint,
    symbol: string,
  ): DepositCall => ({
    label: `Allow ${symbol}`,
    to: token,
    data: encodeFunctionData({
      abi: testTokenAbi,
      functionName: 'approve',
      args: [router, amount],
    }),
  })

  return [
    mint(tokenX, amountX, pool.tokenX.symbol),
    mint(tokenY, amountY, pool.tokenY.symbol),
    approve(tokenX, amountX, pool.tokenX.symbol),
    approve(tokenY, amountY, pool.tokenY.symbol),
    {
      label: 'Open the position',
      to: router,
      data: encodeFunctionData({
        abi: lbRouterAbi,
        functionName: 'addLiquidity',
        args: [
          {
            tokenX,
            tokenY,
            binStep: BigInt(pool.binStep),
            amountX,
            amountY,
            amountXMin: withSlippage(amountX),
            amountYMin: withSlippage(amountY),
            activeIdDesired: BigInt(activeBinId),
            idSlippage: ID_SLIPPAGE,
            deltaIds,
            distributionX,
            distributionY,
            to: account,
            refundTo: account,
            deadline: BigInt(nowSeconds + DEADLINE_SECONDS),
          },
        ],
      }),
    },
  ]
}
