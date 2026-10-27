import { parseCells } from './sim'
import type { Level } from './types'
import type { Text } from '../ui/i18n'

const text = (v: unknown): Text => {
  if (typeof v === 'object' && v !== null) { const o = v as Record<string, unknown>; return { fr: String(o.fr ?? ''), en: String(o.en ?? '') } }
  return { fr: String(v ?? ''), en: String(v ?? '') }
}

export function parseLevel(json: unknown): Level {
  const j = json as Record<string, unknown>
  if (!Array.isArray(j?.grid)) throw new Error('Level: "grid" must be a list of rows')
  const { width, height, cells } = parseCells(j.grid as string[])
  const truffles = cells.filter(c => c === 4).length
  const need = Number(j.need ?? truffles)
  if (!Number.isInteger(need) || need < 0 || need > truffles) throw new Error(`Level ${j.id}: need ${j.need} of ${truffles} truffles`)
  return {
    id: Number(j.id), name: text(j.name), idea: text(j.idea), width, height, cells, need,
    solution: typeof j.solution === 'string' ? j.solution : undefined,
  }
}

