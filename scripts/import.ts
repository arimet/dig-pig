// Turns generator outputs into level files: npx tsx scripts/import.ts <dir> (reads 01.json…10.json)
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// [name fr, name en, hint fr, hint en]: the hint names the rule or the risk, never the answer
const NAMES: Record<number, [string, string, string, string]> = {
  1: ['Premier coup de groin', 'First Snuffle', 'Une pierre tombe dès que tu creuses sous elle. Laisse-la finir sa chute avant de passer.', 'A stone falls as soon as you dig under it. Let it land before you walk past.'],
  2: ['Pousse-caillou', 'Pebble Pusher', 'Tu peux pousser une pierre sur le côté si la case derrière elle est vide.', 'You can push a stone sideways when the tile behind it is empty.'],
  3: ['La dégringolade', 'Tumble', 'Une pierre posée sur une autre roule vers le côté libre.', 'A stone resting on another one rolls toward a free side.'],
  4: ['Racines', 'Roots', 'Une seule truffe, mais chaque pierre que tu fais tomber peut te fermer le passage.', 'Just one truffle, but every stone you drop can close your way.'],
  5: ['Le terrier', 'The Burrow', 'Creuse dans le bon ordre : une pierre tombée ne remonte jamais.', 'Dig in the right order: a fallen stone never goes back up.'],
  6: ['Sous la souche', 'Under the Stump', 'La porte est tout près. La truffe est à l’autre bout.', 'The door is close. The truffle is at the other end.'],
  7: ['Éboulis', 'Scree', 'Cinq pierres autour de la seule truffe. Fais-les tomber là où elles ne gênent plus.', 'Five stones around the only truffle. Drop them where they no longer get in the way.'],
  8: ['Trois étages', 'Three Floors', 'Trois truffes à trois hauteurs. Choisis bien laquelle tu vas chercher en premier.', 'Three truffles at three heights. Choose carefully which one you go for first.'],
  9: ['La truffière', 'The Truffle Bed', 'Quatre truffes. La plupart des chemins finissent dans une impasse.', 'Four truffles. Most paths end in a dead end.'],
  10: ['Le grand éboulement', 'The Rockslide', 'Huit pierres, une truffe, et presque aucune erreur permise.', 'Eight stones, one truffle, and almost no room for mistakes.'],
}
const dir = process.argv[2]
for (let id = 1; id <= 10; id++) {
  const n = String(id).padStart(2, '0')
  const g = JSON.parse(readFileSync(join(dir, `${n}.json`), 'utf8'))
  const [fr, en, ideaFr, ideaEn] = NAMES[id] ?? [`Niveau ${id}`, `Level ${id}`, '', '']
  writeFileSync(new URL(`../src/levels/${n}.json`, import.meta.url), JSON.stringify({
    id, name: { fr, en }, idea: { fr: ideaFr, en: ideaEn }, grid: g.grid, solution: g.solution,
  }, null, 2) + '\n')
}
