import { describe, expect, it } from 'vitest'
import { DEATH_SECONDS, GameController, TURN_SECONDS, WIN_SECONDS, WORK_SECONDS } from '../src/game/controller'
import { CRUSH, lv } from './helpers'

const run = (g: GameController, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 60) g.update(1 / 60) }

describe('GameController', () => {
  it('turns each move into one animated turn, and undo takes it back', () => {
    const g = new GameController(lv(['######', '#P..*#', '#....#', '#X...#', '######']))
    g.request('R'); g.request('R')
    run(g, TURN_SECONDS * 3)
    expect(g.turns).toBe(2)
    expect(g.undo()).toBe(true)
    expect(g.turns).toBe(1)
    expect(g.mistakes).toBe(1)
  })

  it('a bump into bedrock while nothing falls is not a turn', () => {
    const g = new GameController(lv(['#####', '#P*X#', '#####']))
    g.request('D')
    run(g, TURN_SECONDS * 2)
    expect(g.turns).toBe(0)
  })

  it('a crush plays out, then the fatal turn is taken back', () => {
    // one move, then the falls play out on their own until the stone rolls onto the pig
    const g = new GameController(lv(CRUSH))
    g.request('L')
    run(g, WORK_SECONDS + TURN_SECONDS * 2)
    expect(g.state.status).toBe('dead')
    run(g, DEATH_SECONDS + 0.5)
    expect(g.state.status).toBe('playing')
    expect(g.turns).toBe(0) // back to before the move: the falls were not choices
    expect(g.mistakes).toBe(1)
  })

  it('the solution replays to a win and earns no star', () => {
    const level = { ...lv(['######', '#P.*X#', '######']), solution: 'RRR' }
    let won = false
    const g = new GameController(level, { onWin: () => { won = true } })
    expect(g.showSolution()).toBe(true)
    run(g, TURN_SECONDS * 5)
    expect(won).toBe(false) // the pig is still on its way out through the door
    run(g, WIN_SECONDS)
    expect(won).toBe(true)
    expect(g.usedSolution).toBe(true)
  })
})
