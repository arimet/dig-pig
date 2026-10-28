import * as THREE from 'three'
import { VOXELS_PER_TILE as V, VoxelGrid } from './voxel'
import { C, blob, hash, mesh, paint, vnoise } from './voxelKit'

// Actors and loose pieces use finer voxels than the soil.
const R = 24

export const MATERIALS = {
  lit: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
  glossy: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }),
  glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }),
}

// Pig facing +x, standing on y = 0, drawn as one voxel grid.
function drawPig(): VoxelGrid {
  const g = new VoxelGrid(24, 18, 13)
  const pink = C('pig')
  for (const x of [4, 13]) for (const z of [1, 9]) {
    g.box(x, 0, z, x + 2, 5, z + 2, pink)
    g.box(x, 0, z, x + 2, 1, z + 2, C('trotter'))
    g.box(x, 2, z, x + 2, 2, z + 2, C('mud')) // it digs all day
  }
  blob(g, 9.5, 8.5, 6, 8.4, 5, 5.8, pink, 2.6)
  paint(g, 9.5, 4.5, 6, 6.5, 1.8, 4.6, C('pigLight')) // belly
  // big head, a little lower than the back, snout forward
  blob(g, 17.5, 9, 6, 4.4, 4.4, 4.6, pink, 2.4)
  for (let x = 21; x <= 23; x++) disk2x(g, x, 8, 6, x === 23 ? 2.3 : 2.8, C('snout'))
  g.set(23, 8, 5, C('nostril')); g.set(23, 8, 7, C('nostril'))
  g.box(23, 6, 5, 23, 6, 7, C('mud'))
  g.box(21, 5, 5, 21, 5, 7, C('pigDark')) // mouth line
  // eyes, half hidden by the ears that flop forward over them
  for (const z of [3, 9]) g.box(20, 10, z, 20, 11, z, C('eye'))
  // floppy ears: flaps on each side of the crown, hanging forward over the eyes
  for (const z of [1, 11]) for (let x = 15; x <= 20; x++) {
    const top = 15 - Math.max(0, x - 16)
    for (let y = top - 2; y <= top; y++) g.set(x, y, z, C('pigDark'))
  }
  for (const z of [2, 10]) g.box(15, 13, z, 16, 15, z, C('pigDark'))
  // corkscrew tail
  for (const [x, y, z] of [[1, 10, 6], [0, 11, 6], [0, 12, 7], [1, 13, 6], [1, 12, 5], [0, 11, 5]] as const) g.set(x, y, z, C('pigDark'))
  return g
}

// A disk in the y-z plane at a given x.
function disk2x(g: VoxelGrid, x: number, cy: number, cz: number, r: number, c: number) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++)
    for (let z = Math.floor(cz - r); z <= cz + r; z++)
      if ((y - cy) ** 2 + (z - cz) ** 2 <= r * r) g.set(x, y, z, c)
}

export type PigPart = 'body' | 'head' | 'tail' | 'legFL' | 'legFR' | 'legBL' | 'legBR'
// Pivot of each moving part, in pig voxel coordinates (hips, neck, tail root).
const PIG_PIVOTS: Record<PigPart, [number, number, number]> = {
  body: [0, 0, 0], head: [14.5, 9, 6], tail: [1.5, 10, 6],
  legFL: [14, 5, 2], legFR: [14, 5, 10], legBL: [5, 5, 2], legBR: [5, 5, 10],
}
const pigPart = (x: number, y: number, z: number): PigPart => {
  if (y <= 4 && (x >= 4 && x <= 6 || x >= 13 && x <= 15)) return `leg${x > 9 ? 'F' : 'B'}${z < 6 ? 'L' : 'R'}` as PigPart
  if (x >= 16) return 'head'
  if (x <= 1) return 'tail'
  return 'body'
}

let pigParts: Record<PigPart, THREE.BufferGeometry> | null = null

// Articulated pig: legs, head and tail are separate meshes pivoting at their joints.
// Left is the pig's left (−z when facing +x).
export function createPig(material: THREE.Material = MATERIALS.lit): THREE.Group {
  if (!pigParts) {
    const src = drawPig()
    const grids = {} as Record<PigPart, VoxelGrid>
    for (const k of Object.keys(PIG_PIVOTS) as PigPart[]) grids[k] = new VoxelGrid(src.sx, src.sy, src.sz)
    for (let y = 0; y < src.sy; y++) for (let z = 0; z < src.sz; z++) for (let x = 0; x < src.sx; x++) {
      const c = src.get(x, y, z)
      if (c) grids[pigPart(x, y, z)].set(x, y, z, c)
    }
    pigParts = {} as Record<PigPart, THREE.BufferGeometry>
    for (const k of Object.keys(grids) as PigPart[]) {
      const [px, py, pz] = PIG_PIVOTS[k]
      pigParts[k] = mesh(grids[k], { voxelSize: 1 / R, anchor: 'corner', jitter: 0.035 }).translate(-px / R, -py / R, -pz / R)
    }
  }
  const group = new THREE.Group()
  const rig = new THREE.Group() // body bob and tilt happen here, legs stay attached
  group.add(rig)
  const parts = {} as Record<PigPart, THREE.Mesh>
  for (const k of Object.keys(PIG_PIVOTS) as PigPart[]) {
    const [px, py, pz] = PIG_PIVOTS[k]
    const m = new THREE.Mesh(pigParts[k], material)
    m.position.set(px / R - 24 / 2 / R, py / R, pz / R - 13 / 2 / R)
    m.castShadow = m.receiveShadow = true
    rig.add(m)
    parts[k] = m
  }
  group.userData = { rig, ...parts }
  return group
}

// Round field stone with lichen, sitting on y = 0. A few variants so a pile doesn't look cloned.
export function stoneGeometry(variant = 0): THREE.BufferGeometry {
  const g = new VoxelGrid(24, 22, 24)
  const k = variant * 7.3
  blob(g, 11.5, 10, 11.5, 10.8 + hash(1, 0, k) * 0.8, 9.6, 10.4 + hash(2, 0, k) * 0.8, C('stone'), 2.2)
  for (let i = 0; i < 6; i++) g.sphere(5 + hash(i, 6, k) * 13, 3 + hash(i, 7, k) * 13, 5 + hash(i, 8, k) * 13, 3.5, C('stone'))
  for (let i = 0; i < 9; i++) {
    const a = hash(i, 3, k) * Math.PI * 2, y = 4 + hash(i, 4, k) * 14
    paint(g, 11.5 + Math.cos(a) * 10, y, 11.5 + Math.sin(a) * 10, 2.4, 1.8, 2.4, hash(i, 5, k) < 0.5 ? C('stoneDark') : C('stoneLight'))
  }
  paint(g, 11.5, 19.5, 11.5, 6, 1.5, 6, C('stoneLight'))
  paint(g, 6 + hash(9, 1, k) * 12, 18, 14, 2.6, 1.6, 2.6, C('lichen'))
  return mesh(g, { voxelSize: 1 / R, jitter: 0.06 })
}

// Black truffle: a warty knob a little over half a tile wide, sitting on y = 0.
export function truffleGeometry(): THREE.BufferGeometry {
  const g = new VoxelGrid(16, 14, 16)
  blob(g, 7.5, 6.5, 7.5, 6.6, 6.2, 6.4, C('truffle'), 2.2)
  for (let i = 0; i < 26; i++) {
    const a = hash(i, 1) * Math.PI * 2, b = (hash(i, 2) - 0.3) * Math.PI * 0.9
    const x = 7.5 + Math.cos(a) * Math.cos(b) * 6.6, y = 6.5 + Math.sin(b) * 6.2, z = 7.5 + Math.sin(a) * Math.cos(b) * 6.4
    g.sphere(x, y, z, 1.3, hash(i, 3) < 0.3 ? C('truffleHi') : C('truffleWart'))
  }
  return mesh(g, { voxelSize: 1 / R, jitter: 0.08 })
}

// The glint that makes a truffle findable in the dark: a little four-pointed star, drawn unlit.
export function sparkleGeometry(): THREE.BufferGeometry {
  const g = new VoxelGrid(5, 5, 1)
  g.box(2, 0, 0, 2, 4, 0, C('dawnLight'))
  g.box(0, 2, 0, 4, 2, 0, C('dawnLight'))
  g.set(2, 2, 0, C('star'))
  return mesh(g, { voxelSize: 1 / R })
}

// One tile of humus: crumbly soil with leaf litter specks, pebbles and roots, cube centred on the tile.
export function humusGeometry(variant: number): THREE.BufferGeometry {
  const g = new VoxelGrid(V, V, V)
  for (let y = 0; y < V; y++) for (let z = 0; z < V; z++) for (let x = 0; x < V; x++) {
    const n = hash(x + variant * 31, y, z)
    g.set(x, y, z, n < 0.33 ? C('humus1') : n < 0.66 ? C('humus2') : n < 0.94 ? C('humus3') : C('humusSpeck'))
  }
  // crumbs: a few voxels knocked off the edges
  for (let i = 0; i < 30; i++) {
    const x = Math.floor(hash(i, 7, variant) * V), y = Math.floor(hash(i, 8, variant) * V)
    const edge = hash(i, 9, variant) < 0.5
    g.set(edge ? (hash(i, 10, variant) < 0.5 ? 0 : V - 1) : x, edge ? y : (hash(i, 10, variant) < 0.5 ? 0 : V - 1), V - 1, 0)
  }
  // a root wandering across the front face
  let ry = 3 + Math.floor(hash(variant, 1) * 10)
  for (let x = 0; x < V; x++) {
    if (hash(x, variant, 2) < 0.3) ry += hash(x, variant, 3) < 0.5 ? -1 : 1
    if (variant % 3 !== 2) g.set(x, Math.max(1, Math.min(V - 2, ry)), V - 1, hash(x, 4, variant) < 0.7 ? C('root') : C('rootDark'))
  }
  for (let i = 0; i < 2; i++)
    g.box(2 + Math.floor(hash(i, 5, variant) * 11), 2 + Math.floor(hash(i, 6, variant) * 11), V - 1,
      3 + Math.floor(hash(i, 5, variant) * 11), 3 + Math.floor(hash(i, 6, variant) * 11), V - 1, C('pebble'))
  return mesh(g, { anchor: 'corner' }).translate(-0.5, -0.5, -0.5)
}

// Bedrock block: dark slate with cracks, cube centred on the tile.
export function bedrockGeometry(variant: number): THREE.BufferGeometry {
  const g = new VoxelGrid(V, V, V)
  for (let y = 0; y < V; y++) for (let z = 0; z < V; z++) for (let x = 0; x < V; x++) {
    // slabs rather than speckles: smooth noise across the block, a few light grains on top
    const n = vnoise(x + variant * 16, y * 1.6 + z, 5, 3)
    g.set(x, y, z, hash(x, y, z + variant) < 0.04 ? C('bedrockLight') : n < 0.45 ? C('bedrockDark') : C('bedrock'))
  }
  // a crack zig-zagging down the face
  let cx = 4 + Math.floor(hash(variant, 9) * 8)
  for (let y = V - 1; y >= 0; y--) {
    if (hash(y, variant, 11) < 0.4) cx += hash(y, variant, 12) < 0.5 ? -1 : 1
    g.set(Math.max(0, Math.min(V - 1, cx)), y, V - 1, 0)
  }
  return mesh(g, { anchor: 'corner' }).translate(-0.5, -0.5, -0.5)
}

// The back wall of a dug tile: what the pig has already eaten through.
export function cavityGeometry(variant: number): THREE.BufferGeometry {
  const g = new VoxelGrid(V, V, 2)
  for (let y = 0; y < V; y++) for (let x = 0; x < V; x++) {
    g.set(x, y, 0, hash(x, y, variant) < 0.5 ? C('cavity') : C('cavityDark'))
    if (hash(x, y, variant + 5) < 0.12) g.set(x, y, 1, C('humus3'))
  }
  return mesh(g, { anchor: 'corner' }).translate(-0.5, -0.5, -0.5)
}

// The way out: a plank door in a timber frame at the back of its tile. The planks come off when it opens.
export function exitGeometries() {
  const frame = new VoxelGrid(V, V, 4)
  frame.box(1, 0, 0, 2, 14, 3, C('wood'))
  frame.box(13, 0, 0, 14, 14, 3, C('wood'))
  frame.box(1, 13, 0, 14, 15, 3, C('woodDark'))
  for (let x = 1; x <= 14; x++) frame.set(x, 15, 3, C('woodLight'))
  const door = new VoxelGrid(V, V, 3)
  for (let x = 3; x <= 12; x++) door.box(x, 0, 1, x, 12, 1, x % 3 === 0 ? C('woodDark') : C('wood'))
  door.box(3, 3, 2, 12, 3, 2, C('iron'))
  door.box(3, 9, 2, 12, 9, 2, C('iron'))
  const glow = new VoxelGrid(V, V, 1)
  for (let y = 0; y <= 12; y++) for (let x = 3; x <= 12; x++) glow.set(x, y, 0, y > 8 - hash(x, 3) * 3 ? C('dawnLight') : C('dawn'))
  const place = (geo: THREE.BufferGeometry) => geo.translate(-0.5, -0.5, -0.5)
  return {
    frame: place(mesh(frame, { anchor: 'corner' })),
    door: place(mesh(door, { anchor: 'corner' })).translate(0, 0, 0.13), // in front of the light, so the shut door hides it
    glow: place(mesh(glow, { anchor: 'corner' })).translate(0, 0, 0.13),
  }
}

