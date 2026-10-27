import { createState, stateKey, step } from '../sim/sim'
import type { GameEvent, Level, Move, State } from '../sim/types'

export type Phase = 'playing' | 'dying' | 'won'

export interface Frame {
  from: State
  to: State
  alpha: number // 0..1 through the turn from `from` to `to`
  events: GameEvent[] // what happened during that turn
  phase: Phase
  dyingT: number // 0..1 through the crush, before the fatal turn is taken back
}

export interface ControllerHooks {
  onTurn?(events: GameEvent[]): void
  onWin?(): void
  onPhase?(p: Phase): void
}

export const TURN_SECONDS = 0.2
export const WORK_SECONDS = 0.32 // digging, pushing and eating take the pig a little longer than a step
export const DEATH_SECONDS = 1.1
export const UNDO_SECONDS = 0.1

// Turn-based play: each move becomes one simulation turn, animated over TURN_SECONDS.
// Every state is kept, so undo, restart and the solution replay are just walks along the history.
export class GameController {
  private history: State[]
  private turnEvents: GameEvent[][] = [[]]
  private queue: Move[] = []
  private t = 1 // progress through the last turn
  private undone: State | null = null // the state being taken back, while the undo plays
  private winPending = false
  private phase: Phase = 'playing'
  private clock = 0
  private undos = 0
  private solutionShown = false
  private autoplay: Move[] = []

  constructor(readonly level: Level, private hooks: ControllerHooks = {}) {
    this.history = [createState(level)]
  }

  get state(): State {
    return this.history[this.history.length - 1]
  }

  get turns(): number {
    return this.history.length - 1
  }

  // Undos, restarts and crushes all count: stars reward a clean run.
  get mistakes(): number {
    return this.undos
  }

  get usedSolution(): boolean {
    return this.solutionShown
  }

  // Keys pressed during a turn wait their turn; two are enough to keep holding a key smooth.
  request(move: Move): void {
    if (this.phase !== 'playing' || this.autoplay.length) return
    if (this.queue.length < 2) this.queue.push(move)
  }

  undo(): boolean {
    if (this.phase === 'won' || this.history.length < 2) return false
    this.queue = []
    this.autoplay = []
    this.undone = this.history.pop()!
    this.turnEvents.pop()
    this.undos++
    this.t = 0
    this.enter('playing')
    return true
  }

  restart(): void {
    if (this.history.length < 2 && this.phase === 'playing') return
    this.history = [this.history[0]]
    this.turnEvents = [[]]
    this.queue = []
    this.autoplay = []
    this.undos++
    this.t = 1
    this.undone = null
    this.enter('playing')
  }

  // Plays the stored solution from the start, one turn at a time.
  showSolution(): boolean {
    if (!this.level.solution || this.phase === 'won') return false
    this.restart()
    this.solutionShown = true
    this.autoplay = [...this.level.solution] as Move[]
    return true
  }

  // The level is being left: no more sounds or victory screens from this game.
  dispose(): void {
    this.hooks = {}
  }

  update(dt: number): Frame {
    this.clock += dt
    if (this.undone) {
      // the turn plays backwards, quickly: from the undone state to the current one
      this.t = Math.min(1, this.t + dt / UNDO_SECONDS)
      const f = this.frame(this.undone, this.state, this.t)
      if (this.t >= 1) this.undone = null
      return { ...f, events: [] }
    }
    const work = this.turnEvents.at(-1)?.some(e => e.type === 'dig' || e.type === 'push' || e.type === 'eat')
    this.t = Math.min(1, this.t + dt / (work ? WORK_SECONDS : TURN_SECONDS))
    if (this.phase === 'dying') {
      if (this.clock >= DEATH_SECONDS) this.undo()
      return this.frame(this.history.at(-2) ?? this.state, this.state, 1)
    }
    if (this.t >= 1 && this.winPending) {
      this.winPending = false
      this.hooks.onWin?.()
    }
    if (this.t >= 1 && this.phase === 'playing') {
      const move = this.autoplay.shift() ?? this.queue.shift()
      if (move) this.take(move)
    }
    const n = this.history.length
    return this.frame(this.history[n - 2] ?? this.history[0], this.history[n - 1], n < 2 ? 1 : this.t)
  }

  private take(move: Move) {
    const prev = this.state
    const { state, events } = step(this.level, prev, move)
    // walking into a wall while nothing moves is not a turn
    if (state.status === 'playing' && !prev.falling.some(f => f) && stateKey(state) === stateKey(prev)) {
      this.hooks.onTurn?.(events)
      return
    }
    this.history.push(state)
    this.turnEvents.push(events)
    this.t = 0
    this.hooks.onTurn?.(events)
    if (state.status === 'dead') this.enter('dying')
    if (state.status === 'won') { this.enter('won'); this.winPending = true }
  }

  private frame(from: State, to: State, alpha: number): Frame {
    return {
      from, to, alpha,
      events: this.turnEvents[this.turnEvents.length - 1] ?? [],
      phase: this.phase,
      dyingT: this.phase === 'dying' ? Math.min(1, this.clock / DEATH_SECONDS) : 0,
    }
  }

  private enter(p: Phase) {
    this.phase = p
    this.clock = 0
    this.hooks.onPhase?.(p)
  }
}
