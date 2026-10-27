import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'

// Separable blur that only grows outside the board's screen rectangle: the grid stays sharp,
// the farm around it softens like a model photographed up close. The second pass adds a vignette.
const DioramaShader = {
  uniforms: {
    tDiffuse: { value: null },
    dir: { value: new THREE.Vector2(1, 0) },
    rmin: { value: new THREE.Vector2(0, 0) },
    rmax: { value: new THREE.Vector2(1, 1) },
    strength: { value: 0.0025 },
    vignette: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 dir, rmin, rmax;
    uniform float strength, vignette;
    varying vec2 vUv;
    void main() {
      vec2 out2 = max(rmin - vUv, vUv - rmax);
      float w = clamp(max(out2.x, out2.y) * 9.0, 0.0, 1.0);
      vec4 c = vec4(0.0);
      float total = 0.0;
      for (int i = -4; i <= 4; i++) {
        float g = exp(-float(i * i) / 8.0);
        c += texture2D(tDiffuse, vUv + dir * float(i) * w * strength) * g;
        total += g;
      }
      c /= total;
      float v = smoothstep(0.95, 0.35, length(vUv - 0.5));
      c.rgb *= mix(1.0, v, vignette);
      gl_FragColor = c;
    }`,
}

export function createDiorama(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
  const composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const h = new ShaderPass(DioramaShader)
  const v = new ShaderPass(DioramaShader)
  v.uniforms.dir.value = new THREE.Vector2(0, 1)
  v.uniforms.vignette.value = 0.35
  composer.addPass(h)
  composer.addPass(v)
  composer.addPass(new OutputPass())
  return {
    render: () => composer.render(),
    setSize(w: number, hgt: number) {
      composer.setPixelRatio(renderer.getPixelRatio())
      composer.setSize(w, hgt)
      h.uniforms.strength.value = 2.2 / w
      v.uniforms.strength.value = 2.2 / hgt
    },
    // board rectangle in uv space (0..1, y up)
    setFocus(min: THREE.Vector2, max: THREE.Vector2) {
      for (const p of [h, v]) { p.uniforms.rmin.value.copy(min); p.uniforms.rmax.value.copy(max) }
    },
  }
}
