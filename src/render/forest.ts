import * as THREE from 'three'
import type { Quality } from './quality'
import { MATERIALS } from './models'
import { VoxelGrid } from './voxel'
import { C, blob, hash, mesh, vnoise } from './voxelKit'

const D = 8 // voxels per tile for the scenery: coarser than the board, it sits in the blur
const MARGIN = 6 // tiles of scenery on each side of the board

// Soil around the board, the forest floor on top of it, and a few trees, ferns and toadstools.
// The board spans x ∈ [-w/2, w/2], y ∈ [-h/2, h/2], z ∈ [-0.5, 0.5].
export function forestDecor(w: number, h: number, quality: Quality): THREE.Group {
  const group = new THREE.Group()
  const shadow = quality === 'high'
  const add = (geo: THREE.BufferGeometry, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geo, MATERIALS.lit)
    m.position.set(x, y, z)
    m.castShadow = m.receiveShadow = shadow
    group.add(m)
    return m
  }

  // the cut face of the soil, with strata, framing the board
  const W = w + 2 * MARGIN, H = h + MARGIN
  const soil = new VoxelGrid(W * D, H * D, 2)
  for (let y = 0; y < H * D; y++) for (let x = 0; x < W * D; x++) {
    const tx = x / D - MARGIN, ty = y / D - MARGIN // board-relative, y up from the board's bottom
    if (tx >= 0 && tx < w && ty >= 0 && ty < h) continue
    const depth = H - y / D // tiles below the forest floor
    const band = vnoise(x, y * 2.5, 9, 4)
    const c = depth < 0.6 ? C('humus3') : band < 0.35 ? C('humus2') : band < 0.7 ? C('humus1') : C('cavity')
    soil.set(x, y, 1, hash(x, y, 9) < 0.006 ? C('pebble') : c)
    soil.set(x, y, 0, c)
  }
  add(mesh(soil, { voxelSize: 1 / D, anchor: 'corner' }), -W / 2, -h / 2 - MARGIN, 0.5 - 2 / D)

  // forest floor: moss and leaf litter running back from the cut
  const deep = 10
  const floor = new VoxelGrid(W * D, 3, deep * D)
  for (let z = 0; z < deep * D; z++) for (let x = 0; x < W * D; x++) {
    const n = vnoise(x, z, 6, 2)
    floor.set(x, 0, z, C('humus3'))
    floor.set(x, 1, z, n < 0.4 ? C('grass1') : n < 0.75 ? C('moss') : C('leafLitter'))
    if (hash(x, z, 3) < 0.12) floor.set(x, 2, z, hash(x, z, 4) < 0.5 ? C('grass2') : C('grassDark'))
  }
  add(mesh(floor, { voxelSize: 1 / D, anchor: 'corner' }), -W / 2, h / 2 - 2 / D, 0.5 - deep)

  // trees well behind the cut, ferns and toadstools near its edge
  const tree = treeGeometry()
  const trees: [number, number][] = [[-w / 2 - 1.5, -3.2], [w / 2 + 1.2, -2.6], [-w / 4, -6.5], [w / 3, -7.5], [w / 2 + 4, -5]]
  trees.forEach(([x, z]) => add(tree, x, h / 2, z).rotation.y = hash(x, z) * Math.PI * 2)
  const fern = fernGeometry(), shroom = toadstoolGeometry()
  for (let i = 0; i < 9; i++) {
    const x = (hash(i, 1) - 0.5) * (w + 6), z = -0.2 - hash(i, 2) * 2.2
    add(i % 3 ? fern : shroom, x, h / 2, z).rotation.y = hash(i, 3) * Math.PI * 2
  }
  return group
}

function treeGeometry(): THREE.BufferGeometry {
  const g = new VoxelGrid(40, 72, 40)
  g.box(17, 0, 17, 22, 40, 22, C('trunk'))
  for (let y = 0; y < 40; y += 3) g.box(17, y, 22, 22, y, 22, C('trunkDark'))
  g.box(14, 0, 16, 25, 2, 23, C('trunkDark')) // roots
  for (const [x, y, z, r] of [[20, 52, 20, 15], [11, 46, 18, 9], [29, 47, 22, 9], [20, 62, 19, 9], [19, 45, 29, 8]] as const)
    blob(g, x, y, z, r, r * 0.8, r, C('leaf'), 2.2)
  for (let i = 0; i < 260; i++) {
    const x = hash(i, 1) * 40 | 0, y = 38 + hash(i, 2) * 32 | 0, z = hash(i, 3) * 40 | 0
    if (g.get(x, y, z)) g.set(x, y, z, C('leafDark'))
  }
  return mesh(g, { voxelSize: 1 / 12, jitter: 0.05 })
}

function fernGeometry(): THREE.BufferGeometry {
  const g = new VoxelGrid(13, 7, 13)
  for (let a = 0; a < 6; a++) {
    const t = (a / 6) * Math.PI * 2
    for (let r = 0; r < 6; r++) g.set(Math.round(6 + Math.cos(t) * r), Math.round(Math.sin((r / 6) * Math.PI) * 4), Math.round(6 + Math.sin(t) * r), C('fern'))
  }
  return mesh(g, { voxelSize: 1 / 16 })
}

function toadstoolGeometry(): THREE.BufferGeometry {
  const g = new VoxelGrid(9, 10, 9)
  g.box(3, 0, 3, 5, 5, 5, C('stem'))
  blob(g, 4, 7, 4, 4.3, 2.4, 4.3, C('capRed'), 2)
  for (const [x, z] of [[2, 4], [5, 2], [6, 6], [4, 5]]) g.set(x, 9, z, C('capSpot'))
  return mesh(g, { voxelSize: 1 / 20 })
}
