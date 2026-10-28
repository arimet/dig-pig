import '@fontsource/pixelify-sans/500.css'
import '@fontsource/pixelify-sans/700.css'
import './style.css'
import digitsFont from '@fontsource/pixelify-sans/files/pixelify-sans-latin-500-normal.woff2?url'

// The bold cut draws 2 and 3 like 8: digits always use the regular cut, whatever the weight around them.
document.fonts.add(new FontFace('Pixelify Digits', `url(${digitsFont})`, { unicodeRange: 'U+30-39', weight: '100 900' }))
import { sfx, unlockAudio } from './audio/sfx'
import { GameController, type Phase } from './game/controller'
import { LEVELS, WORLDS, worldOf } from './levels'
import { BoardScene } from './render/boardScene'
import { parseLevel } from './sim/level'
import type { GameEvent, Level, Move } from './sim/types'
import { getLang, setLang, t } from './ui/i18n'
import { icon } from './ui/icons'
import { completeLevel, loadProgress, saveProgress, starsFor } from './ui/progress'
import { createScreens } from './ui/screens'

document.documentElement.lang = getLang()
const canvas = document.getElementById('scene') as HTMLCanvasElement
const ui = document.getElementById('ui')!
const scene = new BoardScene(canvas)
let progress = loadProgress()
let level: Level = LEVELS[0]
let game = new GameController(level)
let playing = false
let phase: Phase = 'playing'

const refreshHud = () => {
  screens.updateHud({ eaten: game.state.eaten, need: level.need, turns: game.turns, busy: phase !== 'playing' })
  screens.showStuck(playing && phase === 'playing' && game.stuck)
}

function playEvents(events: GameEvent[]) {
  const types = new Set(events.map(e => e.type))
  if (types.has('crush')) sfx.fail()
  else if (types.has('eat')) { sfx.eat(); sfx.oink() }
  else if (types.has('push')) sfx.push()
  else if (types.has('dig')) sfx.dig()
  else if (types.has('bump')) sfx.bump()
  if (types.has('land')) sfx.land()
  if (types.has('open')) sfx.open()
}

function startLevel(id: number, custom?: Level) {
  level = custom ?? LEVELS.find(l => l.id === id) ?? LEVELS[0]
  phase = 'playing'
  game.dispose()
  game = new GameController(level, {
    onPhase: p => {
      phase = p
      screens.showCrushed(p === 'dying')
      refreshHud()
    },
    onTurn: events => { playEvents(events); refreshHud() },
    onWin: () => {
      const stars = starsFor(game.mistakes, game.usedSolution)
      progress = completeLevel(progress, level.id, stars)
      saveProgress(progress)
      sfx.win()
      const next = LEVELS.find(l => l.id === level.id + 1)
      const worldDone = next && worldOf(next.id) !== worldOf(level.id) ? worldOf(next.id).name : undefined
      screens.showVictory({ mistakes: game.mistakes, hasNext: !!next, stars, usedSolution: game.usedSolution, worldDone })
    },
  })
  scene.loadLevel(level)
  playing = true
  screens.showHud(level)
  screens.showCrushed(false)
  refreshHud()
}

// Leaving a level abandons its game: no more sounds, saves or victory screen from it.
function backdrop() {
  game.dispose()
  game = new GameController(level)
  scene.loadLevel(level)
  playing = false
}

const move = (m: Move) => { if (playing) { screens.foldIdea(); game.request(m) } }

const screens = createScreens(ui, {
  onPlay: () => { backdrop(); screens.showSelect(LEVELS, progress, WORLDS, worldOf) },
  onSelect: id => startLevel(id),
  onMove: move,
  onUndo: () => { if (game.undo()) { sfx.bump(); refreshHud() } },
  onRestart: () => { game.restart(); refreshHud() },
  onMenu: () => { backdrop(); screens.showSelect(LEVELS, progress, WORLDS, worldOf, worldOf(level.id)) },
  onNext: () => startLevel(level.id + 1),
  onLang: lang => { setLang(lang); paintSound() },
  onWorld: world => {
    // behind the select screen, show the first level of the world being browsed
    if (playing || worldOf(level.id) === world) return
    const first = LEVELS.find(l => worldOf(l.id) === world)
    if (!first) return
    level = first
    backdrop()
  },
  onSolution: () => { if (game.showSolution()) refreshHud() },
})

const KEYS: Record<string, Move> = {
  ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', ' ': 'W',
  a: 'L', q: 'L', s: 'D', d: 'R', // WASD and ZQSD; there is no up: pigs don't climb
}
addEventListener('keydown', e => {
  if (!playing || e.metaKey || e.ctrlKey || e.altKey) return
  const m = KEYS[e.key] ?? KEYS[e.key.toLowerCase()]
  if (m && !(e.target instanceof HTMLButtonElement && m === 'W')) { e.preventDefault(); move(m); return }
  if (e.key === 'Backspace' || e.key === 'u' || e.key === 'U') { e.preventDefault(); if (game.undo()) refreshHud() }
  if (e.key === 'r' || e.key === 'R') { game.restart(); refreshHud() }
})

// swipes on the board move the pig, one tile per swipe
let swipe: { x: number; y: number } | null = null
canvas.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') swipe = { x: e.clientX, y: e.clientY } })
canvas.addEventListener('pointerup', e => {
  if (!swipe) return
  const dx = e.clientX - swipe.x, dy = e.clientY - swipe.y
  swipe = null
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return
  if (Math.abs(dx) > Math.abs(dy)) move(dx > 0 ? 'R' : 'L')
  else if (dy > 0) move('D')
})

addEventListener('pointerdown', unlockAudio, { capture: true })
addEventListener('keydown', unlockAudio, { capture: true })

const sound = document.createElement('button')
sound.className = 'block sound'
const paintSound = () => {
  sound.innerHTML = icon(sfx.muted ? 'mute' : 'sound')
  sound.setAttribute('aria-label', sfx.muted ? t().soundOn : t().soundOff)
}
sound.addEventListener('click', () => { sfx.setMuted(!sfx.muted); paintSound() })
paintSound()
screens.hudExtra.append(sound)

const onResize = () => scene.resize()
addEventListener('resize', onResize)
addEventListener('orientationchange', onResize)

scene.loadLevel(level)
screens.showTitle()
// dev shortcut: ?level=N opens a level directly, locked or not
const direct = Number(new URLSearchParams(location.search).get('level'))
if (import.meta.env.DEV && LEVELS.some(l => l.id === direct)) startLevel(direct)

let clock = 0
// dev-only: slow motion, and manual stepping for frame-by-frame captures
const dev = {
  timeScale: 1,
  step(dt: number) { clock += dt; scene.render(game.update(dt), clock) },
}
const fpsEl = new URLSearchParams(location.search).has('fps') ? document.createElement('div') : null
let frames = 0, fpsAt = performance.now()
if (fpsEl) {
  fpsEl.className = 'fps'
  document.body.append(fpsEl)
}

let prev = performance.now()
scene.renderer.setAnimationLoop(now => {
  if (fpsEl && ++frames && now - fpsAt > 500) {
    fpsEl.textContent = `${Math.round((frames * 1000) / (now - fpsAt))} ${t().fps} · ${scene.quality}`
    frames = 0
    fpsAt = now
  }
  const dt = Math.min(0.1, (now - prev) / 1000) * dev.timeScale
  prev = now
  clock += dt
  scene.render(game.update(dt), clock)
})

// dev-only: __td.load(grid) plays any grid, for captures of a given moment
if (import.meta.env.DEV) Object.assign(window, { __td: { scene, dev, get game() { return game }, load: (grid: string[]) => startLevel(0, parseLevel({ id: 0, name: '', idea: '', grid })) } })
