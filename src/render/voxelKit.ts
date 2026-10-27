// Shared voxel drawing helpers: named colours, deterministic noise, shapes, meshing.
import { PALETTE } from './palette'
import { VoxelGrid, meshVoxels } from './voxel'

export type ColorName = keyof typeof PALETTE

const NAMES = Object.keys(PALETTE) as ColorName[]
const COLORS = ['', ...NAMES.map(n => PALETTE[n])]
export const C = (name: ColorName) => NAMES.indexOf(name) + 1

export const hash = (x: number, y: number, z = 0) => {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

// Recolour solid voxels inside an ellipsoid (spots, patches, trims).
export function paint(g: VoxelGrid, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: number) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let z = Math.floor(cz - rz); z <= cz + rz; z++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
        if (g.get(x, y, z) && ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 + ((z - cz) / rz) ** 2 <= 1) g.set(x, y, z, c)
}

export function disk(g: VoxelGrid, cx: number, y: number, cz: number, r: number, c: number) {
  for (let z = Math.floor(cz - r); z <= cz + r; z++)
    for (let x = Math.floor(cx - r); x <= cx + r; x++)
      if ((x - cx) ** 2 + (z - cz) ** 2 <= r * r) g.set(x, y, z, c)
}

export const mesh = (g: VoxelGrid, opts?: Parameters<typeof meshVoxels>[2]) => meshVoxels(g, COLORS, opts)

// Rounded box: superellipsoid of power 4.
export function blob(g: VoxelGrid, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, c: number, p = 4) {
  for (let y = Math.floor(cy - ry); y <= cy + ry; y++)
    for (let z = Math.floor(cz - rz); z <= cz + rz; z++)
      for (let x = Math.floor(cx - rx); x <= cx + rx; x++)
        if (Math.abs((x - cx) / rx) ** p + Math.abs((y - cy) / ry) ** p + Math.abs((z - cz) / rz) ** p <= 1) g.set(x, y, z, c)
}

// Smooth value noise in [0, 1).
export function vnoise(x: number, z: number, scale: number, seed: number) {
  const gx = x / scale, gz = z / scale
  const x0 = Math.floor(gx), z0 = Math.floor(gz)
  const fx = gx - x0, fz = gz - z0
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz)
  const a = hash(x0, z0, seed), b = hash(x0 + 1, z0, seed), c = hash(x0, z0 + 1, seed), d = hash(x0 + 1, z0 + 1, seed)
  return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz
}

export const segDist = (px: number, pz: number, ax: number, az: number, bx: number, bz: number) => {
  const dx = bx - ax, dz = bz - az
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(px - ax - t * dx, pz - az - t * dz)
}

