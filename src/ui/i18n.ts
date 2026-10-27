export type Lang = 'fr' | 'en'
export type Text = Record<Lang, string> // a text shipped in both languages (level and world names)

export const LANGS: readonly Lang[] = ['fr', 'en']
export const LANG_KEY = 'truffe-dash:lang'

// A saved choice wins; otherwise French for French-speaking browsers, English for everyone else.
export function detectLang(saved: string | null, browser: readonly string[]): Lang {
  if (saved === 'fr' || saved === 'en') return saved
  return browser.some(l => l.toLowerCase().startsWith('fr')) ? 'fr' : 'en'
}

// French counts 0 and 1 as singular, English only 1
const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? 's' : ''}`
const pluralEn = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

const fr = {
  switchTo: 'English',
  switchLabel: 'Play in English',
  tagline: 'Creuse la forêt, déterre les truffes et file par la porte avant que les pierres ne te tombent dessus.',
  play: 'Jouer',
  prevWorld: 'Monde précédent',
  nextWorld: 'Monde suivant',
  world: (id: number, name: string) => `Monde ${id} · ${name}`,
  worldLocked: (prev: number, name: string) => `Termine le monde ${prev} pour ouvrir ${name}.`,
  level: (id: number) => `Niveau ${id}`,
  crate: (id: number, name: string | null, stars: number | null) =>
    `Niveau ${id} : ${name ?? 'verrouillé'}${stars === null ? '' : `, réussi, ${plural(stars, 'étoile')}`}`,
  stars: (n: number) => `${plural(n, 'étoile')} sur 3`,
  showHint: 'Afficher la consigne',
  truffles: (eaten: number, need: number) => `${eaten} truffe${eaten > 1 ? 's' : ''} sur ${need}`,
  undo: 'Annuler',
  undoKey: 'Annuler le dernier pas (touche U ou Retour arrière)',
  restart: 'Recommencer',
  restartKey: 'Recommencer le niveau (touche R)',
  wait: 'Attendre',
  waitKey: 'Attendre un tour (touche Espace)',
  move: (m: 'D' | 'L' | 'R') => ({ D: 'Creuser vers le bas', L: 'Aller à gauche', R: 'Aller à droite' })[m],
  solution: 'Solution',
  showSolution: 'Montrer la solution',
  menu: 'Menu',
  soundOn: 'Activer le son',
  soundOff: 'Couper le son',
  confirmTitle: 'Montrer la solution ?',
  confirmText: 'Le cochon rejouera le niveau tout seul depuis le début. Tu ne gagneras pas d’étoile cette fois.',
  confirmYes: 'Montrer',
  cancel: 'Annuler',
  nextLevel: 'Niveau suivant',
  excellent: 'Sans faute !',
  wellDone: 'Bravo !',
  missionDone: 'Le cochon est sorti',
  usedSolution: 'Solution montrée : pas d’étoile cette fois.',
  clean: 'Pas un seul retour en arrière.',
  withMistakes: (n: number) => `Sorti avec ${plural(n, 'retour')} en arrière.`,
  worldDone: (next: string | null) => next ? `Monde terminé ! Direction ${next}.` : 'Monde terminé !',
  portrait: 'Tourne ton téléphone pour jouer',
  crushed: 'Une pierre est tombée sur le cochon. On reprend juste avant.',
  fps: 'i/s',
}

export type Strings = typeof fr

const en: Strings = {
  switchTo: 'Français',
  switchLabel: 'Jouer en français',
  tagline: 'Dig through the forest, unearth the truffles and slip out the door before the stones come down on you.',
  play: 'Play',
  prevWorld: 'Previous world',
  nextWorld: 'Next world',
  world: (id, name) => `World ${id} · ${name}`,
  worldLocked: (prev, name) => `Finish world ${prev} to open ${name}.`,
  level: id => `Level ${id}`,
  crate: (id, name, stars) => `Level ${id}: ${name ?? 'locked'}${stars === null ? '' : `, cleared, ${pluralEn(stars, 'star')}`}`,
  stars: n => `${pluralEn(n, 'star')} out of 3`,
  showHint: 'Show the hint',
  truffles: (eaten, need) => `${eaten} of ${pluralEn(need, 'truffle')}`,
  undo: 'Undo',
  undoKey: 'Take back the last step (U or Backspace)',
  restart: 'Restart',
  restartKey: 'Restart the level (R)',
  wait: 'Wait',
  waitKey: 'Wait one turn (Space)',
  move: m => ({ D: 'Dig down', L: 'Left', R: 'Right' })[m],
  solution: 'Solution',
  showSolution: 'Show the solution',
  menu: 'Menu',
  soundOn: 'Turn sound on',
  soundOff: 'Mute',
  confirmTitle: 'Show the solution?',
  confirmText: 'The pig will replay the level by itself from the start. You won’t earn a star this time.',
  confirmYes: 'Show',
  cancel: 'Cancel',
  nextLevel: 'Next level',
  excellent: 'Flawless!',
  wellDone: 'Well done!',
  missionDone: 'The pig is out',
  usedSolution: 'Solution shown: no star this time.',
  clean: 'Not a single step taken back.',
  withMistakes: n => `Out after taking back ${pluralEn(n, 'step')}.`,
  worldDone: next => next ? `World complete! Next stop: ${next}.` : 'World complete!',
  portrait: 'Turn your phone to play',
  crushed: 'A stone fell on the pig. Back to just before.',
  fps: 'fps',
}

const DICT: Record<Lang, Strings> = { fr, en }

let lang: Lang = (() => {
  let saved: string | null = null
  try { saved = localStorage.getItem(LANG_KEY) } catch { /* private mode */ }
  return detectLang(saved, typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language])
})()

export const getLang = () => lang
export const t = (): Strings => DICT[lang]
export const pick = (text: Text) => text[lang]

export function setLang(next: Lang): void {
  lang = next
  document.documentElement.lang = next
  try { localStorage.setItem(LANG_KEY, next) } catch { /* not persisted */ }
}
