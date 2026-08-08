import { createPublicClient, createWalletClient, defineChain, http } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'

import { chainFor, diskRegistryAbi, GAS_LIMITS } from '@pixmon-boy/sdk'
import type { ChainConfig } from '@pixmon-boy/sdk'

import type { RecordRunBody, RecordRunResult } from './model'

/**
 * Writing a finished run to `DiskRegistry`, from the server, behind a flag.
 *
 * WHAT THIS IS, SAID PLAINLY, BECAUSE THE PITCH DEPENDS ON IT
 *
 * The APP's keeper key signs. The player never signs anything and has no wallet
 * in this build. That is a real, verifiable claim ("here is a transaction my
 * application made while you watched") and it is a smaller claim than "the
 * player's wallet wrote to chain". The result object carries `signedBy:
 * 'keeper'` so a screen cannot accidentally imply the larger one. CLAUDE.md
 * rule 1.
 *
 * OFF BY DEFAULT, AND OFF IS NOT AN ERROR
 *
 * `ONCHAIN_RUNS` must be exactly "1". With the flag down, or the key missing,
 * or no contract deployed on the target chain, this returns
 * `{ recorded: false, reason }` with a 200. It never throws and never rejects.
 * A screen calling it must not be able to break because an RPC had a bad
 * afternoon at 17:55, which is the top rule in CLAUDE.md.
 *
 * SIMULATE BEFORE SENDING, ALWAYS
 *
 * On Monad a reverted transaction still bills the full gas limit and delivers
 * nothing. `simulateContract` is an `eth_call`, so it costs nothing and catches
 * the two reverts that can actually happen here: `DiskNotFound` for an unknown
 * id and `NotDiskOwner` when the keeper does not own the disk. Sending first
 * and reading the revert afterwards is how you pay for a mistake twice.
 *
 * EXPLICIT GAS LIMIT, FROM THE MEASURED NUMBER
 *
 * `GAS_LIMITS.recordRun` is the measured worst case plus 5%. Letting viem
 * estimate would apply no multiplier, but letting a wallet estimate would; and
 * on a chain that bills the limit rather than the usage, the limit is the price.
 * `packages/sdk/src/gas-limits.ts` carries the measurements.
 */

const RECEIPT_BUDGET_MS = 4_000

/** Cents to the contract's uint64. The chain stores whole units, not floats. */
function toUint64(cents: number): bigint {
  return BigInt(Math.max(0, Math.trunc(cents)))
}

function viemChain(config: ChainConfig) {
  return defineChain({
    id: config.id,
    name: config.name,
    nativeCurrency: {
      name: config.nativeSymbol,
      symbol: config.nativeSymbol,
      decimals: 18,
    },
    rpcUrls: { default: { http: [config.rpcUrl] } },
    blockExplorers: { default: { name: 'Monadscan', url: config.explorer } },
  })
}

export interface WriteContext {
  config: ChainConfig
  contract: `0x${string}`
  account: ReturnType<typeof privateKeyToAccount>
}

/**
 * Everything that has to be true before a write is even attempted.
 *
 * Returns a string describing the first missing thing, or a context. Kept as a
 * single function so `/runs/status` and `POST /runs` cannot disagree about
 * whether writing is possible.
 */
export function writeContext(): WriteContext | string {
  if (process.env.ONCHAIN_RUNS !== '1') {
    return 'ONCHAIN_RUNS is not set to 1'
  }

  const key = process.env.KEEPER_PRIVATE_KEY
  if (!key) return 'KEEPER_PRIVATE_KEY is not set'
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    return 'KEEPER_PRIVATE_KEY is not a 32 byte hex key'
  }

  const config = chainFor()
  const contract = config.contracts.diskRegistry
  if (!contract) return `DiskRegistry is not deployed on ${config.name}`

  return {
    config,
    contract,
    account: privateKeyToAccount(key as `0x${string}`),
  }
}

function disabled(reason: string): RecordRunResult {
  const config = chainFor()
  return {
    recorded: false,
    txHash: null,
    confirmed: false,
    explorerUrl: null,
    chainId: config.id,
    contract: config.contracts.diskRegistry,
    signer: null,
    signedBy: 'nobody',
    reason,
    gasLimit: null,
  }
}

export abstract class RunsService {
  static status() {
    const ctx = writeContext()
    const config = chainFor()
    if (typeof ctx === 'string') {
      return {
        enabled: process.env.ONCHAIN_RUNS === '1',
        configured: false,
        chainId: config.id,
        contract: config.contracts.diskRegistry,
        signer: null,
        reason: ctx,
      }
    }
    return {
      enabled: true,
      configured: true,
      chainId: ctx.config.id,
      contract: ctx.contract,
      signer: ctx.account.address,
      reason: null,
    }
  }

  static async record(body: RecordRunBody): Promise<RecordRunResult> {
    const ctx = writeContext()
    if (typeof ctx === 'string') return disabled(ctx)

    const { config, contract, account } = ctx
    const chain = viemChain(config)
    const transport = http(config.rpcUrl)
    const publicClient = createPublicClient({ chain, transport })
    const walletClient = createWalletClient({ account, chain, transport })

    const args = [
      BigInt(body.diskId),
      toUint64(body.scoreCents),
      toUint64(body.damageCents),
      body.durationSeconds,
      body.inRangeBps,
    ] as const

    let txHash: `0x${string}`
    try {
      // eth_call. Free, and it is what turns a revert into a readable 200
      // instead of a paid-for failure.
      const { request } = await publicClient.simulateContract({
        account,
        address: contract,
        abi: diskRegistryAbi,
        functionName: 'recordRun',
        args,
      })

      txHash = await walletClient.writeContract({
        ...request,
        gas: GAS_LIMITS.recordRun,
      })
    } catch (error) {
      const message =
        error instanceof Error ? error.message.split('\n')[0] : String(error)
      return disabled(`simulation or send failed: ${message}`)
    }

    // Monad's blocks are fast, so waiting is usually a fraction of a second and
    // makes the screen able to say "confirmed" rather than "sent". It is still
    // bounded: past the budget we return the hash and let the explorer be the
    // source of truth, because nothing on stage may hang on an RPC.
    let confirmed = false
    try {
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
        timeout: RECEIPT_BUDGET_MS,
      })
      confirmed = receipt.status === 'success'
    } catch {
      confirmed = false
    }

    return {
      recorded: true,
      txHash,
      confirmed,
      explorerUrl: `${config.explorer}/tx/${txHash}`,
      chainId: config.id,
      contract,
      signer: account.address,
      signedBy: 'keeper',
      reason: null,
      gasLimit: GAS_LIMITS.recordRun.toString(),
    }
  }
}
