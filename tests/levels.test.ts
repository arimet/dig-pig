import { describe, expect, it } from 'vitest'
import { LEVELS } from '../src/levels'
import { createState, play, step } from '../src/sim/sim'

describe('shipped levels', () => {
  it.each(LEVELS.map(l => [l.id, l] as const))('level %i opens at rest and its solution wins', (_, level) => {
    expect(step(level, createState(level), 'W').events.filter(e => ['fall', 'roll', 'drop'].includes(e.type))).toEqual([])
    expect(play(level, level.solution ?? '').status).toBe('won')
  })

  it('ids run from 1 without gaps', () => {
    expect(LEVELS.map(l => l.id)).toEqual(LEVELS.map((_, i) => i + 1))
  })
})
