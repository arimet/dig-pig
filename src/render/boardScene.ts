import * as THREE from 'three'
import type { Frame } from '../game/controller'
import { exitOpen } from '../sim/sim'
import { BEDROCK, EXIT, HUMUS, STONE, TRUFFLE } from '../sim/types'
import type { GameEvent, Level, State } from '../sim/types'
import { createDiorama } from './diorama'
import { disposeTree } from './dispose'
import { forestDecor } from './forest'
import {
  MATERIALS, bedrockGeometry, cavityGeometry, createPig, exitGeometries, humusGeometry, sparkleGeometry, stoneGeometry, truffleGeometry,
} from './models'
import { type PigAction, pigProgress, posePig, soilLeft, truffleLeft } from './pigAnim'
import { PALETTE } from './palette'
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

const STONE_RADIUS = 0.44 // the stone model is 21 voxels tall at 24 per tile
const CRUMBS = 12
const CRUMB_LIFE = 0.7

// What the pig is doing during a turn, from what the turn did.
function actionOf(events: GameEvent[], from: number, to: number, width: number): PigAction {
  const types = new Set(events.map(e => e.type))
  if (types.has('dig')) return 'dig'
  if (types.has('push')) return 'push'
  if (types.has('eat') && from !== to) return 'eat'
  const dy = Math.floor(to / width) - Math.floor(from / width)
  if (dy < 0) return 'climb'
  if (dy > 0) return 'drop'
  return from === to ? 'idle' : 'walk'
}

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
  private lastTo: State | null = null
  private lastClock = 0
  // soil thrown back by the snout: one burst per dig, replayed from the clock so captures are exact
  private crumbs = new THREE.InstancedMesh(new THREE.BoxGeometry(1 / 14, 1 / 14, 1 / 14), new THREE.MeshStandardMaterial({ roughness: 1 }), CRUMBS)
  private crumbAt = -Infinity
  private crumbFrom = new THREE.Vector3()
  private crumbDir = new THREE.Vector2()
  private crumbFloor = 0

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
    const colors = [PALETTE.humus1, PALETTE.humus2, PALETTE.humus3, PALETTE.humusSpeck]
    for (let i = 0; i < CRUMBS; i++) this.crumbs.setColorAt(i, new THREE.Color(colors[i % 4]))
    this.crumbs.visible = false
    this.root.add(this.crumbs)
    this.crumbAt = -Infinity
    this.lastTo = null
    this.facing = 1
    this.resize()
  }

  private piece(id: number, kind: number): THREE.Object3D {
    let p = this.pieces.get(id)
    if (p) return p
    p = new THREE.Group()
    const mesh = new THREE.Mesh(kind === STONE ? shared.stone[id % 3] : shared.truffle, kind === STONE ? MATERIALS.lit : MATERIALS.glossy)
    mesh.castShadow = mesh.receiveShadow = this.quality === 'high'
    // the body pivots at the stone's centre, so it can roll along the floor
    const body = new THREE.Group()
    body.position.y = -0.5 + STONE_RADIUS
    mesh.position.y = -STONE_RADIUS
    if (kind === STONE) mesh.rotation.y = (id % 4) * Math.PI / 2
    body.add(mesh)
    p.add(body)
    p.userData.spin = id * 1.3
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
      // a stone rolls without slipping: its turn follows from how far along the row it is
      if (p.userData.kind === STONE) p.children[0].rotation.z = p.userData.spin - p.position.x / STONE_RADIUS
      const sp = p.userData.sparkle as THREE.Mesh | undefined
      if (sp) sp.scale.setScalar(Math.max(0, Math.sin(clock * 2.2 + id * 1.7)) ** 3)
    }
    const p0 = f.from.pig, p1 = f.to.pig
    const action = f.phase === 'dying' ? 'idle' : actionOf(f.events, p0, p1, level.width)
    // eaten this turn: the truffle shrinks into the snout as it reaches it
    for (const [id, cell] of from) {
      if (to.has(id)) continue
      const p = this.piece(id, TRUFFLE)
      const left = truffleLeft(a)
      p.visible = left > 0
      p.position.copy(pos(cell))
      p.position.x -= (1 - left) * 0.25 * this.facing
      p.scale.setScalar(left)
    }

    // the dug tile is eaten away from the snout's side: its far face stays put until the end
    const dug = p1 - p0
    for (const [cell, m] of this.humus) {
      const now = f.to.cells[cell] === HUMUS, before = f.from.cells[cell] === HUMUS
      const left = now ? 1 : before ? soilLeft(a) : 0
      m.visible = left > 0
      m.position.copy(pos(cell))
      m.scale.set(1, 1, 1)
      if (left < 1 && cell === p1) {
        const sideways = Math.abs(dug) === 1
        const k = Math.max(0.02, left)
        if (sideways) { m.scale.x = k; m.position.x += Math.sign(dug) * (1 - k) / 2 }
        else { m.scale.y = k; m.position.y -= Math.sign(dug) * (1 - k) / 2 }
      }
    }

    const open = exitOpen(level, f.to)
    if (this.door) this.door.visible = !open
    if (this.glow) this.glow.visible = open

    // the pig turns round on the spot (through facing the camera), then acts
    const dt = Math.max(0, clock - this.lastClock)
    this.lastClock = clock
    const dx = (p1 % level.width) - (p0 % level.width)
    if (dx) this.facing = Math.sign(dx)
    const targetYaw = this.facing > 0 ? 0 : Math.PI
    this.yaw += (targetYaw - this.yaw) * Math.min(1, dt * 22)
    this.pig.rotation.y = this.yaw
    this.pig.position.lerpVectors(pos(p0), pos(p1), pigProgress(action, a))
    this.pig.position.y -= 0.5
    this.pig.position.z = 0.05
    posePig(this.pig, action, a, clock)
    if (f.to !== this.lastTo) {
      this.lastTo = f.to
      if (action === 'dig' && f.alpha < 1) this.burst(pos(p0), pos(p1), clock)
    }
    this.renderCrumbs(clock)
    const crushed = f.to.status === 'dead' ? Math.min(1, f.dyingT * 6) : 0
    this.pig.scale.set(1 + 0.25 * crushed, 1 - 0.6 * crushed, 1 + 0.25 * crushed)
    // through the open door, the pig walks out of sight
    this.pig.visible = !(f.to.status === 'won' && a >= 1)

    this.decor?.userData.update?.(clock)
    if (this.diorama) this.diorama.render()
    else this.renderer.render(this.scene, this.camera)
  }

  private burst(from: THREE.Vector3, to: THREE.Vector3, clock: number) {
    this.crumbAt = clock
    const d = to.clone().sub(from)
    this.crumbDir.set(d.x, d.y)
    // where the snout meets the soil: the shared edge, at snout height for a sideways dig
    this.crumbFrom.copy(from).addScaledVector(d, 0.5)
    if (d.x) this.crumbFrom.y += -0.5 + 0.3
    this.crumbFloor = Math.min(from.y, to.y) - 0.5
  }

  // Each crumb breaks off the soil face as the snout jabs, hops a little toward the pig and settles
  // on the floor at the foot of the cut, on both sides of the pig so none passes through it.
  private renderCrumbs(clock: number) {
    const t0 = clock - this.crumbAt
    this.crumbs.visible = t0 >= 0 && t0 < CRUMB_LIFE + 0.4
    if (!this.crumbs.visible) return
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3()
    const rnd = (i: number, k: number) => { const x = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x) }
    for (let i = 0; i < CRUMBS; i++) {
      const t = t0 - (i % 3) * 0.09 // one handful per jab
      const back = -Math.sign(this.crumbDir.x || this.crumbDir.y)
      const vx = this.crumbDir.x ? back * (0.15 + 0.45 * rnd(i, 1)) : (rnd(i, 1) - 0.5) * 0.8
      const vy = 0.3 + 0.7 * rnd(i, 2)
      const side = i % 2 ? 1 : -1 // in front of the pig or behind it
      const tt = Math.max(0, t)
      v.set(this.crumbFrom.x + vx * tt, this.crumbFrom.y + (rnd(i, 3) - 0.5) * 0.25 + vy * tt - 4.9 * tt * tt, side * (0.28 + 0.12 * rnd(i, 4)))
      const landed = v.y < this.crumbFloor + 0.03
      if (landed) v.y = this.crumbFloor + 0.03
      const s = t < 0 ? 0 : Math.max(0, Math.min(1, 1 - (t - CRUMB_LIFE * 0.6) / (CRUMB_LIFE * 0.4)))
      e.set(landed ? 0 : tt * 9 * rnd(i, 5), landed ? 0 : tt * 7, landed ? 0 : tt * 11)
      m.compose(v, q.setFromEuler(e), sc.setScalar(s))
      this.crumbs.setMatrixAt(i, m)
    }
    this.crumbs.instanceMatrix.needsUpdate = true
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
