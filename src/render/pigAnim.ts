import type * as THREE from 'three'

export type PigAction = 'idle' | 'walk' | 'dig' | 'digDown' | 'eat' | 'push' | 'hop' | 'fall' | 'land'

type Parts = Record<'rig' | 'head' | 'tail' | 'legFL' | 'legFR' | 'legBL' | 'legBR', THREE.Object3D>

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
// 0 at both ends of [e0, e1], 1 in the middle
const hump = (e0: number, e1: number, x: number) => (x <= e0 || x >= e1 ? 0 : Math.sin((Math.PI * (x - e0)) / (e1 - e0)))

const ROOT_END = 0.45 // a dig turn: the snout works the soil until here, then the pig steps in

// How far along its move the pig's body is, 0..1 sideways and 0..1 vertically, for turn progress `a`.
// Digging holds the pig in place while its snout breaks the soil; a hop rises first, then moves over.
export function pigPath(action: PigAction, a: number): { x: number; y: number } {
  if (action === 'dig') { const t = smooth(ROOT_END, 1, a); return { x: t, y: t } }
  // digging down, the pig sinks as the soil under its trotters goes: never over a void
  if (action === 'digDown') { const t = 1 - soilLeft(a); return { x: t, y: t } }
  if (action === 'push') return { x: a, y: a } // the stone moves at the same steady pace, they stay in contact
  if (action === 'hop') return { x: smooth(0.3, 1, a), y: smooth(0.05, 0.7, a) }
  if (action === 'fall' || action === 'land') return { x: a, y: a * a } // gaining speed through the tile
  const t = smooth(0, 1, a)
  return { x: t, y: t }
}

// When the soil in front gives way during a dig turn: 1 = intact, 0 = gone.
export const soilLeft = (a: number) => 1 - smooth(0.25, ROOT_END + 0.1, a)
// When a truffle disappears into the snout during an eat turn: 1 = whole, 0 = eaten.
export const truffleLeft = (a: number) => 1 - smooth(0.22, 0.5, a)

// Trot: diagonal legs together (front-left with back-right). Positive rotation.z swings a foot forward.
// Two strides per tile: legs are a fifth of a tile long, so each stride covers a quarter tile.
function trot(p: Parts, phase: number, amp: number) {
  const s = Math.sin(phase) * amp
  p.legFL.rotation.z = s
  p.legBR.rotation.z = s
  p.legFR.rotation.z = -s
  p.legBL.rotation.z = -s
  p.rig.position.y = 0.01 * Math.abs(Math.sin(phase)) // body rises as the legs pass under it
}

// Poses the articulated pig for turn progress `a` (0..1) of `action`; `clock` drives the idle life.
// Local frame: the pig faces +x, positive rotation.z tips the nose up.
export function posePig(pig: THREE.Object3D, action: PigAction, a: number, clock: number): void {
  const p = pig.userData as Parts
  for (const k of ['rig', 'head', 'tail', 'legFL', 'legFR', 'legBL', 'legBR'] as const) p[k].rotation.set(0, 0, 0)
  p.rig.position.set(0, 0, 0)
  p.rig.scale.set(1, 1, 1)
  p.head.position.x = p.head.userData.x ??= p.head.position.x

  // always: the tail wags, a little faster while busy
  p.tail.rotation.y = 0.45 * Math.sin(clock * (action === 'idle' ? 5 : 11))

  switch (action) {
    case 'idle': {
      p.rig.scale.y = 1 + 0.012 * Math.sin(clock * 2.6) // breathing
      // every few seconds, a sniff: three quick nods with the nose down
      const t = clock % 3.1
      p.head.rotation.z = -0.06 * hump(0, 0.7, t) + 0.05 * Math.sin(t * 28) * hump(0, 0.7, t)
      break
    }
    case 'walk':
      trot(p, a * 4 * Math.PI, 0.5)
      p.head.rotation.z = 0.04 * Math.sin(a * 8 * Math.PI)
      break
    case 'eat':
      trot(p, a * 4 * Math.PI, 0.45)
      // nose down onto the truffle as the snout reaches it, then two chews on the way in
      p.head.rotation.z = -0.38 * hump(0.05, 0.5, a) + 0.07 * Math.sin(smooth(0.5, 1, a) * 4 * Math.PI)
      break
    case 'dig': {
      // root: braced on the back legs, shoulders low, the snout jabs into the soil three times
      const rooting = hump(0, ROOT_END + 0.15, a)
      p.rig.rotation.z = -0.12 * rooting
      p.head.rotation.z = -0.3 * rooting
      p.head.position.x += 0.035 * Math.max(0, Math.sin((a / ROOT_END) * 3 * Math.PI)) * (a < ROOT_END ? 1 : 0)
      p.legBL.rotation.z = p.legBR.rotation.z = -0.35 * rooting
      p.legFL.rotation.z = p.legFR.rotation.z = 0.15 * rooting
      // then step into the hole
      if (a > ROOT_END) trot(p, smooth(ROOT_END, 1, a) * 2 * Math.PI, 0.45)
      break
    }
    case 'push':
      // head down against the stone, short scrabbling strides, weight thrown forward
      trot(p, a * 6 * Math.PI, 0.3)
      p.legBL.rotation.z -= 0.3
      p.legBR.rotation.z -= 0.3
      p.rig.rotation.z = -0.14
      p.head.rotation.z = -0.25
      break
    case 'digDown': {
      // root straight down: front legs splayed, head tucked, the snout jabbing the floor; then sink through
      const rooting = hump(0, ROOT_END + 0.15, a)
      p.rig.rotation.z = -0.2 * rooting
      p.head.rotation.z = -0.6 * rooting
      p.head.position.x += 0.02 * Math.max(0, Math.sin((a / ROOT_END) * 3 * Math.PI)) * (a < ROOT_END ? 1 : 0)
      p.legFL.rotation.z = p.legFR.rotation.z = 0.35 * rooting
      p.legBL.rotation.z = p.legBR.rotation.z = -0.25 * rooting
      break
    }
    case 'hop': {
      // onto a ledge: crouch, rear up with the front trotters reaching for the top, back legs push off,
      // then the body levels out as the front legs land first
      const crouch = hump(0, 0.2, a), rear = hump(0.1, 0.85, a)
      p.rig.scale.y = 1 - 0.1 * crouch
      p.rig.rotation.z = 0.55 * rear
      p.legFL.rotation.z = p.legFR.rotation.z = 0.8 * rear
      p.legBL.rotation.z = p.legBR.rotation.z = -0.6 * hump(0.15, 0.6, a)
      p.head.rotation.z = -0.25 * rear // eyes on the ledge
      break
    }
    case 'fall':
    case 'land': {
      // nothing underfoot: legs spread to brace, head and tail flung up by the air;
      // on the last tile the trotters meet the ground and take the shock in a squash
      const air = action === 'land' ? 1 - smooth(0.8, 0.9, a) : 1
      const squash = action === 'land' ? hump(0.85, 1, a) : 0
      p.legFL.rotation.z = p.legFR.rotation.z = 0.5 * air
      p.legBL.rotation.z = p.legBR.rotation.z = -0.5 * air
      p.head.rotation.z = 0.15 * air - 0.2 * squash
      p.tail.rotation.z = 0.5 * air
      p.rig.scale.y = 1 - 0.2 * squash
      p.rig.scale.x = p.rig.scale.z = 1 + 0.07 * squash
      break
    }
  }
}
