// Grows hard levels by mutation: change a few cells, keep the change when the solver can still
// verify the level completely and the difficulty score does not drop too much (simulated annealing).
// npx tsx scripts/gen.ts --w 8 --h 6 --iters 3000 --seed 1 --needs push --out /tmp/x.json
import { writeFileSync } from 'node:fs'
import { parseLevel } from '../src/sim/level'
import { createState, step } from '../src/sim/sim'
import { analyse, naiveWins } from '../src/sim/solver'
import type { Analysis } from '../src/sim/solver'

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : def
}
const W = Number(arg('w', '8')), H = Number(arg('h', '6'))
const ITERS = Number(arg('iters', '3000'))
const BUDGET = Number(arg('budget', '40000'))
const NEEDS = arg('needs', '').split(',').filter(Boolean) // mechanics the level must not be solvable without
const NAIVE_OK = arg('naive', 'no') === 'ok'
const MAX_TRUFFLES = Number(arg('truffles', '5'))
const MAX_STONES = Number(arg('stones', '12'))
const range = (name: string, def: string) => arg(name, def).split('-').map(Number) as [number, number]
const TRAPS = range('traps', '0-99') // the band of difficulty this level slot aims for
const ACTIONS = range('actions', '0-99')
const outside = (v: number, [lo, hi]: [number, number]) => (v < lo ? lo - v : v > hi ? v - hi : 0)
const OUT = arg('out', '/tmp/gen.json')
let seed = Number(arg('seed', '1'))
const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff)
const pickOne = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]

const PAINT = ['.', '.', '.', ' ', ' ', '#', '#', 'o', 'o', '*'] // weights by repetition

function initial(): string[][] {
  const g = Array.from({ length: H + 2 }, (_, y) =>
    Array.from({ length: W + 2 }, (_, x) => (x === 0 || y === 0 || x === W + 1 || y === H + 1 ? '#' : pickOne(PAINT))))
  g[1][1] = 'P'
  g[H][W] = 'X'
  return g
}

function mutate(g: string[][]): string[][] {
  const n = g.map(r => [...r])
  const k = 1 + Math.floor(rnd() * 3)
  for (let i = 0; i < k; i++) {
    const x = 1 + Math.floor(rnd() * W), y = 1 + Math.floor(rnd() * H)
    if (rnd() < 0.15) {
      // move the pig or the exit
      const what = rnd() < 0.5 ? 'P' : 'X'
      const [ox, oy] = find(n, what)
      if (n[y][x] === 'P' || n[y][x] === 'X') continue
      n[oy][ox] = n[y][x]
      n[y][x] = what
    } else if (n[y][x] !== 'P' && n[y][x] !== 'X') n[y][x] = pickOne(PAINT)
  }
  return n
}

function find(g: string[][], c: string): [number, number] {
  for (let y = 0; y < g.length; y++) { const x = g[y].indexOf(c); if (x >= 0) return [x, y] }
  throw new Error(`no ${c}`)
}

interface Scored { grid: string[]; score: number; a: Analysis; naive: boolean; truffles: number }

function evaluate(g: string[][]): Scored | null {
  const grid = g.map(r => r.join(''))
  const truffles = grid.join('').split('*').length - 1
  const count = (c: string) => grid.join('').split(c).length - 1
  if (truffles < 1 || truffles > MAX_TRUFFLES || count('o') > MAX_STONES) return null
  const level = parseLevel({ id: 0, grid })
  // a level opens on a still forest: nothing falls before the first move
  if (step(level, createState(level), 'W').events.some(e => e.type === 'fall' || e.type === 'roll' || e.type === 'drop')) return null
  const a = analyse(level, { budget: BUDGET })
  if (!a.complete || !a.solvable) return null
  for (const need of NEEDS) {
    const rules = { push: need !== 'push', roll: need !== 'roll' }
    const b = analyse(level, { budget: BUDGET, rules })
    if (!b.complete || b.solvable) return null
  }
  const naive = naiveWins(level, 120)
  // get into the slot's band of decisions and traps first, then shed every stone, truffle and clod
  // that does not change the puzzle: clutter costs points
  const miss = outside(a.traps, TRAPS) * 6 + outside(a.actions!, ACTIONS) * 2
  const score = -miss * 4 - (naive && !NAIVE_OK ? 50 : 0) - 3 * count('o') - 4 * truffles - 0.6 * count('.') - 0.3 * count('#')
  return { grid, score, a, naive, truffles }
}

let cur: Scored | null = null
while (!cur) cur = evaluate(initial())
let best = cur
const t0 = Date.now()
for (let it = 0; it < ITERS; it++) {
  const temp = 6 * (1 - it / ITERS)
  const cand = evaluate(mutate(cur.grid.map(r => [...r])))
  if (!cand) continue
  if (cand.score >= cur.score - temp * rnd()) cur = cand
  if (cur.score > best.score) best = cur
}
const level = parseLevel({ id: 0, grid: best.grid })
const a = analyse(level, { budget: BUDGET })
writeFileSync(OUT, JSON.stringify({ grid: best.grid, score: best.score, naive: best.naive, truffles: best.truffles, ...a, needs: NEEDS, seconds: (Date.now() - t0) / 1000 }, null, 1))
console.log(best.grid.join('\n'))
console.log({ score: best.score.toFixed(1), actions: a.actions, moves: a.solution?.length, traps: a.traps, dead: a.deadEnds, explored: a.explored, naive: best.naive, s: (Date.now() - t0) / 1000 })
