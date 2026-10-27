import * as THREE from 'three'

// Frees the GPU buffers of everything under `root`, except shared resources listed in `keep`.
export function disposeTree(root: THREE.Object3D, keep: ReadonlySet<object> = new Set()): void {
  root.traverse(o => {
    const m = o as THREE.Mesh
    if (m.geometry && !keep.has(m.geometry)) m.geometry.dispose()
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : []
    for (const mat of mats) if (!keep.has(mat)) mat.dispose()
  })
}
