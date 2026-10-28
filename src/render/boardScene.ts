import * as THREE from 'three'
import { CATCH_SECONDS, DEATH_SECONDS, TURN_SECONDS, type Frame } from '../game/controller'
import { exitOpen } from '../sim/sim'
import { BEDROCK, EMPTY, EXIT, HUMUS, PIG, STONE, TRUFFLE } from '../sim/types'
import type { GameEvent, Level, State } from '../sim/types'
import { createDiorama } from './diorama'
import { disposeTree } from './dispose'
import { forestDecor } from './forest'
import {
  MATERIALS, bedrockGeometry, cavityGeometry, createPig, exitGeometries, humusGeometry, sparkleGeometry, stoneGeometry, truffleGeometry,
} from './models'
import { type PigAction, crushDrop, exitPath, pigPath, posePig, smooth, soilLeft, truffleLeft } from './pigAnim'
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
// The pig is cut off where it passes the light at the back of the doorway, so it walks out of sight.
const pigMaterial = Object.assign(MATERIALS.lit.clone(), { clipShadows: true })
shared.exit.glow.computeBoundingBox()
const doorway = new THREE.Plane(new THREE.Vector3(0, 0, 1), -shared.exit.glow.boundingBox!.min.z)
pigMaterial.clippingPlanes = [doorway]
const HINGE = new THREE.Vector3(-5 / 16, 0, -1 / 4) // the door's left edge, from the middle of its tile

// A warm glow behind each truffle, so the black knob stands out against the dark soil.
const halo = (() => {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255, 210, 122, 0.85)')
  grad.addColorStop(0.45, 'rgba(255, 190, 90, 0.35)')
  grad.addColorStop(1, 'rgba(255, 170, 70, 0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  const map = new THREE.CanvasTexture(c)
  map.colorSpace = THREE.SRGBColorSpace
  const material = new THREE.MeshBasicMaterial({ map, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  return { geometry: new THREE.PlaneGeometry(1.4, 1.4), material, map }
})()

const KEEP = new Set<object>([pigMaterial, ...Object.values(halo), 
  ...shared.humus, ...shared.bedrock, ...shared.cavity, ...shared.stone, shared.truffle, shared.sparkle,
  ...Object.values(shared.exit), ...Object.values(MATERIALS),
])

const STONE_RADIUS = 0.44 // the stone model is 21 voxels tall at 24 per tile
const CRUMBS = 12
const CRUMB_LIFE = 0.7
const FLAT = 0.4 // a crushed pig keeps this much of its height
const SAG = 0.9 // and a pig carrying a stone, this much
const BACK = 0.56 // the top of the pig's back, above its trotters
const SNOUT = new THREE.Vector3(0.375, -0.04, 0) // the tip of the snout, from the neck
const TRUFFLE_MID = 0.29 // a truffle's centre, above the floor it sits on

// What the pig is doing during a turn, from what the turn did.
function actionOf(events: GameEvent[], from: State, to: State, width: number): PigAction {
  const types = new Set(events.map(e => e.type))
  const dy = Math.floor(to.pig / width) - Math.floor(from.pig / width)
  if (types.has('drop')) return to.cells[to.pig + width] === EMPTY ? 'fall' : 'land'
  if (types.has('step')) return 'hop'
  if (types.has('dig')) return dy > 0 ? 'digDown' : 'dig'
  if (types.has('push')) return 'push'
  if (types.has('eat') && from.pig !== to.pig) return 'eat'
  return from.pig === to.pig ? 'idle' : 'walk'
}

// The level as a slice of forest soil seen from the front: gravity points down the screen.
// How far over a stone tipping onto the pig's back has gone, 0..1: it waits for the pig to be out of
// its way, then goes over faster and faster.
const tipOver = (a: number) => smooth(0.45, 1, a) ** 2

// Which way a resting stone or truffle on another one could roll once the pig clears the way:
// 0 when held, -1 or 1 for one side, 2 for both. A side held by bedrock, a stone or the pig never frees.
function teeter(s: State, i: number, w: number): number {
  const below = s.cells[i + w]
  if (s.falling[i] || (below !== STONE && below !== TRUFFLE)) return 0
  const clearable = (c: number) => c === EMPTY || c === HUMUS
  // the pig under that side frees it too: the stone would tip onto its back
  const sides = [-1, 1].filter(d => clearable(s.cells[i + d]) && (clearable(s.cells[i + w + d]) || s.cells[i + w + d] === PIG))
  return sides.length === 2 ? 2 : sides[0] ?? 0
}

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
  private pig = createPig(pigMaterial)
  private pigHeight = new THREE.Box3().setFromObject(this.pig).max.y // from its trotters to the top of its back
  private facing = 1 // +1 right, -1 left
  private yaw = 0
  private door: THREE.Mesh | null = null
  private glow: THREE.Mesh | null = null
  private hinge = new THREE.Group()
  private exitLight = new THREE.PointLight(PALETTE.dawn, 0, 3)
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
    this.renderer.localClippingEnabled = true
    this.scene.add(this.exitLight)
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
        this.hinge = new THREE.Group()
        this.hinge.position.copy(at).add(HINGE)
        this.door.position.copy(HINGE).negate()
        this.hinge.add(this.door)
        this.root.add(this.hinge)
        this.exitLight.position.set(at.x, at.y, -0.45) // behind the pig: it shows against the light
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
      const h = new THREE.Mesh(halo.geometry, halo.material.clone()) // its own, so each one pulses on its own beat
      h.position.set(0, -0.5 + TRUFFLE_MID, -0.4)
      h.renderOrder = -1
      p.add(h)
      p.userData.halo = h
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
    const rolled = new Set(f.events.filter(e => e.type === 'roll').map(e => e.id))
    for (const [id, cell] of to) {
      const p = this.piece(id, f.to.cells[cell])
      p.visible = true
      p.scale.setScalar(1)
      const start = from.get(id) ?? cell
      p.position.lerpVectors(pos(start), pos(cell), a)
      if (rolled.has(id)) {
        // off the edge: it tips over sideways and drops, faster and faster
        const s0 = pos(start), s1 = pos(cell)
        if (s1.y === s0.y) p.position.x = s0.x + (s1.x - s0.x) * tipOver(a) // onto the pig's back, settled below
        else {
          p.position.x = s0.x + (s1.x - s0.x) * smooth(0, 0.7, a)
          p.position.y = s0.y + (s1.y - s0.y) * a * a // round on round: it sinks a little from the start
        }
      }
      // a stone rolls without slipping: its turn follows from how far along the row it is
      if (p.userData.kind === STONE) p.children[0].rotation.z = p.userData.spin - p.position.x / STONE_RADIUS
      // round on round, with only soil or air to one side: every few seconds it rocks that way, so the
      // player sees it would roll off there once the side is clear
      const lean = start === cell ? teeter(f.to, cell, level.width) : 0
      if (lean) {
        const beat = (clock + id * 0.9) % 2.6
        const k = Math.sin(Math.min(1, beat / 0.9) * Math.PI) * (lean === 2 ? Math.sin(beat * 7) : lean) // rocks both ways when free on both sides
        p.children[0].rotation.z -= 0.16 * k
        p.position.x += 0.05 * k
      }
      const sp = p.userData.sparkle as THREE.Mesh | undefined
      if (sp) sp.scale.setScalar(1.6 * Math.max(0, Math.sin(clock * 2.2 + id * 1.7)) ** 3)
      const h = p.userData.halo as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined
      if (h) h.material.opacity = 0.75 + 0.25 * Math.sin(clock * 2.4 + id * 1.7)
    }
    const p0 = f.from.pig, p1 = f.to.pig
    const action = f.phase === 'dying' ? 'idle' : actionOf(f.events, f.from, f.to, level.width)
    // eaten this turn: the truffle shrinks into the snout as it reaches it
    const caught = f.events.find(e => e.type === 'eat' && e.cell !== f.to.pig)?.id
    for (const [id, cell] of from) {
      if (to.has(id) || id === caught) continue
      const p = this.piece(id, TRUFFLE)
      p.position.copy(pos(cell))
      if (cell === f.to.pig && cell > f.from.pig + 1) {
        // dropped onto: it goes as the falling pig's trotters reach it
        const left = 1 - smooth(0.55, 0.8, a)
        p.visible = left > 0
        p.scale.set(left, left * left, left) // flattened against the floor
        p.position.y -= 0.5 * (1 - left * left)
        continue
      }
      const left = truffleLeft(a)
      p.visible = left > 0
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

    // through the open door: the pig turns its back to us, hops for joy and trots into the light,
    // then the door swings shut behind it
    const open = exitOpen(level, f.to)
    const exiting = f.to.status === 'won' && a >= 1
    const out = exitPath(f.winT)
    if (this.door) this.door.visible = !open || (exiting && f.winT > 0)
    if (this.glow) this.glow.visible = open && out.shut < 1
    const u = out.shut // slammed: faster and faster, then a little rebound off the frame
    this.hinge.rotation.y = exiting ? -(Math.PI / 2) * (1 - (u < 0.6 ? (u / 0.6) ** 2 : 1 - 0.12 * Math.sin((Math.PI * (u - 0.6)) / 0.4))) : 0
    this.exitLight.intensity = exiting ? 2.5 * smooth(0.45, 0.7, f.winT) * (1 - smooth(0, 0.6, u)) : 0

    // the pig turns round on the spot (through facing the camera), then acts
    const dt = Math.max(0, clock - this.lastClock)
    this.lastClock = clock
    const dx = (p1 % level.width) - (p0 % level.width)
    if (dx) this.facing = Math.sign(dx)
    const targetYaw = this.facing > 0 ? 0 : Math.PI
    this.yaw += (targetYaw - this.yaw) * Math.min(1, dt * 22)
    this.pig.rotation.y = exiting ? this.yaw + (Math.PI / 2 - this.yaw) * out.turn : this.yaw
    const path = pigPath(action, a), q0 = pos(p0), q1 = pos(p1)
    this.pig.position.set(q0.x + (q1.x - q0.x) * path.x, q0.y + (q1.y - q0.y) * path.y, 0)
    this.pig.position.y -= 0.5
    this.pig.position.z = 0.05
    if (exiting) {
      this.pig.position.y += out.lift
      this.pig.position.z -= 1.3 * out.depth
    }
    // crushed: the stone that killed it keeps falling onto its back and flattens it; a rewind lifts it off
    const dead = f.to.status === 'dead' ? f.to : f.from.status === 'dead' ? f.from : null
    let flat = 0
    if (dead) {
      const gap = 1 - this.pigHeight, give = (1 - FLAT) * this.pigHeight // the stone rests on the floor of the tile above
      const drop = dead === f.to ? crushDrop(f.dyingT * DEATH_SECONDS, 1 / TURN_SECONDS, gap, give) : (1 - a) * (gap + give)
      const stone = this.pieces.get(dead.ids[dead.pig - level.width])
      if (stone) stone.position.y -= drop
      flat = Math.max(0, drop - gap) / give
    }
    // a stone or a truffle resting right above the pig sits on its back: the pig sags under it and it
    // trembles there, since it falls as soon as the pig moves away
    const loadOf = (s: State) => {
      const c = s.pig - level.width
      return (s.cells[c] === STONE || s.cells[c] === TRUFFLE) && !s.falling[c] ? s.ids[c] : 0
    }
    const held = loadOf(f.from), holds = loadOf(f.to)
    const feet = this.pig.position.y
    const top = (load: number) => feet + this.pigHeight * (1 - (1 - SAG) * load)
    let load = 0
    if (holds && holds === held) {
      load = 1
      this.pieces.get(holds)!.position.y = top(1) + 0.5
    } else if (holds && rolled.has(holds)) {
      // tipped over onto the back: round the stone below it, sinking faster and faster, until the back stops it
      const p = this.pieces.get(holds)!, x = tipOver(a), y0 = pos(f.from.ids.indexOf(holds)).y
      const arc = y0 - (1 - Math.sqrt(1 - x * x))
      p.position.y = x > 0.5 ? Math.max(top(1) + 0.5, arc) : arc // the back only stops it once it is over it
      load = smooth(0.85, 1, a)
    } else if (holds) {
      // walking in under it: it settles onto the back as the pig gets there
      load = smooth(0.6, 1, path.x)
      const p = this.pieces.get(holds)!
      p.position.y += (top(1) + 0.5 - p.position.y) * load
    } else if (held && to.has(held)) {
      // walking out from under it: it stays on the back until the back has slid away, then drops
      const p = this.pieces.get(held)!, x = p.position.x
      const under = (t: number) => Math.abs(q0.x + (q1.x - q0.x) * pigPath(action, t).x - x) < 0.6
      let a0 = 0 // when the back stops holding it up; at once if the pig drops or digs down away from it
      while (q1.y === q0.y && a0 < 1 && under(a0)) a0 += 0.05
      load = 1 - smooth(a0, a0 + 0.1, a)
      const back = feet - (q1.y - q0.y) * path.y + this.pigHeight * SAG // the back at the start of the turn
      const end = pos(to.get(held)!).y - 0.5
      let bottom = back + (end - back) * (a < a0 ? 0 : ((a - a0) / (1 - a0)) ** 2)
      if (under(a)) bottom = Math.max(bottom, top(load))
      p.position.y = bottom + 0.5
    }
    if (holds && load) this.pieces.get(holds)!.children[0].rotation.z += 0.04 * load * Math.sin(clock * 38)
    if (exiting) posePig(this.pig, 'exit', f.winT, clock)
    else posePig(this.pig, flat ? 'crushed' : action, flat || a, clock)
    const drop = caught && from.get(caught)
    if (drop) {
      const feet = (t: number) => {
        const k = pigPath(action, t)
        return new THREE.Vector3(q0.x + (q1.x - q0.x) * k.x, q0.y + (q1.y - q0.y) * k.y - 0.5, 0)
      }
      // dug out from under it, it stays on the soil until the snout has eaten through
      const dugUnder = action === 'dig' && f.from.cells[p1] === HUMUS
      const floor = (t: number) => pos(p1).y - 0.5 + (dugUnder && soilLeft(t) > 0.5 ? 1 : 0) // it tips off once half the soil is gone
      this.renderCatch(this.piece(caught, TRUFFLE), pos(drop), !!f.from.falling[drop], feet, floor, a)
    }
    if (f.to !== this.lastTo) {
      this.lastTo = f.to
      if ((action === 'dig' || action === 'digDown') && f.alpha < 1) this.burst(pos(p0), pos(p1), clock)
    }
    this.renderCrumbs(clock)
    this.pig.scale.set(1 + 0.25 * flat, 1 - (1 - FLAT) * flat - (1 - SAG) * load, 1 + 0.25 * flat)
    this.pig.visible = !(exiting && out.depth >= 1)

    this.decor?.userData.update?.(clock)
    if (this.diorama) this.diorama.render()
    else this.renderer.render(this.scene, this.camera)
  }

  // A truffle dropping onto the pig: it falls until the pig's back or the floor stops it. Landed on
  // the back, a toss of the head throws it up to the snout and the pig gulps it; landed on the floor,
  // the pig eats it as its snout gets there. `feet(t)` is where the pig stands at turn progress t.
  private renderCatch(p: THREE.Object3D, start: THREE.Vector3, falling: boolean, feet: (t: number) => THREE.Vector3, floor: (t: number) => number, a: number) {
    const v0 = (falling ? 1 / TURN_SECONDS : 0) * CATCH_SECONDS, g = 7 // in tiles per turn, and per turn squared
    const first = (from: number, ok: (t: number) => boolean) => {
      let t = from
      while (t < 1 && !ok(t)) t += 0.01
      return t
    }
    const held = first(0, t => floor(t) < start.y - 0.5 - 1e-3) // when the soil it rests on gives way
    const free = (t: number) => start.y - 0.5 - v0 * t - g * Math.max(0, t - held) ** 2 // the bottom of the truffle
    const under = (t: number) => Math.abs(feet(t).x - start.x) < 0.45
    const support = (t: number) => (under(t) ? feet(t).y + BACK : floor(t))
    const c = first(0, t => free(t) <= support(t)) // when it lands
    p.visible = true
    p.position.set(start.x, Math.max(free(a), support(a)) + 0.5, 0)
    p.scale.setScalar(1)
    if (a < c) return
    if (!under(c)) {
      // on the floor in front of the pig: it shrinks into the snout as the snout reaches it
      const reach = first(c, t => Math.abs(feet(t).x + this.facing * 0.48 - start.x) < 0.25)
      const left = 1 - smooth(reach, reach + 0.15, a)
      p.scale.setScalar(left)
      p.visible = left > 0
      return
    }
    // on the back: a toss of the head sends it up in an arc to the snout, then a gulp and two chews
    const head = (this.pig.userData as { head: THREE.Object3D }).head
    head.rotation.z += 0.6 * Math.sin(Math.PI * Math.min(1, (a - c) / 0.3)) + 0.07 * Math.sin(smooth(c + 0.3, 1, a) * 4 * Math.PI)
    this.pig.updateMatrixWorld(true)
    const s = this.root.worldToLocal(head.localToWorld(SNOUT.clone()))
    const d = Math.min(0.14, (1 - c) / 2) // landing late in the turn, the pig is quicker about it
    const toss = smooth(c, c + d, a), gulp = smooth(c + d, c + 1.9 * d, a)
    const at = new THREE.Vector3(start.x, feet(a).y + BACK + TRUFFLE_MID, 0).lerp(s, toss)
    at.y += 0.3 * Math.sin(Math.PI * toss)
    const k = (1 - 0.5 * toss) * (1 - gulp)
    p.position.set(at.x, at.y + (0.5 - TRUFFLE_MID) * k, at.z)
    p.scale.setScalar(k)
    p.visible = k > 0
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
      const vy = this.crumbDir.x ? 0.3 + 0.7 * rnd(i, 2) : 0.15 + 0.3 * rnd(i, 2) // digging down, crumbs barely leave the hole
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
