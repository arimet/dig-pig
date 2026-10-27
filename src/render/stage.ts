import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'

export const SKY = '#141a2e'

// Renderer, night forest sky, warm key light with soft shadows. Shared by the game and the gallery.
export function createStage(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.95

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(SKY)
  scene.fog = new THREE.Fog(SKY, 18, 45)
  // dim studio reflections so metal reads as metal
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.22

  scene.add(new THREE.HemisphereLight('#7f93e6', '#2a1f18', 0.55))
  const key = new THREE.DirectionalLight('#ffcf94', 2.4)
  key.position.set(-6, 11, 7)
  key.castShadow = true
  key.shadow.mapSize.set(2048, 2048)
  key.shadow.bias = -0.0004
  key.shadow.normalBias = 0.02
  key.shadow.radius = 4
  Object.assign(key.shadow.camera, { left: -10, right: 10, top: 9, bottom: -9, near: 1, far: 40 })
  scene.add(key)
  const fill = new THREE.DirectionalLight('#6f8cff', 0.45)
  fill.position.set(6, 5, -6)
  scene.add(fill)

  return { renderer, scene, key }
}
