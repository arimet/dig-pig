import * as THREE from 'three'

export const VOXELS_PER_TILE = 16

export class VoxelGrid {
  readonly data: Uint8Array
  constructor(readonly sx: number, readonly sy: number, readonly sz: number) {
    this.data = new Uint8Array(sx * sy * sz)
  }

  private inside(x: number, y: number, z: number) {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sx && y < this.sy && z < this.sz
  }

  get(x: number, y: number, z: number): number {
    return this.inside(x, y, z) ? this.data[(y * this.sz + z) * this.sx + x] : 0
  }

  set(x: number, y: number, z: number, c: number): void {
    if (this.inside(x, y, z)) this.data[(y * this.sz + z) * this.sx + x] = c
  }

  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: number): this {
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) this.set(x, y, z, c)
    return this
  }

  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: number): this {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
      for (let z = Math.floor(cz - rz); z <= cz + rz; z++)
        for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
          if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1) this.set(x, y, z, c)
    return this
  }

  sphere(cx: number, cy: number, cz: number, r: number, c: number): this {
    return this.ellipsoid(cx, cy, cz, r, r, r, c)
  }
}

const AO_LIGHT = [0.55, 0.7, 0.85, 1]

// Deterministic per-voxel noise in [0, 1).
export function voxelNoise(x: number, y: number, z: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// One quad per exposed face, ambient occlusion baked into vertex colours.
export function meshVoxels(
  grid: VoxelGrid,
  palette: readonly string[],
  opts: { voxelSize?: number; anchor?: 'bottom-center' | 'corner'; jitter?: number } = {},
): THREE.BufferGeometry {
  const size = opts.voxelSize ?? 1 / VOXELS_PER_TILE
  const [ox, oz] = opts.anchor === 'corner' ? [0, 0] : [grid.sx / 2, grid.sz / 2]
  const colors = palette.map(hex => (hex ? new THREE.Color(hex) : null))
  const pos: number[] = [], nor: number[] = [], col: number[] = [], idx: number[] = []
  const solid = (p: number[]) => (grid.get(p[0], p[1], p[2]) ? 1 : 0)
  const jitter = opts.jitter ?? 0

  for (let y = 0; y < grid.sy; y++) for (let z = 0; z < grid.sz; z++) for (let x = 0; x < grid.sx; x++) {
    const c = grid.get(x, y, z)
    if (!c) continue
    const base = colors[c] ?? new THREE.Color('#ff00ff')
    const shade = jitter ? 1 + jitter * (2 * voxelNoise(x, y, z) - 1) : 1
    for (let d = 0; d < 3; d++) for (const sign of [1, -1]) {
      const p = [x, y, z]
      const n = [0, 0, 0]
      n[d] = sign
      if (solid([x + n[0], y + n[1], z + n[2]])) continue
      const u = (d + 1) % 3, v = (d + 2) % 3
      // CCW seen from outside for +d; reversed for -d
      const corners = sign > 0 ? [[0, 0], [1, 0], [1, 1], [0, 1]] : [[0, 0], [0, 1], [1, 1], [1, 0]]
      const start = pos.length / 3
      const ao: number[] = []
      for (const [cu, cv] of corners) {
        const q = [...p]
        q[d] += sign > 0 ? 1 : 0
        q[u] += cu
        q[v] += cv
        pos.push((q[0] - ox) * size, q[1] * size, (q[2] - oz) * size)
        nor.push(n[0], n[1], n[2])
        const above = [p[0] + n[0], p[1] + n[1], p[2] + n[2]]
        const s1 = [...above], s2 = [...above]
        s1[u] += cu ? 1 : -1
        s2[v] += cv ? 1 : -1
        const corner = [...s1]
        corner[v] += cv ? 1 : -1
        const a = solid(s1) && solid(s2) ? 0 : 3 - (solid(s1) + solid(s2) + solid(corner))
        ao.push(a)
        const l = AO_LIGHT[a] * shade
        col.push(base.r * l, base.g * l, base.b * l)
      }
      if (ao[0] + ao[2] > ao[1] + ao[3]) idx.push(start, start + 1, start + 2, start, start + 2, start + 3)
      else idx.push(start + 1, start + 2, start + 3, start + 1, start + 3, start)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
  geo.setIndex(idx)
  return geo
}
