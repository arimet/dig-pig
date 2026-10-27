// Checks every level file: solvable, its stored solution wins, and prints its difficulty figures.
// npx tsx scripts/solve.ts [--write]  (--write stores the shortest solution found in each file)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { parseLevel } from '../src/sim/level'
import { play } from '../src/sim/sim'
import { analyse, naiveWins } from '../src/sim/solver'

const dir = new URL('../src/levels/', import.meta.url)
for (const f of readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
  const json = JSON.parse(readFileSync(new URL(f, dir), 'utf8'))
  const level = parseLevel(json)
  const a = analyse(level, { budget: 300_000 })
  const stored = level.solution ? play(level, level.solution).status : 'none'
  console.log(f, { complete: a.complete, actions: a.actions, moves: a.solution?.length, traps: a.traps, dead: `${Math.round((100 * a.deadEnds) / a.explored)}%`, naive: naiveWins(level), stored })
  if (process.argv.includes('--write') && a.solution) writeFileSync(new URL(f, dir), JSON.stringify({ ...json, solution: a.solution }, null, 2) + '\n')
}
