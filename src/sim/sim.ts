import { ALL_RULES, BEDROCK, EMPTY, EXIT, HUMUS, PIG, STONE, TRUFFLE } from './types'
import type { GameEvent, Level, Move, Rules, State } from './types'

export const MOVES: readonly Move[] = ['D', 'L', 'R', 'W']
export const DELTA: Record<Move, [number, number]> = { D: [0, 1], L: [-1, 0], R: [1, 0], W: [0, 0] }

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
// The open door holds nothing up: the pig drops straight through it, and onto a truffle, which it eats.
export const supported = (level: Level, s: State) => {
  const below = s.cells[s.pig + level.width]
  return below !== EMPTY && below !== TRUFFLE && !(below === EXIT && exitOpen(level, s))
}

// One turn: the pig acts, then the pig, every stone and every truffle settle by one tile, scanning
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

  // The pig acts only with something under its trotters: in mid-air it just keeps falling.
  const open = exitOpen(level, s)
  const enterable = (c: number) => c === EMPTY || c === HUMUS || c === TRUFFLE || (c === EXIT && open)
  const enter = (to: number): boolean => {
    const c = cells[to]
    if (c === HUMUS) events.push({ type: 'dig', cell: to })
    if (c === TRUFFLE) { eat(to); cells[to] = EMPTY }
    if (c === EXIT) {
      cells[s.pig] = EMPTY; ids[to] = ids[s.pig]; ids[s.pig] = 0
      s.pig = to
      s.status = 'won'
      events.push({ type: 'win', cell: to })
      return true
    }
    shift(s.pig, to)
    s.pig = to
    return false
  }
  if (move !== 'W' && supported(level, s)) {
    const [dx, dy] = DELTA[move]
    const to = s.pig + dy * w + dx
    const c = cells[to]
    const up = to - w
    if (enterable(c)) {
      if (enter(to)) return { state: s, events }
    } else if (c === STONE && dx && rules.push && cells[to + dx] === EMPTY && !falling[to]) {
      events.push({ type: 'push', cell: to, id: ids[to] })
      shift(to, to + dx)
      shift(s.pig, to)
      s.pig = to
    } else if (dx && cells[s.pig - w] === EMPTY && enterable(cells[up])) {
      // a one-tile ledge: the pig hops up onto it, head first through the free space above
      events.push({ type: 'step', cell: up })
      if (enter(up)) return { state: s, events }
    } else events.push({ type: 'bump', cell: to })
  }

  const done = new Uint8Array(cells.length)
  if (s.pig !== prev.pig) done[s.pig] = 1 // where the pig just went, it stays this turn: a drop starts on the next one
  for (let y = level.height - 2; y >= 1; y--) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const c = cells[i]
      if (done[i] || (c !== STONE && c !== TRUFFLE && c !== PIG)) continue
      const below = i + w
      const b = cells[below]
      if (c === PIG) {
        // nothing holds it up: the pig drops a tile, unhurt whatever the height
        if (b === EMPTY) {
          shift(i, below)
          falling[below] = 1
          done[below] = 1
          s.pig = below
          events.push({ type: 'drop', cell: below })
        } else if (b === TRUFFLE) {
          events.push({ type: 'drop', cell: below })
          eat(below)
          cells[below] = EMPTY
          ids[below] = 0
          shift(i, below)
          falling[below] = 1
          done[below] = 1
          s.pig = below
        } else if (b === EXIT && exitOpen(level, s)) {
          events.push({ type: 'drop', cell: below })
          enter(below)
          done[below] = 1
        } else falling[i] = 0
        continue
      }
      // A falling stone hits the pig as soon as it reaches the tile above it; a truffle drops into its mouth.
      const hit = (at: number) => {
        if (cells[at] === TRUFFLE) {
          eat(at)
          cells[at] = EMPTY; ids[at] = 0; falling[at] = 0
        } else {
          s.status = 'dead'
          falling[at] = 0
          events.push({ type: 'crush', cell: at + w, id: ids[at] })
        }
      }
      if (b === EMPTY) {
        const was = falling[i]
        if (!was) events.push({ type: 'fall', cell: i, id: ids[i] })
        shift(i, below)
        falling[below] = 1
        done[below] = 1
        if (cells[below + w] === PIG) {
          // a stone that only just started to fall settles on the pig's back; one already falling hits it
          if (was || c === TRUFFLE) hit(below)
          else { falling[below] = 0; events.push({ type: 'land', cell: below, id: ids[below] }) }
        }
      } else if (b === PIG && (falling[i] || c === TRUFFLE)) {
        hit(i) // the pig stepped in under a falling stone, or under a truffle
      } else {
        const side = rules.roll && (b === STONE || b === TRUFFLE)
          ? [-1, 1].find(d => cells[i + d] === EMPTY && cells[below + d] === EMPTY)
          : undefined
        if (side !== undefined) {
          // over the edge and down in one go, then it falls on
          const to = below + side, was = falling[i]
          events.push({ type: 'roll', cell: i, id: ids[i] })
          shift(i, to)
          falling[to] = 1
          done[to] = 1
          if (cells[to + w] === PIG) {
            if (was || c === TRUFFLE) hit(to)
            else { falling[to] = 0; events.push({ type: 'land', cell: to, id: ids[to] }) }
          }
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
