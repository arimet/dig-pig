import { parseLevel } from '../sim/level'
import type { Level } from '../sim/types'
import type { Text } from '../ui/i18n'

const files = import.meta.glob<{ default: unknown }>('./*.json', { eager: true })

export const LEVELS: Level[] = Object.keys(files).map(k => parseLevel(files[k].default)).sort((a, b) => a.id - b.id)

export interface World { id: number; name: Text }

export const WORLDS: World[] = [{ id: 1, name: { fr: 'La chênaie', en: 'The Oak Wood' } }]

export const worldOf = (levelId: number): World => WORLDS[Math.min(WORLDS.length, Math.ceil(levelId / 10)) - 1]
