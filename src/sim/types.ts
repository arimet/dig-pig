import type { Text } from '../ui/i18n'

// U/D/L/R move the pig one tile; W waits a turn while the forest keeps falling.
export type Move = 'U' | 'D' | 'L' | 'R' | 'W'

// Cell codes, one byte per tile.
export const EMPTY = 0
export const HUMUS = 1 // soft soil the pig digs through
export const BEDROCK = 2 // never moves, never dug
export const STONE = 3 // falls, rolls, crushes, can be pushed sideways
export const TRUFFLE = 4 // falls and rolls like a stone, but the pig eats it
export const EXIT = 5 // opens once enough truffles are eaten
export const PIG = 6

export interface Level {
  id: number
  name: Text
  idea: Text
  width: number
  height: number
  cells: Uint8Array // index = y * width + x, the border is bedrock
  need: number // truffles to eat before the exit opens
  solution?: string // a shortest known solution, one Move per character
}

export type Status = 'playing' | 'won' | 'dead'

export interface State {
  turn: number
  cells: Uint8Array
  ids: Int32Array // identity of the thing in each cell, so the renderer can follow it between turns
  falling: Uint8Array // 1 where a stone or truffle moved down or rolled this turn
  pig: number
  eaten: number
  status: Status
}

export type EventType = 'dig' | 'eat' | 'push' | 'fall' | 'roll' | 'land' | 'crush' | 'open' | 'win' | 'bump'

export interface GameEvent {
  type: EventType
  cell: number
  id?: number // the stone or truffle involved
}

export interface Rules {
  push: boolean
  roll: boolean
}

export const ALL_RULES: Rules = { push: true, roll: true }
