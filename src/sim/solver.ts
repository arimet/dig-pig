import { DELTA, MOVES, createState, exitOpen, stateKey, step } from './sim'
import { ALL_RULES, EMPTY, EXIT, HUMUS, PIG, STONE, TRUFFLE } from './types'
import type { Level, Move, Rules, State } from './types'

export interface Analysis {
  solvable: boolean
  solution: string | null // the moves of a solution with the fewest actions
  actions: number | null // its length in decisions: a walk then one dig, eat or push, or one turn while things fall
  explored: number // distinct states reached
  complete: boolean // false when the budget ran out: the figures below are then partial
  deadEnds: number // living states from which the level can no longer be won
  traps: number // decisions along the solution where some choice leads, alive, into a dead end
}

const sameBoard = (a: State, b: State) => a.cells.every((c, i) => c === b.cells[i]) && a.falling.every((f, i) => f === b.falling[i])

// Nothing is falling and the pig holds nothing up: it may walk anywhere in its open pocket
// without changing the forest, so the pocket rather than its exact cell is what matters.
function freeAtRest(level: Level, s: State, rules: Rules): boolean {
  if (s.falling.some(f => f)) return false
  const lifted = { ...s, cells: s.cells.slice() }
  lifted.cells[s.pig] = EMPTY
  return sameBoard(lifted, step(level, lifted, 'W', rules).state)
}

// The open cells the pig can walk to, with the moves to reach each one.
function pocket(level: Level, s: State): Map<number, string> {
  const w = level.width
  const paths = new Map([[s.pig, '']])
  const queue = [s.pig]
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]
    for (const m of ['U', 'D', 'L', 'R'] as Move[]) {
      const j = i + DELTA[m][1] * w + DELTA[m][0]
      if (s.cells[j] !== EMPTY || paths.has(j)) continue
      paths.set(j, paths.get(i)! + m)
      queue.push(j)
    }
  }
  return paths
}

function keyOf(level: Level, s: State, rules: Rules): { key: string; free: boolean } {
  if (s.status !== 'playing') return { key: stateKey(s) + s.status, free: false }
  if (!freeAtRest(level, s, rules)) return { key: stateKey(s), free: false }
  const cells = s.cells.slice()
  cells[s.pig] = EMPTY
  let k = ''
  for (const c of cells) k += String.fromCharCode(48 + c)
  return { key: k + '@' + Math.min(...pocket(level, s).keys()), free: true }
}

// The states one decision away, with the moves that lead there.
function* successors(level: Level, s: State, free: boolean, rules: Rules): Generator<[State, string]> {
  if (!free) {
    // waiting first, so a bump into a wall never stands in for it in a solution
    for (const m of ['W', ...MOVES.slice(0, 4)] as Move[]) yield [step(level, s, m, rules).state, m]
    return
  }
  const w = level.width
  const open = exitOpen(level, s)
  for (const [t, path] of pocket(level, s)) {
    for (const m of ['U', 'D', 'L', 'R'] as Move[]) {
      const [dx, dy] = DELTA[m]
      const c = s.cells[t + dy * w + dx]
      const useful = c === HUMUS || c === TRUFFLE || (c === EXIT && open) ||
        (c === STONE && dy === 0 && rules.push && s.cells[t + 2 * dx] === EMPTY)
      if (!useful) continue
      const at: State = { ...s, cells: s.cells.slice(), ids: s.ids.slice() }
      at.cells[s.pig] = EMPTY; at.ids[t] = s.ids[s.pig]; if (t !== s.pig) at.ids[s.pig] = 0
      at.cells[t] = PIG; at.pig = t
      yield [step(level, at, m, rules).state, path + m]
    }
  }
}

// Breadth-first over decisions, then backwards from the winning states to learn which
// states can still be won.
export function analyse(level: Level, opts: { budget?: number; rules?: Rules } = {}): Analysis {
  const budget = opts.budget ?? 200_000
  const rules = opts.rules ?? ALL_RULES
  const start = createState(level)
  const first = keyOf(level, start, rules)
  const states: State[] = [start]
  const free = [first.free]
  const parent = [-1]
  const via = ['']
  const children: number[][] = []
  const index = new Map([[first.key, 0]])
  const wins: number[] = []
  let complete = true

  for (let i = 0; i < states.length; i++) {
    const kids: number[] = []
    children.push(kids)
    if (states[i].status !== 'playing') continue
    for (const [next, moves] of successors(level, states[i], free[i], rules)) {
      const { key, free: f } = keyOf(level, next, rules)
      let j = index.get(key)
      if (j === undefined) {
        if (states.length >= budget) { complete = false; continue }
        j = states.length
        index.set(key, j)
        states.push(next)
        free.push(f)
        parent.push(i)
        via.push(moves)
        if (next.status === 'won') wins.push(j)
      }
      if (j !== i) kids.push(j)
    }
  }

  const winnable = new Uint8Array(states.length)
  const into: number[][] = states.map(() => [])
  children.forEach((kids, i) => kids.forEach(j => into[j].push(i)))
  const queue = [...wins]
  for (const w of wins) winnable[w] = 1
  while (queue.length) for (const i of into[queue.pop()!]) if (!winnable[i]) { winnable[i] = 1; queue.push(i) }

  let solution: string | null = null
  let actions: number | null = null
  let traps = 0
  if (wins.length) {
    const path: number[] = []
    for (let i = wins[0]; i > 0; i = parent[i]) path.push(i)
    path.reverse()
    solution = path.map(i => via[i]).join('')
    actions = path.length
    for (const i of [0, ...path.slice(0, -1)])
      if (children[i].some(j => states[j].status === 'playing' && !winnable[j])) traps++
  }
  const deadEnds = states.reduce((n, s, i) => n + (s.status === 'playing' && !winnable[i] ? 1 : 0), 0)
  return { solvable: solution !== null, solution, actions, explored: states.length, complete, deadEnds, traps }
}

// Shortest-path distances for the pig through what it can walk into right now, from `target`.
function distances(level: Level, s: State, target: number): Int32Array {
  const w = level.width
  const dist = new Int32Array(s.cells.length).fill(-1)
  dist[target] = 0
  const queue = [target]
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q]
    for (const d of [-1, 1, -w, w]) {
      const j = i + d
      const c = s.cells[j]
      if (dist[j] >= 0 || !(c === EMPTY || c === HUMUS || c === TRUFFLE || j === s.pig)) continue
      dist[j] = dist[i] + 1
      queue.push(j)
    }
  }
  return dist
}

// A player who sees the answer at once: walks the shortest way to a truffle, in a chosen order,
// then to the exit, never pushes or waits on purpose, only refuses a step that kills on the spot.
function naiveRun(level: Level, order: number[]): boolean {
  let s = createState(level)
  const exit = s.cells.indexOf(EXIT)
  let stuck = 0
  for (let turn = 0; turn < 400 && s.status === 'playing'; turn++) {
    const targets = exitOpen(level, s) ? [exit] : order.map(id => s.ids.indexOf(id)).filter(i => i >= 0 && s.cells[i] === TRUFFLE)
    let move: Move = 'W'
    for (const t of targets) {
      const dist = distances(level, s, t)
      if (dist[s.pig] < 0) continue
      const steps = (['U', 'D', 'L', 'R'] as Move[]).filter(m => {
        const [dx, dy] = DELTA[m]
        const j = s.pig + dy * level.width + dx
        return (dist[j] >= 0 && dist[j] < dist[s.pig]) || (j === exit && t === exit)
      })
      const safe = steps.find(m => step(level, s, m).state.status !== 'dead')
      if (safe) { move = safe; break }
    }
    if (move === 'W' && ++stuck > 3) return false
    if (move !== 'W') stuck = 0
    s = step(level, s, move).state
  }
  return s.status === 'won'
}

function* orders(ids: number[]): Generator<number[]> {
  if (ids.length <= 1) { yield ids; return }
  for (let i = 0; i < ids.length; i++)
    for (const rest of orders([...ids.slice(0, i), ...ids.slice(i + 1)])) yield [ids[i], ...rest]
}

// True when some order of "go straight to the next truffle" wins: the level is then a walk, not a puzzle.
export function naiveWins(level: Level, maxOrders = 720): boolean {
  const s = createState(level)
  const ids = [...s.ids].filter((id, i) => id && s.cells[i] === TRUFFLE)
  let n = 0
  for (const order of orders(ids)) {
    if (naiveRun(level, order)) return true
    if (++n >= maxOrders) break
  }
  return false
}
