import { describe, expect, it } from 'vitest'
import { createState, play, rowsOf, step } from '../src/sim/sim'
import { CRUSH, lv } from './helpers'

const after = (grid: string[], moves: string) => {
  const level = lv(grid)
  const s = play(level, moves)
  return { rows: rowsOf(level, s.cells), s }
}

describe('step', () => {
  it('digs humus and eats truffles, then opens the exit', () => {
    const { rows, s } = after(['#####', '#P.*#', '#...#', '#X..#', '#####'], 'RR')
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
    // a falling stone lands on another and tips over onto the pig, which has just dropped beside it
    expect(play(lv(CRUSH), 'LW').status).toBe('dead')
  })

  it('while anything falls the pig cannot act: moves are only waits', () => {
    const level = lv(['######', '#o   #', '#    #', '#    #', '#.P X#', '######'])
    const s = step(level, createState(level), 'W').state // the stone starts falling
    expect(step(level, s, 'L').state.pig).toBe(s.pig)
  })

  it('a stack falls together, one tile per turn', () => {
    const { rows } = after(['#####', '#o  #', '#o  #', '#   #', '#   #', '#P X#', '#####'], 'W')
    expect(rows.slice(1, 5)).toEqual(['#   #', '#o  #', '#o  #', '#   #'])
  })

  it('stones roll off stones and truffles, left first, never off humus', () => {
    // over the edge and down in the same turn
    const off = after(['#####', '# o #', '# o #', '#P#X#', '#####'], 'W')
    expect(off.rows.slice(1, 3)).toEqual(['#   #', '#oo #'])
    expect(off.s.status).toBe('playing') // it only just started to fall: it settles on the pig's back
    expect(after(['#####', '#.o #', '#.* #', '#P#X#', '#####'], 'W').rows.slice(1, 3)).toEqual(['#.  #', '#.*o#'])
    expect(after(['#####', '#.o.#', '#.o.#', '#P#X#', '#####'], 'W').rows[1]).toBe('#.o.#')
  })

  it('a stone on another one tips over onto the pig when only the pig is in its way down', () => {
    const { rows, s } = after(['######', '#.o  #', '#.o.P#', '#X#..#', '######'], 'L')
    expect(rows[1]).toBe('#. o #') // on its back, unhurt
    expect(s.status).toBe('playing')
    expect(after(['######', '#.o  #', '#.o.P#', '#X#..#', '######'], 'LR').rows.slice(1, 3)).toEqual(['#.   #', '#.ooP#']) // it drops off as the pig walks away
  })

  it('pushes a resting stone sideways into empty space only', () => {
    expect(after(['######', '#Po  #', '#....#', '#X...#', '######'], 'R').rows[1]).toBe('# Po #')
    expect(after(['######', '#Po. #', '#....#', '#X...#', '######'], 'R').rows[1]).toBe('#Po. #')
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

  it('drops onto a truffle below and eats it', () => {
    const s = play(lv(['#####', '#P  #', '#*  #', '#. X#', '#####']), 'W')
    expect(s.eaten).toBe(1)
    expect(s.pig).toBe(11)
  })

  it('the door is in the back wall: the pig and the stones pass in front of it until it opens', () => {
    expect(play(lv(['#####', '#P  #', '#X  #', '#####']), 'W').status).toBe('won') // drops in through the open door
    const shut = play(lv(['#####', '#P *#', '#X..#', '#####']), 'W')
    expect([shut.status, shut.pig]).toEqual(['playing', 11]) // lands in the doorway, in front of the shut door
    expect(play(lv(['#######', '#*.X.P#', '#######']), 'LLL').pig).toBe(9) // walks past it
    // a stone that comes to rest in the doorway blocks the way out until it is pushed off
    expect(play(lv(['######', '#o  .#', '#X *P#', '######']), 'LLL').pig).toBe(14)
    expect(play(lv(['#######', '#    .#', '# Xo*P#', '#######']), 'LL').status).toBe('playing')
    expect(play(lv(['#######', '#    .#', '# Xo*P#', '#######']), 'LLL').status).toBe('won')
  })

  it('a truffle falling on the pig is eaten', () => {
    const level = lv(['#####', '#*  #', '#   #', '#   #', '#P X#', '#####'])
    let s = step(level, createState(level), 'W').state // the truffle starts to fall
    s = step(level, s, 'W').state // and reaches the pig, already falling
    expect(s.eaten).toBe(1)
    expect(s.status).toBe('playing')
    // one that only starts to fall, as the pig digs out from under it, never rests on its back
    expect(play(lv(['#####', '# * #', '# P #', '# . #', '# #X#', '#####']), 'D').eaten).toBe(1)
    expect(play(lv(['#####', '# * #', '#P. #', '#####', '# X #', '#####']), 'R').eaten).toBe(1)
  })

  it('a stone that only starts to fall above the pig settles on its back, a falling one crushes it at once', () => {
    // dig down from under a resting stone: it follows the pig down and rests on it
    const down = after(['#####', '# o #', '# P #', '# . #', '# #X#', '#####'], 'DW')
    expect(down.s.status).toBe('playing')
    expect(down.rows[2]).toBe('# o #')
    // a stone falling from two tiles up
    const level = lv(['#####', '# o #', '#   #', '#   #', '# P #', '#X..#', '#####'])
    let s = step(level, createState(level), 'W').state
    expect(s.status).toBe('playing')
    s = step(level, s, 'W').state
    expect(s.status).toBe('dead')
  })
})
