export type Quality = 'high' | 'low'

// Touch devices and small dense screens get the light renderer; ?quality=high|low forces a tier.
export function qualityFor(env: { coarse: boolean; dpr: number; width: number; forced?: string | null }): Quality {
  if (env.forced === 'high' || env.forced === 'low') return env.forced
  return env.coarse || (env.dpr > 2 && env.width < 1000) ? 'low' : 'high'
}

export function detectQuality(): Quality {
  return qualityFor({
    coarse: matchMedia('(pointer: coarse)').matches,
    dpr: devicePixelRatio,
    width: innerWidth,
    forced: new URLSearchParams(location.search).get('quality'),
  })
}
