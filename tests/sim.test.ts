import { describe, expect, it } from 'vitest'
import { createState, play, rowsOf, step } from '../src/sim/sim'
import { lv } from './helpers'

const after = (grid: string[], moves: string) => {
  const level = lv(grid)
  const s = play(level, moves)
  return { rows: rowsOf(level, s.cells), s }
}

describe('step', () => {
  it('digs humus and eats truffles, then opens the exit', () => {
    const { rows, s } = after(['#####', '#P.*#', '#X..#', '#####'], 'RR')
    expect(rows[1]).toBe('#  P#')
    expect(s.eaten).toBe(1)
  })

  it('wins only through an open exit', () => {
    expect(after(['#####', '#PX*#', '#####'], 'R').s.status).toBe('playing')
    expect(after(['#####', '#*PX#', '#####'], 'LRR').s.status).toBe('won')
  })

  it('a resting stone sits safely on the pig, a falling one crushes it', () => {
    // dig sideways under the stone: it rests on the pig
    expect(after(['#####', '#.o.#', '#P.X#', '#####'], 'R').s.status).toBe('playing')
    // walk out from under a stone sideways: it falls into the gap, not on the pig
    expect(after(['#####', '#o  #', '#P X#', '#####'], 'R').s.status).toBe('playing')
    // step under a stone that is already falling
    const level = lv(['######', '#o   #', '#    #', '#    #', '#.P X#', '######'])
    let s = createState(level)
    s = step(level, s, 'W').state // the stone starts falling
    s = step(level, s, 'L').state // the pig digs into its path
    s = step(level, s, 'W').state
    expect(s.status).toBe('dead')
  })

  it('a stack falls together, one tile per turn', () => {
    const { rows } = after(['#####', '#o  #', '#o  #', '#   #', '#   #', '#P X#', '#####'], 'W')
    expect(rows.slice(1, 5)).toEqual(['#   #', '#o  #', '#o  #', '#   #'])
  })

  it('stones roll off stones and truffles, left first, never off humus', () => {
    expect(after(['#####', '# o #', '# o #', '#P#X#', '#####'], 'W').rows[1]).toBe('#o  #')
    expect(after(['#####', '# o #', '# o #', '#P#X#', '#####'], 'WW').rows[2]).toBe('#oo #')
    expect(after(['#####', '#.o #', '#.* #', '#P#X#', '#####'], 'WW').rows[1]).toBe('#.  #')
    expect(after(['#####', '#.o #', '#.* #', '#P#X#', '#####'], 'WW').rows[2]).toBe('#.*o#')
    expect(after(['#####', '#.o.#', '#.o.#', '#P#X#', '#####'], 'W').rows[1]).toBe('#.o.#')
  })

  it('pushes a resting stone sideways into empty space only', () => {
    expect(after(['######', '#Po  #', '#..X.#', '######'], 'R').rows[1]).toBe('# Po #')
    expect(after(['######', '#Po. #', '#..X.#', '######'], 'R').rows[1]).toBe('#Po. #')
  })

  it('the pig drops when nothing holds it up, one tile per turn, and cannot act in mid-air', () => {
    const level = lv(['######', '#P   #', '##   #', '##   #', '##..X#', '######'])
    let s = step(level, createState(level), 'R').state // walks off the ledge
    expect(s.pig).toBe(8)
    s = step(level, s, 'R').state // falls instead of walking on
    expect(s.pig).toBe(14)
    s = step(level, s, 'W').state
    expect(s.pig).toBe(20)
    expect(step(level, s, 'W').state.pig).toBe(20) // landed on the humus
  })

  it('hops onto a one-tile ledge when there is room above, never climbs straight up', () => {
    expect(after(['######', '#    #', '#P# X#', '######'], 'R').s.pig).toBe(8)
    expect(after(['######', '##   #', '#P# X#', '######'], 'R').s.pig).toBe(13) // no headroom above the pig
  })

  it('a truffle falling on the pig is eaten', () => {
    const level = lv(['#####', '#*  #', '#   #', '#P X#', '#####'])
    let s = step(level, createState(level), 'W').state // the truffle falls one tile
    s = step(level, s, 'W').state // and lands on the pig, still falling
    expect(s.eaten).toBe(1)
    expect(s.status).toBe('playing')
  })
})
