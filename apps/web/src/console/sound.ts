/**
 * The console's short sounds, played on a single shared element each.
 *
 * Separate from the background music on purpose: the music is a long-lived,
 * volume-driven loop owned by `useBackgroundMusic`, while clicks are fire and
 * forget. A fresh element per click would push garbage through the GC on the
 * two hundredth button press, so one element per sound is reused and rewound
 * instead.
 */

let volume = 0.6

/** The physical volume knob drives every sound the console makes. */
export function setSoundVolume(next: number) {
  volume = next
  if (click) click.volume = next
  if (button) button.volume = next
}

/** Rewind and play one of the shared elements. Returns false if it could not. */
function play(audio: HTMLAudioElement) {
  if (typeof Audio === 'undefined') return
  try {
    audio.volume = volume
    // Rewind before play so two quick presses restart the blip instead of
    // stacking two overlapping ones.
    audio.currentTime = 0
    const played = audio.play()
    played.catch(() => {
      // Autoplay policy or a jsdom test bed: the sound is a courtesy, never a
      // gate, so a blocked play() is swallowed rather than surfaced.
    })
  } catch {
    // No <audio> in this environment. See `typeof Audio` guard above.
  }
}

let click: HTMLAudioElement | null = null

/** The generic input blip: D-pad, START, SELECT, on-screen rows. */
export function playClick() {
  click ??= new Audio('/music/click.mp3')
  play(click)
}

let button: HTMLAudioElement | null = null

/** The A and B face buttons, which deserve a meatier click. */
export function playButton() {
  button ??= new Audio('/music/click-button.mp3')
  play(button)
}
