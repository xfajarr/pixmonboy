import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'
import { createInputStore } from './input-store'
import type { ReactNode } from 'react'
import type { ConsoleIntent } from './intents'
import type { InputStore } from './input-store'

const InputContext = createContext<InputStore | null>(null)

export function ConsoleInputProvider({ children }: { children: ReactNode }) {
  const store = useMemo(() => createInputStore(), [])
  useEffect(() => store.attach(), [store])
  return <InputContext value={store}>{children}</InputContext>
}

function useStore(): InputStore {
  const store = useContext(InputContext)
  if (!store) {
    throw new Error('Console input used outside <ConsoleInputProvider>')
  }
  return store
}

/**
 * Run `handler` on every intent.
 *
 * The handler is held in a ref, so a screen can close over fresh state without
 * resubscribing on every render. Resubscribing on every render is the standard
 * way this hook ends up dropping the first press after a state change.
 */
export function useConsoleIntent(handler: (intent: ConsoleIntent) => void) {
  const store = useStore()
  const ref = useRef(handler)
  ref.current = handler

  useEffect(
    () => store.subscribeIntent((intent) => ref.current(intent)),
    [store],
  )
}

/**
 * The currently held intents, for lighting up the D-pad and buttons.
 *
 * Separate from `useConsoleIntent` on purpose: only the console chrome needs
 * to re-render when a button lights, and it is the only thing that does.
 */
export function useConsolePressed(): ReadonlySet<ConsoleIntent> {
  const store = useStore()
  return useSyncExternalStore(
    store.subscribePressed,
    store.getPressed,
    store.getPressed,
  )
}

/** Touch handlers for the on-screen controls. */
export function useConsoleControls() {
  const store = useStore()
  return useMemo(
    () => ({
      press: store.press,
      release: store.release,
    }),
    [store],
  )
}
