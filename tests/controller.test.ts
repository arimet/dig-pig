import { describe, expect, it } from 'vitest'
import { DEATH_SECONDS, GameController, TURN_SECONDS } from '../src/game/controller'
import { lv } from './helpers'

const run = (g: GameController, seconds: number) => { for (let t = 0; t < seconds; t += 1 / 60) g.update(1 / 60) }

describe('GameController', () => {
  it('turns each move into one animated turn, and undo takes it back', () => {
    const g = new GameController(lv(['######', '#P..*#', '#X...#', '######']))
    g.request('R'); g.request('R')
    run(g, TURN_SECONDS * 3)
    expect(g.turns).toBe(2)
    expect(g.undo()).toBe(true)
    expect(g.turns).toBe(1)
    expect(g.mistakes).toBe(1)
  })

  it('a bump into bedrock while nothing falls is not a turn', () => {
    const g = new GameController(lv(['#####', '#P*X#', '#####']))
    g.request('U')
    run(g, TURN_SECONDS * 2)
    expect(g.turns).toBe(0)
  })

  it('a crush plays out, then the fatal turn is taken back', () => {
    // stand under the falling stone
    const g = new GameController(lv(['#####', '#o  #', '#   #', '#.P #', '#*.X#', '#####']))
    g.request('W'); g.request('L')
    run(g, TURN_SECONDS * 3)
    g.request('W')
    run(g, TURN_SECONDS * 2)
    expect(g.state.status).toBe('dead')
    run(g, DEATH_SECONDS + 0.5)
    expect(g.state.status).toBe('playing')
    expect(g.mistakes).toBe(1)
  })

  it('the solution replays to a win and earns no star', () => {
    const level = { ...lv(['######', '#P.*X#', '######']), solution: 'RRR' }
    let won = false
    const g = new GameController(level, { onWin: () => { won = true } })
    expect(g.showSolution()).toBe(true)
    run(g, TURN_SECONDS * 5)
    expect(won).toBe(true)
    expect(g.usedSolution).toBe(true)
  })
})
