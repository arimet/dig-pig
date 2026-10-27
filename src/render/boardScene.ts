import * as THREE from 'three'
import type { Frame } from '../game/controller'
import { exitOpen } from '../sim/sim'
import { BEDROCK, EXIT, HUMUS, STONE, TRUFFLE } from '../sim/types'
import type { Level, State } from '../sim/types'
import { createDiorama } from './diorama'
import { disposeTree } from './dispose'
import { forestDecor } from './forest'
import {
  MATERIALS, bedrockGeometry, cavityGeometry, createPig, exitGeometries, humusGeometry, sparkleGeometry, stoneGeometry, truffleGeometry,
} from './models'
import { detectQuality } from './quality'
import { createStage } from './stage'

const PITCH = THREE.MathUtils.degToRad(9) // the camera looks a little down onto the forest floor

const shared = {
  humus: Array.from({ length: 6 }, (_, i) => humusGeometry(i)),
  bedrock: Array.from({ length: 4 }, (_, i) => bedrockGeometry(i)),
  cavity: Array.from({ length: 4 }, (_, i) => cavityGeometry(i)),
  stone: Array.from({ length: 3 }, (_, i) => stoneGeometry(i)),
  truffle: truffleGeometry(),
  sparkle: sparkleGeometry(),
  exit: exitGeometries(),
}
const KEEP = new Set<object>([
  ...shared.humus, ...shared.bedrock, ...shared.cavity, ...shared.stone, shared.truffle, shared.sparkle,
  ...Object.values(shared.exit), ...Object.values(MATERIALS),
])

const ease = (t: number) => t * t * (3 - 2 * t)

// The level as a slice of forest soil seen from the front: gravity points down the screen.
export class BoardScene {
  readonly renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200)
  private diorama: ReturnType<typeof createDiorama> | null = null
  readonly quality = detectQuality()
  private level: Level | null = null
  private root = new THREE.Group()
  private humus = new Map<number, THREE.Mesh>()
  private pieces = new Map<number, THREE.Object3D>()
  private pig = createPig(MATERIALS.lit)
  private facing = 1 // +1 right, -1 left
  private yaw = 0
  private door: THREE.Mesh | null = null
  private glow: THREE.Mesh | null = null
  private decor: THREE.Group | null = null

  constructor(private canvas: HTMLCanvasElement) {
    const stage = createStage(canvas)
    this.renderer = stage.renderer
    this.scene = stage.scene
    if (this.quality === 'low') {
      this.renderer.shadowMap.enabled = false
      this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))
    } else this.diorama = createDiorama(this.renderer, this.scene, this.camera)
    this.scene.add(this.root)
  }

  center(x: number, y: number): THREE.Vector3 {
    const l = this.level!
    return new THREE.Vector3(x - (l.width - 1) / 2, (l.height - 1) / 2 - y, 0)
  }

  loadLevel(level: Level): void {
    disposeTree(this.root, KEEP)
    this.scene.remove(this.root)
    this.root = new THREE.Group()
    this.scene.add(this.root)
    this.level = level
    this.humus.clear()
    this.pieces.clear()
    const add = (geo: THREE.BufferGeometry, at: THREE.Vector3, mat: THREE.Material = MATERIALS.lit) => {
      const m = new THREE.Mesh(geo, mat)
      m.position.copy(at)
      m.castShadow = m.receiveShadow = this.quality === 'high'
      this.root.add(m)
      return m
    }
    level.cells.forEach((c, i) => {
      const x = i % level.width, y = Math.floor(i / level.width)
      const at = this.center(x, y)
      const v = (x * 7 + y * 13) % 12
      if (c === BEDROCK) { add(shared.bedrock[v % 4], at); return }
      add(shared.cavity[v % 4], at)
      if (c === HUMUS) this.humus.set(i, add(shared.humus[v % 6], at))
      if (c === EXIT) {
        add(shared.exit.frame, at)
        this.door = add(shared.exit.door, at)
        this.glow = add(shared.exit.glow, at, MATERIALS.glow)
      }
    })
    this.decor = forestDecor(level.width, level.height, this.quality)
    this.root.add(this.decor)
    this.pig.traverse(o => { o.castShadow = this.quality === 'high' })
    this.root.add(this.pig)
    this.facing = 1
    this.resize()
  }

  private piece(id: number, kind: number): THREE.Object3D {
    let p = this.pieces.get(id)
    if (p) return p
    p = new THREE.Group()
    const body = new THREE.Mesh(kind === STONE ? shared.stone[id % 3] : shared.truffle, kind === STONE ? MATERIALS.lit : MATERIALS.glossy)
    body.castShadow = body.receiveShadow = this.quality === 'high'
    body.position.y = -0.5
    if (kind === STONE) body.rotation.y = (id % 4) * Math.PI / 2
    p.add(body)
    if (kind === TRUFFLE) {
      const s = new THREE.Mesh(shared.sparkle, MATERIALS.glow)
      s.position.set(0.18, 0.02, 0.3)
      p.add(s)
      p.userData.sparkle = s
    }
    p.userData.kind = kind
    this.root.add(p)
    this.pieces.set(id, p)
    return p
  }

  render(f: Frame, clock: number): void {
    const level = this.level
    if (!level) return
    const where = (s: State) => {
      const m = new Map<number, number>()
      s.ids.forEach((id, i) => { if (id && (s.cells[i] === STONE || s.cells[i] === TRUFFLE)) m.set(id, i) })
      return m
    }
    const from = where(f.from), to = where(f.to)
    const pos = (cell: number) => this.center(cell % level.width, Math.floor(cell / level.width))
    const a = f.alpha

    for (const [id, p] of this.pieces) if (!to.has(id) && !from.has(id)) p.visible = false
    for (const [id, cell] of to) {
      const p = this.piece(id, f.to.cells[cell])
      p.visible = true
      p.scale.setScalar(1)
      const start = from.get(id) ?? cell
      p.position.lerpVectors(pos(start), pos(cell), a)
      // a stone rolls as it moves sideways
      const dx = (cell % level.width) - (start % level.width)
      if (p.userData.kind === STONE && dx) p.children[0].rotation.z = -dx * a * Math.PI / 2
      const sp = p.userData.sparkle as THREE.Mesh | undefined
      if (sp) sp.scale.setScalar(Math.max(0, Math.sin(clock * 2.2 + id * 1.7)) ** 3)
    }
    // eaten this turn: the truffle shrinks into the pig's snout
    for (const [id, cell] of from) {
      if (to.has(id)) continue
      const p = this.piece(id, TRUFFLE)
      p.visible = a < 1
      p.position.copy(pos(cell))
      p.scale.setScalar(1 - ease(a))
    }

    for (const [cell, m] of this.humus) {
      const now = f.to.cells[cell] === HUMUS, before = f.from.cells[cell] === HUMUS
      m.visible = now || (before && a < 1)
      m.scale.setScalar(now ? 1 : 1 - 0.6 * ease(a))
    }

    const open = exitOpen(level, f.to)
    if (this.door) this.door.visible = !open
    if (this.glow) this.glow.visible = open

    // the pig
    const p0 = f.from.pig, p1 = f.to.pig
    const dx = (p1 % level.width) - (p0 % level.width)
    if (dx) this.facing = Math.sign(dx)
    const targetYaw = this.facing > 0 ? 0 : Math.PI
    this.yaw += (targetYaw - this.yaw) * Math.min(1, 0.35)
    this.pig.rotation.y = this.yaw
    this.pig.position.lerpVectors(pos(p0), pos(p1), ease(a))
    this.pig.position.y -= 0.5
    this.pig.position.z = 0.05
    const crushed = f.to.status === 'dead' ? Math.min(1, f.dyingT * 6) : 0
    this.pig.scale.set(1 + 0.25 * crushed, 1 - 0.6 * crushed, 1 + 0.25 * crushed)
    // through the open door, the pig walks out of sight
    this.pig.visible = !(f.to.status === 'won' && a >= 1)

    this.decor?.userData.update?.(clock)
    if (this.diorama) this.diorama.render()
    else this.renderer.render(this.scene, this.camera)
  }

  resize(): void {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.fitCamera()
    if (this.diorama) {
      this.diorama.setSize(w, h)
      this.diorama.setFocus(...this.boardRect())
    }
  }

  private boardRect(): [THREE.Vector2, THREE.Vector2] {
    const l = this.level!
    const xs: number[] = [], ys: number[] = []
    for (const x of [-l.width / 2, l.width / 2]) for (const y of [-l.height / 2, l.height / 2]) {
      const p = new THREE.Vector3(x, y, 0.5).project(this.camera)
      xs.push((p.x + 1) / 2); ys.push((p.y + 1) / 2)
    }
    return [new THREE.Vector2(Math.min(...xs), Math.min(...ys)), new THREE.Vector2(Math.max(...xs), Math.max(...ys))]
  }

  // Closest camera, on a fixed angle, that keeps the whole slice and a strip of forest floor in a safe frame.
  private fitCamera() {
    const l = this.level
    if (!l) return
    const hw = l.width / 2 + 0.2, hh = l.height / 2
    const corners = [-hw, hw].flatMap(x => [new THREE.Vector3(x, -hh - 0.2, 0.5), new THREE.Vector3(x, hh + 0.6, 0.5)])
    const portrait = this.camera.aspect < 1
    this.camera.fov = portrait ? 42 : 30
    this.camera.updateProjectionMatrix()
    const dir = new THREE.Vector3(0, Math.sin(PITCH), Math.cos(PITCH))
    const target = new THREE.Vector3(0, 0.15, 0)
    const fits = (d: number) => {
      this.camera.position.copy(target).addScaledVector(dir, d)
      this.camera.lookAt(target)
      this.camera.updateMatrixWorld()
      return corners.every(c => {
        const p = c.clone().project(this.camera)
        return Math.abs(p.x) < 0.9 && p.y < 0.72 && p.y > -0.8
      })
    }
    let lo = 3, hi = 80
    for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid }
    fits(hi)
  }
}
