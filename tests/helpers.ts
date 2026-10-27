import { parseLevel } from '../src/sim/level'

export const lv = (grid: string[], need?: number) => parseLevel({ id: 1, name: 't', idea: '', grid, need })
