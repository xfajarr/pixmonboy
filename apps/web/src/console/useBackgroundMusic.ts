import { useEffect, useRef } from 'react'

/**
 * The background music for the console, looped and tied to the volume knob.
 *
 * Browsers will not autoplay an audible track: the first `play()` call has to
 * happen inside a user gesture. The console has a perfectly good gesture to
 * borrow — the first input event, whatever it is — so the track starts muted
 * in the background and only calls `play()` once the player touches anything.
 *
 * The volume knob is the shell's one continuous control, so the track's volume
 * is driven from the same number rather than a second one that could drift.
 */
export function useBackgroundMusic(volume: number) {
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const audio = new Audio('/music/background-music.mp3')
    audio.loop = true
    audio.preload = 'auto'
    audio.volume = volume
    audioRef.current = audio

    const tryStart = () => {
      void audio.play().catch(() => {
        // Still blocked (rare): wait for the next gesture. Autoplay policy is
        // the browser's, not ours, and there is nothing to fix here.
      })
    }

    const onKeyDown = () => tryStart()
    const onPointerDown = () => tryStart()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerdown', onPointerDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerdown', onPointerDown)
      audio.pause()
      audio.src = ''
      audioRef.current = null
    }
  }, [])

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume
  }, [volume])
}
