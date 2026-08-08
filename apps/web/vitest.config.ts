import { defineConfig } from 'vitest/config'

/**
 * The one guard that actually fires on the wrong runtime.
 *
 * `bun run test` only *launches* vitest; vitest itself is a Node process, so
 * the Bun version is irrelevant here and `node -v` is the whole story. jsdom 30
 * reaches undici's `webidl.util.markAsUncloneable`, which does not exist before
 * Node 22.5.
 *
 * Below that, the nine files carrying `// @vitest-environment jsdom` (every
 * screen test) fail to start their worker while the pure `environment: 'node'`
 * files still pass, so the summary reads `Test Files 12 passed (12)` above a
 * thirty-line undici stack trace. The exit code is 1 and the gate does hold,
 * but a human skimming for green sees green. That is the failure this catches.
 *
 * It lives HERE and not in `.nvmrc` or `engines`, because neither of those
 * fires: `bun install` ignores `engines` entirely, and `.nvmrc` is read only by
 * a version manager somebody remembers to invoke. This runs in the main process
 * on every path that can run a test: `bun run test`, `test:watch`,
 * `test:coverage`, a bare `bunx vitest`, and CI.
 */
const MIN_NODE_MAJOR = 22
const major = Number(process.versions.node.split('.')[0])
if (major < MIN_NODE_MAJOR) {
  throw new Error(
    `Node ${process.versions.node} cannot run the jsdom screen tests. ` +
      `jsdom 30 needs Node >= ${MIN_NODE_MAJOR} (CI and the README pin 24).\n` +
      `Bun is the package manager, not the runtime, so \`bun -v\` does not help.\n` +
      `Put a Node >= ${MIN_NODE_MAJOR} first on PATH and re-run \`bun run verify\`.`,
  )
}

/**
 * Deliberately separate from vite.config.ts.
 *
 * The Start plugin builds a server bundle and a route tree. Tests do not need
 * either, and loading them adds seconds to every run, which is the difference
 * between a test suite you run constantly and one you stop running.
 *
 * Default environment is node, because the modules with real coverage pressure
 * (lib/scoring, lib/range, design) are pure. A file that needs a DOM opts in
 * with `// @vitest-environment jsdom` on its first line.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**', 'src/design/**'],
      // Only the pure modules are held to a number. console/, ui/, and game/
      // are visual and tested by looking at them, per ARCHITECTURE.md 10.
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
  resolve: {
    alias: {
      '#': new URL('./src/', import.meta.url).pathname,
      '@': new URL('./src/', import.meta.url).pathname,
    },
  },
})
