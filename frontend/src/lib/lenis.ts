import Lenis from 'lenis'

let lenis: Lenis | null = null

export function initLenis() {
  if (typeof window === 'undefined') return null
  
  lenis = new Lenis({
    duration: 1.4,
    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    smoothWheel: true,
    wheelMultiplier: 0.8,
    touchMultiplier: 1.5,
  })

  function raf(time: number) {
    lenis?.raf(time)
    requestAnimationFrame(raf)
  }
  requestAnimationFrame(raf)
  
  return lenis
}

export function getLenis() { return lenis }

export function destroyLenis() {
  lenis?.destroy()
  lenis = null
}
