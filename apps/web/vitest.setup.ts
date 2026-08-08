/**
 * Runs before every test file.
 *
 * jest-dom's matchers are registered only when a DOM exists, so node tests
 * stay fast and do not pull in the DOM shim they never use.
 */
if (typeof window !== 'undefined') {
  await import('@testing-library/jest-dom/vitest')

  const { cleanup } = await import('@testing-library/react')
  const { afterEach } = await import('vitest')

  /**
   * Testing Library registers its own afterEach cleanup ONLY when vitest
   * globals are on, and this project runs `globals: false` so tests import
   * what they use. Without this, every render in a file piles up in the same
   * document and a later `getByText` matches the previous test's leftover DOM
   * as well as the current one. That fails as an ambiguous-match error in the
   * lucky case and passes against stale markup in the unlucky one.
   */
  afterEach(cleanup)

  /**
   * jsdom does not implement the Gamepad API, and `console/input-store.ts`
   * calls `navigator.getGamepads()` unconditionally when it attaches. Every
   * screen test mounts ConsoleInputProvider, so every screen test needs this.
   *
   * It lives here rather than as a guard in input-store.ts because the missing
   * API is jsdom's, not the app's: every browser the console actually runs in
   * has shipped getGamepads for years, and a defensive branch in app code to
   * describe a test shim is a lie about which environments are real.
   */
  if (typeof navigator.getGamepads !== 'function') {
    Object.defineProperty(navigator, 'getGamepads', {
      value: () => [],
      configurable: true,
    })
  }

  /**
   * jsdom does not implement media playback, and every button press now plays a
   * click through `console/sound.ts`. Without this, jsdom logs "Not
   * implemented: HTMLMediaElement's play() method" once per press (two dozen
   * lines of noise per test file). Stub it to a no-op promise so the click
   * path still runs and the suite stays quiet. Same justification as the
   * getGamepads stub above: the missing API is jsdom's, not the app's.
   * Overridden unconditionally because jsdom defines `play` as a stub that
   * logs "Not implemented" rather than leaving it absent.
   */
  Object.defineProperty(HTMLMediaElement.prototype, 'play', {
    value: () => Promise.resolve(),
    configurable: true,
  })
}

export {}
