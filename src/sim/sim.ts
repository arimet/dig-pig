import { ALL_RULES, BEDROCK, EMPTY, EXIT, HUMUS, PIG, STONE, TRUFFLE } from './types'
import type { GameEvent, Level, Move, Rules, State } from './types'

export const MOVES: readonly Move[] = ['U', 'D', 'L', 'R', 'W']
export const DELTA: Record<Move, [number, number]> = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0], W: [0, 0] }

const CHARS: Record<string, number> = { ' ': EMPTY, '.': HUMUS, '#': BEDROCK, o: STONE, '*': TRUFFLE, X: EXIT, P: PIG }
export const CHAR_OF = Object.fromEntries(Object.entries(CHARS).map(([k, v]) => [v, k])) as Record<number, string>

export function parseCells(rows: readonly string[]): { width: number; height: number; cells: Uint8Array } {
  const height = rows.length
  const width = rows[0]?.length ?? 0
  if (height < 3 || width < 3) throw new Error('Grid too small')
  const cells = new Uint8Array(width * height)
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error(`Row ${y}: length ${row.length}, expected ${width}`)
    for (let x = 0; x < width; x++) {
      const c = CHARS[row[x]]
      if (c === undefined) throw new Error(`Cell (${x}, ${y}): unknown character "${row[x]}"`)
      const border = x === 0 || y === 0 || x === width - 1 || y === height - 1
      if (border && c !== BEDROCK) throw new Error(`Cell (${x}, ${y}): the border must be bedrock`)
      cells[y * width + x] = c
    }
  })
  const pigs = cells.filter(c => c === PIG).length
  if (pigs !== 1) throw new Error(`Expected one pig, found ${pigs}`)
  if (!cells.includes(EXIT)) throw new Error('No exit')
  return { width, height, cells }
}

export const rowsOf = (level: Pick<Level, 'width' | 'height'>, cells: Uint8Array): string[] =>
  Array.from({ length: level.height }, (_, y) => Array.from(cells.subarray(y * level.width, (y + 1) * level.width), c => CHAR_OF[c]).join(''))

export function createState(level: Level): State {
  const cells = level.cells.slice()
  const ids = new Int32Array(cells.length)
  cells.forEach((c, i) => { if (c === STONE || c === TRUFFLE || c === PIG) ids[i] = i + 1 })
  return { turn: 0, cells, ids, falling: new Uint8Array(cells.length), pig: cells.indexOf(PIG), eaten: 0, status: 'playing' }
}

export const exitOpen = (level: Level, s: State) => s.eaten >= level.need

// One turn: the pig acts, then every stone and truffle settles by one tile, scanning
// from the bottom row up so a stack falls together, left to right within a row.
export function step(level: Level, prev: State, move: Move, rules: Rules = ALL_RULES): { state: State; events: GameEvent[] } {
  if (prev.status !== 'playing') return { state: prev, events: [] }
  const w = level.width
  const s: State = { ...prev, turn: prev.turn + 1, cells: prev.cells.slice(), ids: prev.ids.slice(), falling: prev.falling.slice() }
  const { cells, ids, falling } = s
  const events: GameEvent[] = []
  const shift = (from: number, to: number) => {
    cells[to] = cells[from]; ids[to] = ids[from]; falling[to] = falling[from]
    cells[from] = EMPTY; ids[from] = 0; falling[from] = 0
  }
  const eat = (cell: number) => {
    events.push({ type: 'eat', cell, id: ids[cell] })
    s.eaten++
    if (s.eaten === level.need) events.push({ type: 'open', cell: cells.indexOf(EXIT) })
  }

  if (move !== 'W') {
    const [dx, dy] = DELTA[move]
    const to = s.pig + dy * w + dx
    const c = cells[to]
    if (c === EMPTY || c === HUMUS) {
      if (c === HUMUS) events.push({ type: 'dig', cell: to })
      shift(s.pig, to)
      s.pig = to
    } else if (c === TRUFFLE) {
      eat(to)
      cells[to] = EMPTY
      shift(s.pig, to)
      s.pig = to
    } else if (c === EXIT && exitOpen(level, s)) {
      cells[s.pig] = EMPTY; ids[to] = ids[s.pig]; ids[s.pig] = 0
      s.pig = to
      s.status = 'won'
      events.push({ type: 'win', cell: to })
      return { state: s, events }
    } else if (c === STONE && dy === 0 && rules.push && cells[to + dx] === EMPTY && !falling[to]) {
      events.push({ type: 'push', cell: to, id: ids[to] })
      shift(to, to + dx)
      shift(s.pig, to)
      s.pig = to
    } else events.push({ type: 'bump', cell: to })
  }

  const done = new Uint8Array(cells.length)
  for (let y = level.height - 2; y >= 1; y--) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const c = cells[i]
      if (done[i] || (c !== STONE && c !== TRUFFLE)) continue
      const below = i + w
      const b = cells[below]
      if (b === EMPTY) {
        if (!falling[i]) events.push({ type: 'fall', cell: i, id: ids[i] })
        shift(i, below)
        falling[below] = 1
        done[below] = 1
      } else if (b === PIG && falling[i]) {
        if (c === TRUFFLE) {
          // a falling truffle drops into the pig's mouth
          eat(i)
          cells[i] = EMPTY; ids[i] = 0; falling[i] = 0
        } else {
          s.status = 'dead'
          falling[i] = 0
          events.push({ type: 'crush', cell: below, id: ids[i] })
        }
      } else {
        const side = rules.roll && (b === STONE || b === TRUFFLE)
          ? [-1, 1].find(d => cells[i + d] === EMPTY && cells[below + d] === EMPTY)
          : undefined
        if (side !== undefined) {
          events.push({ type: 'roll', cell: i, id: ids[i] })
          shift(i, i + side)
          falling[i + side] = 1
          done[i + side] = 1
        } else {
          if (falling[i]) events.push({ type: 'land', cell: i, id: ids[i] })
          falling[i] = 0
        }
      }
    }
  }
  return { state: s, events }
}

export function play(level: Level, moves: string, rules: Rules = ALL_RULES): State {
  let s = createState(level)
  for (const m of moves) s = step(level, s, m as Move, rules).state
  return s
}

// Everything that decides the future: the board and which pieces are mid-fall.
export function stateKey(s: State): string {
  let k = ''
  for (let i = 0; i < s.cells.length; i++) k += String.fromCharCode(48 + s.cells[i] * 2 + s.falling[i])
  return k
}
