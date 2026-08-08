import { chainFor, chains, hasLiquidityBook, VERIFIED_ON } from '@pixmon-boy/sdk'
import type { ChainConfig, ChainKey } from '@pixmon-boy/sdk'

import type { ChainSummary } from './model'

/**
 * Chain facts, with no network access.
 *
 * Every value here comes out of `packages/sdk/src/chains.ts`, which is a
 * checked-in constant file. CLAUDE.md forbids a live third-party call in the
 * demo path, and a screen asking "which chain am I on" must never be able to
 * hang on an RPC that is having a bad afternoon. Reads that genuinely need the
 * chain are Lane B phase 2 and will be separate endpoints with their own
 * failure ladder, per INTEGRATIONS.md.
 *
 * The rpcUrl is deliberately NOT exposed. A browser does not need it, and not
 * shipping it keeps the endpoint safe to make public later.
 */
export abstract class ChainService {
  static summarise(chain: ChainConfig): ChainSummary {
    return {
      key: chain.key,
      id: chain.id,
      name: chain.name,
      explorer: chain.explorer,
      nativeSymbol: chain.nativeSymbol,
      liquidityBookAvailable: hasLiquidityBook(chain),
      verifiedOn: VERIFIED_ON,
      contracts: { ...chain.contracts },
    }
  }

  /** The chain the app targets by default. */
  static current(): ChainSummary {
    return ChainService.summarise(chainFor())
  }

  static byKey(key: ChainKey): ChainSummary {
    return ChainService.summarise(chains[key])
  }

  static all(): Array<ChainSummary> {
    return Object.values(chains).map(ChainService.summarise)
  }
}
