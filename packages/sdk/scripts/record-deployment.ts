/**
 * Take the address forge just deployed and put it in `chains.ts`, once.
 *
 * The manual version of this is "read the address off the terminal, paste it
 * into chains.ts, hope you pasted the right one, remember to re-verify". Three
 * of those four steps are places to make a mistake at 11:40 on the day, and the
 * last one is the step people skip. So this reads the address from forge's own
 * broadcast artifact rather than from a human's clipboard.
 *
 * CLAUDE.md rule 11: an address is not trusted because a tool printed it. The
 * address is checked with `eth_getCode` against the live RPC BEFORE it is
 * written, and nothing is written if the check fails. `SMART-CONTRACTS.md`
 * section 10 says the address goes in exactly one file; this is the writer for
 * that one file.
 *
 *   bun run --cwd packages/sdk record:deployment
 *
 * Idempotent. Running it twice with the same artifact is a no-op that says so.
 */

import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { chains } from '../src/chains'
import type { ChainKey } from '../src/chains'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../..')
const CHAINS_TS = resolve(REPO, 'packages/sdk/src/chains.ts')

/** Which chain we expect. Deploy.s.sol asserts the same id. */
const TARGET: ChainKey = 'testnet'
const CONTRACT = 'DiskRegistry'
const FIELD = 'diskRegistry'

const artifact = resolve(
  REPO,
  `contracts/broadcast/Deploy.s.sol/${chains[TARGET].id}/run-latest.json`,
)

interface BroadcastTx {
  transactionType?: string
  contractName?: string
  contractAddress?: string
  hash?: string
}

function fail(message: string): never {
  console.error(`\n${message}\n`)
  process.exit(1)
}

// ---- 1. find what forge actually broadcast -------------------------------

let raw: string
try {
  raw = await readFile(artifact, 'utf8')
} catch {
  fail(
    `No broadcast artifact at\n  ${artifact}\n\n` +
      `Deploy first, from contracts/:\n` +
      `  forge script script/Deploy.s.sol:Deploy --rpc-url monad_testnet \\\n` +
      `    --account <keystore-name> --gas-limit 610000 --broadcast`,
  )
}

const parsed = JSON.parse(raw) as { transactions?: Array<BroadcastTx> }
const creates = (parsed.transactions ?? []).filter(
  (tx) => tx.transactionType === 'CREATE' && tx.contractName === CONTRACT,
)

if (creates.length === 0) {
  fail(`The artifact holds no CREATE for ${CONTRACT}. Nothing to record.`)
}

// The LAST create wins. A re-run appends, and the newest deploy is the live
// one; taking the first would silently record a contract that has been
// superseded, which is worse than recording nothing.
const deployed = creates[creates.length - 1]
const address = deployed.contractAddress

if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
  fail(`Artifact address is not a 20 byte address: ${String(address)}`)
}

if (creates.length > 1) {
  console.log(
    `note: ${creates.length} deploys in this artifact, taking the newest.`,
  )
}

// ---- 2. rule 11. Prove it holds code before writing it anywhere ----------

const chain = chains[TARGET]
const res = await fetch(chain.rpcUrl, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getCode',
    params: [address, 'latest'],
  }),
})
const body = (await res.json()) as {
  result?: string
  error?: { message: string }
}
if (body.error) fail(`eth_getCode failed: ${body.error.message}`)

const code = body.result ?? '0x'
if (code === '0x' || code === '') {
  fail(
    `${address} holds NO BYTECODE on ${chain.name}.\n` +
      `The broadcast may not be mined yet, or it reverted. Nothing written.`,
  )
}

console.log(
  `\n${CONTRACT} on ${chain.name} (chain ${chain.id})\n` +
    `  address   ${address}\n` +
    `  bytecode  ${(code.length - 2) / 2} bytes, confirmed by eth_getCode\n` +
    `  tx        ${deployed.hash ?? 'unknown'}\n` +
    `  explorer  ${chain.explorer}/address/${address}`,
)

// ---- 3. write it to the one file that is allowed to hold it --------------

const source = await readFile(CHAINS_TS, 'utf8')

// The testnet entry is the LAST `diskRegistry: null` in the file, because
// mainnet is declared first. Anchoring on that ordering would break the day
// somebody reorders the exports, so anchor on the export instead: split at
// `export const testnet` and only rewrite what follows it.
const marker = `export const ${TARGET}: ChainConfig`
const at = source.indexOf(marker)
if (at === -1) fail(`Could not find \`${marker}\` in chains.ts.`)

const head = source.slice(0, at)
const tail = source.slice(at)

// Scoped to the FIELD, not to the file. The first version asked whether the
// address appeared anywhere in chains.ts, which is true the moment the same
// address is also listed as some other contract, and the script then reported
// "already recorded" having written nothing. Caught by testing the happy path
// with a stand-in address that was already in the file as `usdc`.
if (tail.includes(`${FIELD}: '${address}'`)) {
  console.log(`\nchains.ts already records this address. Nothing to do.`)
  process.exit(0)
}

const needle = `${FIELD}: null,`
if (!tail.includes(needle)) {
  fail(
    `\`${needle}\` is not in the ${TARGET} entry. It may already be set to ` +
      `something else. Refusing to overwrite; edit chains.ts by hand.`,
  )
}

const updated = head + tail.replace(needle, `${FIELD}: '${address}',`)

await writeFile(CHAINS_TS, updated, 'utf8')

console.log(
  `\nchains.ts updated: ${TARGET}.contracts.${FIELD}\n` +
    `Now run:  bun run --cwd packages/sdk verify:addresses`,
)
