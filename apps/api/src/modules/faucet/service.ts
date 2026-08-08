import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  isAddress,
  parseEther,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import { chainFor } from '@pixmon-boy/sdk'
import type { ChainConfig } from '@pixmon-boy/sdk'

import { rpcHttpFor } from '../../rpc'

/**
 * A gas drip, so a freshly created embedded wallet can send its first
 * transaction.
 *
 * WHY THIS HAS TO EXIST
 *
 * On EVM the SENDER pays. A Privy embedded wallet is minted with a zero
 * balance, so "connect your wallet and save your run onchain" is not a wallet
 * problem, it is a funding problem: without a drip the very first transaction
 * fails with `insufficient funds` and the demo dies on stage. The player then
 * needs two funded transactions, `createDisk` (they must own the disk or
 * `recordRun` reverts with NotDiskOwner) and `recordRun` itself.
 *
 * TESTNET ONLY, AND IT REFUSES TO BE ANYTHING ELSE
 *
 * `drip` rejects any chain that is not 10143. The keeper key holds
 * faucet gas and nothing else, but a faucet that would happily run on mainnet
 * if a config flipped is a faucet that eventually does.
 *
 * BOUNDED THREE WAYS
 *
 * One drip per address, a hard cap on the number of drips for the whole
 * process lifetime, and a refusal to top up an address that already has enough.
 * The keeper holds a finite balance and this endpoint is reachable by anyone
 * who can reach the app. None of these are security in the real sense; they are
 * the difference between a demo running out of gas at 17:00 and not.
 */

/** Enough for createDisk (~150k) plus recordRun (~55k) with room over. */
const DRIP_MON = '0.05'

/** Below this, an address is considered unable to transact and gets a drip. */
const NEEDS_GAS_BELOW_MON = '0.02'

/** Whole-process ceiling. 40 x 0.05 = 2 MON of the keeper's balance. */
const MAX_DRIPS = 40

/** A plain native transfer is always exactly this. The `gas` skill says
 *  hardcode it rather than estimating, because an estimate that reverts makes
 *  a wallet invent a limit and on Monad the limit is the price. */
const TRANSFER_GAS = 21_000n

const dripped = new Set<string>()
let dripCount = 0

function viemChain(config: ChainConfig) {
  return defineChain({
    id: config.id,
    name: config.name,
    nativeCurrency: {
      name: config.nativeSymbol,
      symbol: config.nativeSymbol,
      decimals: 18,
    },
    rpcUrls: { default: { http: [rpcHttpFor(config)] } },
    blockExplorers: { default: { name: 'Monadscan', url: config.explorer } },
  })
}

export interface FaucetResult {
  funded: boolean
  txHash: string | null
  amountMon: string | null
  balanceMon: string | null
  reason: string | null
  remainingDrips: number
}

function refuse(
  reason: string,
  balanceMon: string | null = null,
): FaucetResult {
  return {
    funded: false,
    txHash: null,
    amountMon: null,
    balanceMon,
    reason,
    remainingDrips: Math.max(0, MAX_DRIPS - dripCount),
  }
}

export abstract class FaucetService {
  static status() {
    const config = chainFor()
    const key = process.env.KEEPER_PRIVATE_KEY
    const configured =
      process.env.ONCHAIN_RUNS === '1' &&
      !!key &&
      /^0x[0-9a-fA-F]{64}$/.test(key)
    return {
      enabled: configured && config.id === 10143,
      chainId: config.id,
      dripMon: DRIP_MON,
      remainingDrips: Math.max(0, MAX_DRIPS - dripCount),
      reason: configured
        ? config.id === 10143
          ? null
          : 'faucet only runs on Monad testnet'
        : 'ONCHAIN_RUNS or KEEPER_PRIVATE_KEY missing',
    }
  }

  /**
   * How much native MON an address holds, as a string.
   *
   * Lives on the faucet rather than on `chain`, which is deliberately
   * zero-network (see chain/service.ts): this module already reads balances
   * because that is how `drip` decides, so the capability is here and adding it
   * next door would put an RPC call inside a module whose documented promise is
   * that it never makes one.
   *
   * `balanceMon` is null when the read failed, never 0. A zero balance and an
   * unreachable RPC produce very different screens, and collapsing them would
   * make an outage look like an empty wallet.
   */
  static async balanceOf(
    address: string,
  ): Promise<{ balanceMon: string | null; reason: string | null }> {
    if (!isAddress(address)) {
      return { balanceMon: null, reason: 'not a valid address' }
    }

    const config = chainFor()
    try {
      const client = createPublicClient({
        chain: viemChain(config),
        transport: http(rpcHttpFor(config)),
      })
      const balance = await client.getBalance({ address })
      return { balanceMon: (Number(balance) / 1e18).toFixed(4), reason: null }
    } catch (error) {
      return {
        balanceMon: null,
        reason: (error as Error).message.split('\n')[0],
      }
    }
  }

  static async drip(address: string): Promise<FaucetResult> {
    if (!isAddress(address)) return refuse('not a valid address')

    const key = process.env.KEEPER_PRIVATE_KEY
    if (process.env.ONCHAIN_RUNS !== '1')
      return refuse('ONCHAIN_RUNS is not set to 1')
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
      return refuse('KEEPER_PRIVATE_KEY is not set')
    }

    const config = chainFor()
    if (config.id !== 10143) return refuse('faucet only runs on Monad testnet')

    const target = address.toLowerCase()
    if (dripped.has(target)) return refuse('already funded this address once')
    if (dripCount >= MAX_DRIPS)
      return refuse('faucet is empty for this session')

    const chain = viemChain(config)
    const transport = http(rpcHttpFor(config))
    const publicClient = createPublicClient({ chain, transport })

    let balance: bigint
    try {
      balance = await publicClient.getBalance({ address })
    } catch (error) {
      return refuse(
        `could not read balance: ${(error as Error).message.split('\n')[0]}`,
      )
    }

    const balanceMon = (Number(balance) / 1e18).toFixed(4)
    if (balance >= parseEther(NEEDS_GAS_BELOW_MON)) {
      return refuse('address already has enough gas', balanceMon)
    }

    const account = privateKeyToAccount(key as `0x${string}`)
    const walletClient = createWalletClient({ account, chain, transport })

    try {
      const txHash = await walletClient.sendTransaction({
        to: address,
        value: parseEther(DRIP_MON),
        gas: TRANSFER_GAS,
      })

      dripped.add(target)
      dripCount += 1

      return {
        funded: true,
        txHash,
        amountMon: DRIP_MON,
        balanceMon,
        reason: null,
        remainingDrips: Math.max(0, MAX_DRIPS - dripCount),
      }
    } catch (error) {
      return refuse(
        `send failed: ${(error as Error).message.split('\n')[0]}`,
        balanceMon,
      )
    }
  }
}
