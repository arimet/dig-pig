// Visual sign-off sheet for the voxel models (not part of the game). ?view=pig | tiles
import * as THREE from 'three'
import { MATERIALS, bedrockGeometry, cavityGeometry, createPig, exitGeometries, humusGeometry, sparkleGeometry, stoneGeometry, truffleGeometry } from './render/models'
import { createStage } from './render/stage'

const canvas = document.getElementById('c') as HTMLCanvasElement
const { renderer, scene } = createStage(canvas)
const lit = MATERIALS.lit
const shadowed = <T extends THREE.Object3D>(o: T) => { o.traverse(c => { c.castShadow = c.receiveShadow = true }); return o }
const view = new URLSearchParams(location.search).get('view') ?? 'pig'
const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200)

if (view === 'pig') {
  // the same pig from the side (as in play), three-quarter, front and back
  const floor = shadowed(new THREE.Mesh(new THREE.BoxGeometry(6, 0.2, 2), new THREE.MeshStandardMaterial({ color: '#4a311d' })))
  floor.position.y = -0.1
  scene.add(floor)
  ;[0, -Math.PI / 5, -Math.PI / 2, Math.PI / 2].forEach((r, i) => {
    const pig = createPig(lit)
    pig.position.set(-1.8 + i * 1.2, 0, 0)
    pig.rotation.y = r
    scene.add(pig)
  })
  camera.position.set(0, 1.0, 4.4)
  camera.lookAt(0, 0.35, 0)
} else {
  // a little wall of soil: every tile kind, with the loose pieces in dug tiles
  const rows = ['#######', '#..*.X#', '#.o  .#', '#..o.x#', '#######']
  const ex = exitGeometries()
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    const at = (geo: THREE.BufferGeometry, mat: THREE.Material = lit, dy = 0) => {
      const m = shadowed(new THREE.Mesh(geo, mat))
      m.position.set(x - 3, 2 - y + dy, 0)
      scene.add(m)
      return m
    }
    if (c === '#') at(bedrockGeometry((x * 7 + y) % 4))
    else if (c === '.') at(humusGeometry((x * 5 + y * 3) % 6))
    else {
      at(cavityGeometry((x + y) % 4))
      if (c === 'o') at(stoneGeometry(x % 3), lit, -0.5)
      if (c === '*') { at(truffleGeometry(), MATERIALS.glossy, -0.5); at(sparkleGeometry(), MATERIALS.glow, -0.05).position.x += 0.2 }
      if (c === 'X' || c === 'x') { at(ex.frame); at(c === 'X' ? ex.door : ex.glow, c === 'X' ? lit : MATERIALS.glow) }
    }
  }))
  const pig = createPig(lit)
  pig.position.set(-3 + 4, 2 - 2 - 0.5, 0)
  scene.add(pig)
  camera.position.set(1.2, 2.2, 9.5)
  camera.lookAt(0, 0, 0)
}

const resize = () => {
  renderer.setSize(innerWidth, innerHeight, false)
  camera.aspect = innerWidth / innerHeight
  camera.updateProjectionMatrix()
}
addEventListener('resize', resize)
resize()
renderer.setAnimationLoop(() => renderer.render(scene, camera))
