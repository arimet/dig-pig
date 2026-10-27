import { describe, expect, it } from 'vitest'
import { play } from '../src/sim/sim'
import { analyse, naiveWins } from '../src/sim/solver'
import { lv } from './helpers'

describe('analyse', () => {
  it('finds a solution that really wins', () => {
    const level = lv(['#######', '#P . *#', '#.o.  #', '#   .X#', '#######'])
    const a = analyse(level)
    expect(a.complete).toBe(true)
    expect(play(level, a.solution!).status).toBe('won')
  })

  it('reports an unwinnable level', () => {
    expect(analyse(lv(['######', '#P#*X#', '######'])).solvable).toBe(false)
  })

  it('counts traps, and a straight walk to each truffle does not win', () => {
    // found by scripts/gen.ts
    const level = lv(["#########", "#P#*  ..#", "#o.oo.oo#", "#o.*oo. #", "#  * .. #", "#*. *#.X#", "#########"])
    const a = analyse(level)
    expect(play(level, a.solution!).status).toBe('won')
    expect(a.traps).toBeGreaterThan(5)
    expect(a.deadEnds).toBeGreaterThan(a.explored / 2)
    expect(naiveWins(level)).toBe(false)
  })
})

describe('naiveWins', () => {
  it('wins a plain walk', () => {
    expect(naiveWins(lv(['######', '#P.*X#', '######']))).toBe(true)
  })
})
