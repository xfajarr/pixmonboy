/**
 * `@pixmon-boy/sdk` — everything that knows a chain exists.
 *
 * The web app and the API both read this package and neither one hardcodes an
 * address, an RPC url, or a chain id. `ARCHITECTURE.md` keeps `src/console/`
 * ignorant of money; this package is the opposite end of that idea, the single
 * place that is allowed to know about it.
 */

export {
  chainById,
  chainFor,
  chains,
  DEFAULT_CHAIN,
  hasLiquidityBook,
  LIQUIDITY_CHAIN,
  mainnet,
  testnet,
  VERIFIED_ON,
} from './chains'

export type { ChainConfig, ChainContracts, ChainKey } from './chains'

export { diskRegistryAbi } from './abi/disk-registry'

export {
  COLD_SLOT_SURCHARGE,
  DEPLOY_GAS_LIMIT,
  GAS_LIMITS,
  MEASURED,
  MEASURED_ON,
  MEASURED_ON_MONAD,
  MONAD_TX_GAS_LIMIT,
  PREDICTED_BEFORE_MEASUREMENT,
  SAFETY_MARGIN_PERCENT,
  VIEW_FUNCTIONS,
} from './gas-limits'
