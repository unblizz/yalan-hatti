type NavigatorWithActivation = Navigator & { userActivation?: { hasBeenActive: boolean } }

export function buzz(pattern: number | number[]): void {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return
  if (!(navigator as NavigatorWithActivation).userActivation?.hasBeenActive) return
  navigator.vibrate(pattern)
}
