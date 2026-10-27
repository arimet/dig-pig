// Turns generator outputs into level files: npx tsx scripts/import.ts <dir> (reads 01.json…10.json)
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// [name fr, name en, hint fr, hint en]: the hint names the rule or the risk, never the answer
const NAMES: Record<number, [string, string, string, string]> = {
  1: ['Premier coup de groin', 'First Snuffle', 'Le cochon tombe dès que rien ne le porte. Creuse sous tes pattes pour descendre.', 'The pig drops when nothing holds it up. Dig under your trotters to go down.'],
  2: ['Pousse-caillou', 'Pebble Pusher', 'Tu peux pousser une pierre sur le côté si la case derrière elle est vide.', 'You can push a stone sideways when the tile behind it is empty.'],
  3: ['La dégringolade', 'Tumble', 'Une pierre posée sur une autre roule vers le côté libre.', 'A stone resting on another one rolls toward a free side.'],
  4: ['Racines', 'Roots', 'Une truffe, une pierre. Pour remonter, le cochon n’a que des marches d’une case.', 'One truffle, one stone. To get back up, the pig only has one-tile steps.'],
  5: ['Le terrier', 'The Burrow', 'Deux truffes. Une pierre tombée ne remonte jamais.', 'Two truffles. A fallen stone never goes back up.'],
  6: ['Sous la souche', 'Under the Stump', 'Une seule truffe, et la porte est à l’autre bout.', 'Just one truffle, and the door is at the other end.'],
  7: ['Éboulis', 'Scree', 'Trois truffes sous quatre pierres. Fais tomber les pierres là où elles ne gênent plus.', 'Three truffles under four stones. Drop the stones where they no longer get in the way.'],
  8: ['Le dédale', 'The Warren', 'Pas une pierre ici : tout se joue sur l’ordre des descentes.', 'Not a single stone: it all comes down to the order of your descents.'],
  9: ['La truffière', 'The Truffle Bed', 'Deux truffes. Presque tous les chemins finissent dans une impasse.', 'Two truffles. Almost every path ends in a dead end.'],
  10: ['Le grand éboulement', 'The Rockslide', 'Trois truffes, trois pierres, et presque aucune erreur permise.', 'Three truffles, three stones, and almost no room for mistakes.'],
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
