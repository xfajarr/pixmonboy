import { resolve } from 'node:path'

import { defineConfig, loadEnv } from 'vite'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Put the workspace's SERVER-ONLY variables into `process.env`.
 *
 * `envDir` below fixes `import.meta.env`, which is the CLIENT's view of the
 * environment and only ever contains `VITE_` keys. It does nothing for
 * `process.env`, and `process.env` is what the API reads — the API is mounted
 * inside this very server (`src/routes/api.$.ts`), so it runs in this process,
 * with this process's environment.
 *
 * Bun does auto-load a `.env`, but from the CURRENT WORKING DIRECTORY, which
 * for `vite dev` is `apps/web`. The file is at the workspace root. So the
 * mounted API saw no `KEEPER_PRIVATE_KEY`, `FaucetService.status()` answered
 * `ONCHAIN_RUNS or KEEPER_PRIVATE_KEY missing`, and the top-up screen reported
 * that faithfully while the key sat in `.env.local` the whole time.
 *
 * `VITE_` keys are skipped: those already reach the client through
 * `import.meta.env` and copying them here would buy nothing. Everything else is
 * server-only by construction — this function runs in the Vite config, which is
 * Node, and never in a browser bundle. An existing value always wins, so a real
 * environment variable set by a host is never overwritten by a checked-out file.
 */
function loadServerEnv(mode: string) {
  const env = loadEnv(mode, resolve(import.meta.dirname, '../..'), '')
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('VITE_')) continue
    process.env[key] ??= value
  }
}

const config = defineConfig(({ mode }) => {
  loadServerEnv(mode)

  return {
    // `.env.local` lives at the WORKSPACE root, one file for the web app and the
    // API both. Vite's default `envDir` is its own root, which is this folder,
    // and there is no `.env` here — so without this line every `VITE_` variable
    // reads back `undefined` and the app silently takes its unconfigured path.
    // That is not hypothetical: it is exactly how `VITE_PRIVY_APP_ID` went
    // missing and made S1's sign-in rows fall through to the fixture card.
    envDir: '../../',
    resolve: { tsconfigPaths: true },
    plugins: [
      devtools(),
      tailwindcss(),
      nitro({ preset: 'vercel' }),
      tanstackStart(),
      viteReact(),
    ],
    server: {
      // Any host. This looks lax and is the correct setting for THIS project on
      // THIS day: the console is demoed through a tunnel, `cloudflared` mints a
      // fresh random hostname on every start, and an allowlist of yesterday's
      // hostnames serves a plain-text "Blocked request" page instead of the game.
      //
      // It is not only the dev server. `vite preview` inherits `server.allowedHosts`
      // and the built `dist/server/server.js` starts no listener of its own, so
      // preview is the only way to serve the production build and it is behind
      // this same setting. There is no third path to a shareable URL.
      //
      // The app holds no secrets and no user funds; the deployer key lives in an
      // environment variable and never reaches the client. Tighten this to the
      // real hostname the moment there is a permanent one.
      allowedHosts: true,
    },
  }
})

export default config
