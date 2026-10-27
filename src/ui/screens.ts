import type { World } from '../levels'
import type { Level, Move } from '../sim/types'
import { type Lang, type Text, getLang, pick, t } from './i18n'
import { icon } from './icons'
import type { Progress } from './progress'

export interface ScreenHandlers {
  onPlay(): void
  onSelect(id: number): void
  onMove(m: Move): void
  onUndo(): void
  onRestart(): void
  onMenu(): void
  onNext(): void
  onSolution(): void
  onWorld(world: World): void // the select screen now shows this world
  onLang(lang: Lang): void // texts outside the screens (sound button) follow
}

const h = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') => {
  const el = document.createElement(tag)
  if (cls) el.className = cls
  if (text) el.textContent = text
  return el
}
const button = (label: string, cls: string, onClick: () => void, ico = '') => {
  const b = h('button', `block ${cls}`)
  b.innerHTML = ico
  b.append(h('span', 'label', label))
  b.addEventListener('click', onClick)
  return b
}
// A sign hanging from two ropes, with its own drop shadow (clip-path would cut it).
const hanging = (cls: string, ...children: HTMLElement[]) => {
  const wrap = h('div', 'sign-wrap')
  const sign = h('div', `sign ${cls}`)
  sign.append(...children)
  wrap.append(h('span', 'hanging-ropes'), sign)
  return wrap
}
const starRow = (n: number, cls = 'stars') => {
  const el = h('div', cls)
  el.innerHTML = [0, 1, 2].map(k => icon('star', k < n ? 'on' : 'off')).join('')
  el.setAttribute('aria-label', t().stars(n))
  return el
}
const actions = (...children: HTMLElement[]) => {
  const el = h('div', 'actions')
  el.append(...children)
  return el
}

// Re-trigger a CSS animation class on an element.
const replay = (el: HTMLElement, cls: string) => {
  el.classList.remove(cls)
  void el.offsetWidth
  el.classList.add(cls)
}

// DOM screens layered over the 3D canvas, dressed as forest signs and wooden blocks.
export function createScreens(root: HTMLElement, on: ScreenHandlers) {
  const title = h('section', 'screen title')
  const note = h('p', 'paper')
  const play = button('', 'red big', on.onPlay, icon('play'))
  title.append(hanging('big', h('h1', 'logo', 'Truffe Dash')), note, actions(play))

  const select = h('section', 'screen select')
  const grid = h('div', 'crates')
  // one world at a time, with arrows to flip between them
  const worldTitle = h('h2', '', '')
  const prevWorld = button('', 'small world-prev', () => shownSelect?.(-1), icon('arrow', 'dir-W'))
  const nextWorld = button('', 'small world-next', () => shownSelect?.(1), icon('arrow', 'dir-E'))
  const worldBar = h('div', 'world-bar')
  worldBar.append(prevWorld, hanging('', worldTitle), nextWorld)
  const worldLocked = h('p', 'paper world-locked', '')
  select.append(worldBar, grid, worldLocked)
  let shownSelect: ((step: number) => void) | null = null
  let worldIndex = -1

  const hud = h('section', 'hud')
  const top = h('header', 'hud-top')
  const plate = h('button', 'plate')
  const plateNum = h('span', 'plate-num')
  const plateName = h('span', 'plate-name')
  plate.append(plateNum, plateName)
  const idea = h('p', 'paper idea')
  const info = h('div', 'hud-info')
  // what just went wrong, under the plate, where the hint folds away
  const cause = h('p', 'paper cause')
  cause.setAttribute('role', 'status')
  let causeShown = false
  info.append(plate, idea, cause)
  // the hint folds into the plate after a while (it would hide the board's corner); tap the plate to see it again
  let foldTimer = 0
  const showIdea = (open: boolean) => {
    clearTimeout(foldTimer)
    idea.classList.toggle('open', open)
    plate.setAttribute('aria-expanded', String(open))
    if (open) foldTimer = window.setTimeout(() => showIdea(false), 6000)
  }
  plate.addEventListener('click', () => showIdea(!idea.classList.contains('open')))
  const counter = h('span', 'tag truffles')
  counter.innerHTML = icon('truffle')
  const count = h('b', 'tag-count')
  counter.append(count)
  let shownCount = ''
  const undo = button('', 'small undo', on.onUndo, icon('undo'))
  const restart = button('', 'small restart', on.onRestart, icon('restart'))
  const solution = button('', 'small solution', () => openConfirm(), icon('bulb'))
  const tools = h('div', 'hud-arrows')
  tools.append(counter, undo, restart, solution)
  const menu = button('', 'small menu', on.onMenu, icon('menu'))
  const extra = h('div', 'hud-extra')
  extra.append(menu)
  top.append(info, tools, extra)
  // touch pad: the four moves around a wait button
  const pad = h('footer', 'pad')
  const padButtons = (['U', 'L', 'W', 'R', 'D'] as Move[]).map(m => {
    const b = button('', `small pad-${m}`, () => on.onMove(m), m === 'W' ? icon('wait') : icon('arrow', `dir-${({ U: 'N', D: 'S', L: 'W', R: 'E' } as const)[m as 'U']}`))
    b.dataset.move = m
    return b
  })
  pad.append(...padButtons)
  hud.append(top, pad)

  const victory = h('section', 'screen victory')
  let vStars: HTMLElement = h('div', 'stars')
  const vTitle = h('h2', 'logo')
  const vText = h('p', 'paper')
  const vNext = button('', 'red big', on.onNext, icon('play'))
  const vMenu = button('', '', on.onMenu, icon('menu'))
  const vSignWrap = hanging('big', vStars, vTitle)
  const vSign = vSignWrap.querySelector('.sign') as HTMLElement
  victory.append(vSignWrap, vText, actions(vMenu, vNext))

  // confirmation before revealing the solution: it costs the level's stars
  // a native modal dialog: it traps focus and closes on Escape
  const confirm = h('dialog', 'dialog')
  confirm.setAttribute('aria-labelledby', 'confirm-title')
  const cTitle = h('h2')
  cTitle.id = 'confirm-title'
  const cYes = button('', 'red', () => { closeConfirm(); on.onSolution() }, icon('bulb'))
  const cNo = button('', '', () => closeConfirm())
  const cText = h('p', 'paper')
  confirm.append(hanging('', cTitle), cText, actions(cNo, cYes))
  const openConfirm = () => { confirm.showModal(); cYes.focus() }
  const closeConfirm = () => confirm.close()
  confirm.addEventListener('close', () => solution.focus())
  confirm.addEventListener('click', e => { if (e.target === confirm) closeConfirm() })

  const portrait = h('div', 'portrait paper')
  // language switch, on the title and select screens only
  const lang = button('', 'small lang', () => {
    const next: Lang = getLang() === 'fr' ? 'en' : 'fr'
    on.onLang(next)
    paint()
    if (select.classList.contains('on')) shownSelect?.(0)
  }, icon('globe'))
  root.append(title, select, hud, victory, confirm, portrait, lang)
  const all = [title, select, hud, victory]
  const only = (el: HTMLElement) => {
    all.forEach(s => s.classList.toggle('on', s === el))
    lang.hidden = el !== title && el !== select
  }
  const label = (b: HTMLElement, text: string, aria = text) => {
    b.querySelector('.label')!.textContent = text
    b.setAttribute('aria-label', aria)
  }
  let shownLevel: Level | null = null

  // every fixed text, in the current language
  function paint() {
    const s = t()
    note.textContent = s.tagline
    label(play, s.play)
    label(lang, s.switchTo, s.switchLabel)
    prevWorld.setAttribute('aria-label', s.prevWorld)
    nextWorld.setAttribute('aria-label', s.nextWorld)
    plate.setAttribute('aria-label', s.showHint)
    label(undo, s.undo, s.undoKey)
    label(restart, s.restart, s.restartKey)
    label(solution, s.solution, s.showSolution)
    label(menu, s.menu)
    for (const b of padButtons) {
      const m = b.dataset.move as Move
      label(b, m === 'W' ? s.wait : s.move(m as 'U'), m === 'W' ? s.waitKey : s.move(m as 'U'))
    }
    label(vNext, s.nextLevel)
    label(vMenu, s.menu)
    cTitle.textContent = s.confirmTitle
    cText.textContent = s.confirmText
    label(cYes, s.confirmYes)
    label(cNo, s.cancel)
    portrait.textContent = s.portrait
    cause.textContent = causeShown ? s.crushed : ''
    shownCount = ''
    if (shownLevel) {
      plateNum.textContent = s.level(shownLevel.id)
      plateName.textContent = pick(shownLevel.name)
      idea.textContent = pick(shownLevel.idea)
    }
  }
  paint()

  return {
    hudExtra: extra,
    showTitle: () => only(title),
    // `focus` opens a given world (the one just played); otherwise the first visit opens on the most
    // advanced playable level, and later visits keep the world the player browsed to
    showSelect(all: Level[], progress: Progress, worlds: World[], worldOf: (id: number) => World, focus?: World) {
      if (focus) worldIndex = worlds.indexOf(focus)
      else if (worldIndex < 0) worldIndex = worlds.indexOf(worldOf(Math.min(progress.unlocked, all.at(-1)?.id ?? 1)))
      shownSelect = step => {
        worldIndex = Math.max(0, Math.min(worlds.length - 1, worldIndex + step))
        this.showSelect(all, progress, worlds, worldOf)
      }
      const world = worlds[worldIndex]
      on.onWorld(world)
      worldTitle.textContent = t().world(world.id, pick(world.name))
      prevWorld.disabled = worldIndex === 0
      nextWorld.disabled = worldIndex === worlds.length - 1
      const levels = all.filter(l => worldOf(l.id) === world)
      const closed = levels.length > 0 && levels[0].id > progress.unlocked
      worldLocked.hidden = !closed
      worldLocked.textContent = closed ? t().worldLocked(world.id - 1, pick(world.name)) : ''
      grid.replaceChildren(...levels.map((l, i) => {
        const locked = l.id > progress.unlocked
        const done = progress.completed.includes(l.id)
        const next = !locked && !done
        const b = h('button', `crate${locked ? ' locked' : ''}${done ? ' done' : ''}${next ? ' next' : ''}`)
        b.style.setProperty('--i', String(i))
        b.disabled = locked
        b.innerHTML = locked ? icon('lock', 'crate-lock') : `<span class="crate-num">${l.id}</span>`
        if (!locked) b.append(h('span', 'crate-name', pick(l.name)))
        const stars = progress.stars[l.id] ?? 0
        if (done) b.append(starRow(stars, 'crate-stars'))
        b.setAttribute('aria-label', t().crate(l.id, locked ? null : pick(l.name), done ? stars : null))
        b.addEventListener('click', () => { if (!locked) on.onSelect(l.id) })
        return b
      }))
      only(select)
    },
    showHud(level: Level) {
      shownLevel = level
      paint()
      only(hud)
      showIdea(true)
    },
    foldIdea: () => showIdea(false),
    showCrushed(on: boolean) {
      causeShown = on
      cause.textContent = on ? t().crushed : ''
      cause.classList.toggle('on', on)
      if (on) showIdea(false)
    },
    updateHud(s: { eaten: number; need: number; turns: number; busy: boolean }) {
      const text = `${Math.min(s.eaten, s.need)}/${s.need}`
      if (text !== shownCount) {
        if (shownCount) replay(counter, 'bump')
        shownCount = text
        count.textContent = text
        counter.setAttribute('aria-label', t().truffles(s.eaten, s.need))
        counter.classList.toggle('full', s.eaten >= s.need)
      }
      undo.disabled = s.busy || s.turns === 0
      restart.disabled = s.busy || s.turns === 0
      solution.disabled = s.busy
    },
    showVictory(r: { mistakes: number; hasNext: boolean; stars: number; usedSolution: boolean; worldDone?: Text }) {
      vStars.replaceWith(starRow(r.stars))
      vStars = vSign.querySelector('.stars') as HTMLElement
      const s = t()
      vTitle.textContent = r.usedSolution ? s.missionDone : r.mistakes === 0 ? s.excellent : s.wellDone
      const line = r.usedSolution ? s.usedSolution : r.mistakes === 0 ? s.clean : s.withMistakes(r.mistakes)
      vText.textContent = r.worldDone ? `${line} ${s.worldDone(pick(r.worldDone))}` : r.hasNext ? line : `${line} ${s.worldDone(null)}`
      vNext.hidden = !r.hasNext
      only(victory)
    },
  }
}
