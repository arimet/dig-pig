import { parseLevel } from '../src/sim/level'

export const lv = (grid: string[], need?: number) => parseLevel({ id: 1, name: 't', idea: '', grid, need })

// Found by search: digging right lets a stone fall; it rolls off another onto the pig as it drops.
export const CRUSH = ['#######', '#o.#o##', '#o o. #', '#P.o.##', '#. #oo#', '## ooX#', '#######']
