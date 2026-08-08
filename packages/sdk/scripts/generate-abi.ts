/**
 * Regenerate `src/abi/disk-registry.ts` from forge's build artifact.
 *
 * The ABI is committed because `contracts/out/` is gitignored, so a clone has
 * the artifact only after `forge build`. Generating rather than hand-writing is
 * the point: a mistyped ABI encodes a different selector, and the call reverts
 * on chain with a message that points nowhere.
 *
 *   bun run --cwd packages/sdk generate:abi
 *
 * Run `forge build` in contracts/ first. This script says so rather than
 * shelling out, because a generator that silently rebuilds is a generator that
 * can quietly pick up uncommitted contract edits.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../../..')
const ARTIFACT = resolve(
  REPO,
  'contracts/out/DiskRegistry.sol/DiskRegistry.json',
)
const OUT = resolve(REPO, 'packages/sdk/src/abi/disk-registry.ts')

let raw: string
try {
  raw = await readFile(ARTIFACT, 'utf8')
} catch {
  console.error(`No artifact at ${ARTIFACT}`)
  console.error('Run `forge build` in contracts/ first.')
  process.exit(1)
}

const artifact = JSON.parse(raw) as {
  abi: Array<{ type?: string; name?: string }>
}
const kept = artifact.abi.filter(
  (entry) =>
    entry.type === 'function' ||
    entry.type === 'event' ||
    entry.type === 'error',
)

const header = `/**
 * \`DiskRegistry\` ABI, GENERATED from \`contracts/out/DiskRegistry.sol/DiskRegistry.json\`.
 *
 * Do not hand-edit and do not hand-write one of these. A mistyped ABI does not
 * fail loudly: it encodes a different selector and the call reverts on chain
 * with a message that points nowhere, which is the worst kind of bug to meet at
 * 16:00 on a Saturday.
 *
 * Regenerate with:  bun run --cwd packages/sdk generate:abi
 *
 * \`as const\` is load bearing. viem reads the literal types out of it to make
 * \`writeContract\` argument-checked at compile time; widen it to \`Abi\` and every
 * call site silently accepts anything.
 */
`

await mkdir(dirname(OUT), { recursive: true })
await writeFile(
  OUT,
  `${header}export const diskRegistryAbi = ${JSON.stringify(kept, null, 2)} as const\n`,
  'utf8',
)

const names = (t: string) =>
  kept
    .filter((e) => e.type === t)
    .map((e) => e.name)
    .join(', ')
console.log(`wrote ${OUT}`)
console.log(`  functions  ${names('function')}`)
console.log(`  events     ${names('event')}`)
console.log(`  errors     ${names('error')}`)
