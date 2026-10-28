import { parseLevel } from '../src/sim/level'

export const lv = (grid: string[], need?: number) => parseLevel({ id: 1, name: 't', idea: '', grid, need })

// The pig steps out from under a stone and drops a tile: the stone, falling, lands on the one below
// and tips over sideways onto the pig.
export const CRUSH = ['######', '#  o #', '#  P.#', '#  o #', '#.##X#', '######']
