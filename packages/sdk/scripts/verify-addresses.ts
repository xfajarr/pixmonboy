/**
 * Re-check every address in `chains.ts` against the live RPC.
 *
 * CLAUDE.md rule 11 exists because two published registries listed Liquidity
 * Book addresses on Monad testnet that hold no code. A comment claiming an
 * address was verified rots the moment nobody re-runs the check, so the check
 * is a command: `bun run --cwd packages/sdk verify:addresses`.
 *
 * Exits non-zero if any non-null address has no bytecode, which is the whole
 * point. A null entry is skipped, because null is already the honest answer.
 */

import { chains, VERIFIED_ON } from '../src/chains'
import type { ChainConfig } from '../src/chains'

const TIMEOUT_MS = 15_000

async function getCode(rpcUrl: string, address: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getCode',
        params: [address, 'latest'],
      }),
      signal: controller.signal,
    })
    const json = (await res.json()) as {
      result?: string
      error?: { message: string }
    }
    if (json.error) throw new Error(json.error.message)
    return json.result ?? '0x'
  } finally {
    clearTimeout(timer)
  }
}

interface ChainReport {
  lines: Array<string>
  failures: number
}

/**
 * Returns its output instead of printing it.
 *
 * The first version logged directly and the chains were checked with
 * Promise.all, so both headers printed first and every row landed under
 * whichever header happened to be last. The report then read as though testnet
 * had a 24,044 byte lbFactory. That is precisely the false claim this script
 * exists to catch, produced by the script itself, so the output is now
 * assembled per chain and printed in one piece.
 */
async function checkChain(chain: ChainConfig): Promise<ChainReport> {
  const entries = Object.entries(chain.contracts).filter(
    (entry): entry is [string, `0x${string}`] => entry[1] !== null,
  )

  const lines = [`\n${chain.name} (chain ${chain.id})  ${chain.rpcUrl}`]
  if (entries.length === 0) {
    lines.push('  no non-null addresses to check')
    return { lines, failures: 0 }
  }

  let failures = 0
  for (const [name, address] of entries) {
    try {
      const code = await getCode(chain.rpcUrl, address)
      if (code === '0x' || code === '') {
        lines.push(`  FAIL  ${name.padEnd(14)} ${address}  no bytecode`)
        failures += 1
      } else {
        // `code` is a 0x-prefixed hex STRING. Printing `code.length` reports
        // twice the real size plus two, so a 2,304 byte contract announced
        // itself as 4,610 bytes. record-deployment.ts always did this right.
        const bytes = (code.length - 2) / 2
        lines.push(
          `  ok    ${name.padEnd(14)} ${address}  ${bytes.toLocaleString()} bytes of code`,
        )
      }
    } catch (error) {
      lines.push(
        `  ERROR ${name.padEnd(14)} ${address}  ${(error as Error).message}`,
      )
      failures += 1
    }
  }
  return { lines, failures }
}

const reports = await Promise.all(Object.values(chains).map(checkChain))
for (const report of reports) console.log(report.lines.join('\n'))
const failures = reports.reduce((total, report) => total + report.failures, 0)

console.log(`\nlast recorded verification: ${VERIFIED_ON}`)
if (failures > 0) {
  console.log(
    `${failures} address(es) hold no code. Fix chains.ts before shipping.`,
  )
  process.exit(1)
}
console.log('every non-null address holds bytecode.')
