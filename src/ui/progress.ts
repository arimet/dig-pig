export interface Progress {
  unlocked: number // highest playable level id
  completed: number[]
  stars: Record<number, number> // best stars per level id, 0..3
}

// 3 stars without taking a turn back, 2 with up to three undos, restarts or crushes, 1 after that;
// a revealed solution earns none.
export function starsFor(mistakes: number, usedSolution: boolean): number {
  if (usedSolution) return 0
  return mistakes === 0 ? 3 : mistakes <= 3 ? 2 : 1
}

export const STORAGE_KEY = 'dig-pig:progress'

const fresh = (): Progress => ({ unlocked: 1, completed: [], stars: {} })
const isId = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1

const browserStorage = (): Storage | null => {
  try { return globalThis.localStorage ?? null } catch { return null }
}

// Never throws: private browsing, quota errors and corrupt data all fall back to a fresh start.
export function loadProgress(storage: Pick<Storage, 'getItem'> | null = browserStorage()): Progress {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (!raw) return fresh()
    const data = JSON.parse(raw)
    if (typeof data !== 'object' || data === null || !isId(data.unlocked)) return fresh()
    if (data.completed !== undefined && !Array.isArray(data.completed)) return fresh()
    const stars: Record<number, number> = {}
    if (typeof data.stars === 'object' && data.stars !== null)
      for (const [k, v] of Object.entries(data.stars))
        if (isId(Number(k)) && Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 3) stars[Number(k)] = v as number
    return { unlocked: data.unlocked, completed: [...new Set<number>((data.completed ?? []).filter(isId))], stars }
  } catch {
    return fresh()
  }
}

export function saveProgress(p: Progress, storage: Pick<Storage, 'setItem'> | null = browserStorage()): void {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(p)) } catch { /* progress just won't persist */ }
}

// `unlocked` may point past the last level shipped today: the next world then opens as soon as it exists.
export function completeLevel(p: Progress, id: number, stars: number): Progress {
  return {
    unlocked: Math.max(p.unlocked, id + 1),
    completed: p.completed.includes(id) ? p.completed : [...p.completed, id],
    stars: { ...p.stars, [id]: Math.max(p.stars[id] ?? 0, stars) },
  }
}
