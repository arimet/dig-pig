// Sound effects synthesised with Web Audio. Silent when Web Audio is missing or muted.
const MUTE_KEY = 'truffe-dash:muted'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let muted = (() => { try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false } })()

function audio(): { ac: AudioContext; out: GainNode } | null {
  if (muted) return null
  if (!ctx) {
    const AC = globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') void ctx.resume()
  return { ac: ctx, out: master! }
}

// Browsers only start audio after a user gesture.
export function unlockAudio() {
  audio()
}

function tone(type: OscillatorType, from: number, to: number, dur: number, vol = 0.3, delay = 0) {
  const a = audio()
  if (!a) return
  const t = a.ac.currentTime + delay
  const o = a.ac.createOscillator(), g = a.ac.createGain()
  o.type = type
  o.frequency.setValueAtTime(from, t)
  o.frequency.exponentialRampToValueAtTime(to, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  o.connect(g).connect(a.out)
  o.start(t)
  o.stop(t + dur + 0.02)
}

function noise(dur: number, from: number, to: number, vol: number) {
  const a = audio()
  if (!a) return
  const t = a.ac.currentTime
  const buf = a.ac.createBuffer(1, Math.ceil(a.ac.sampleRate * dur), a.ac.sampleRate)
  const data = buf.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = a.ac.createBufferSource(), f = a.ac.createBiquadFilter(), g = a.ac.createGain()
  src.buffer = buf
  f.type = 'bandpass'
  f.Q.value = 0.8
  f.frequency.setValueAtTime(from, t)
  f.frequency.exponentialRampToValueAtTime(to, t + dur)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.3)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  src.connect(f).connect(g).connect(a.out)
  src.start(t)
}

let lastOink = 0

export const sfx = {
  dig: () => noise(0.09, 500, 200, 0.18),
  bump: () => tone('square', 180, 140, 0.05, 0.06),
  push: () => { noise(0.18, 220, 120, 0.3); tone('sine', 90, 70, 0.15, 0.12) },
  land: () => { tone('sine', 120, 45, 0.16, 0.35); noise(0.08, 300, 120, 0.15) },
  eat() {
    noise(0.06, 2400, 1400, 0.12)
    noise(0.06, 2200, 1200, 0.1)
    tone('square', 880, 1320, 0.08, 0.06, 0.05)
  },
  open: () => [784, 988, 1175].forEach((f, i) => tone('triangle', f, f, 0.18, 0.16, i * 0.08)),
  // a short nasal grunt: two detuned saws through a narrow formant
  oink() {
    const a = audio()
    if (!a || a.ac.currentTime - lastOink < 0.3) return
    lastOink = a.ac.currentTime
    const t = a.ac.currentTime, dur = 0.22
    const f = a.ac.createBiquadFilter(), g = a.ac.createGain()
    f.type = 'bandpass'
    f.Q.value = 6
    f.frequency.setValueAtTime(900, t)
    f.frequency.linearRampToValueAtTime(1300, t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.03)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    f.connect(g).connect(a.out)
    for (const detune of [0, 12]) {
      const o = a.ac.createOscillator()
      o.type = 'sawtooth'
      o.detune.value = detune
      o.frequency.setValueAtTime(220, t)
      o.frequency.linearRampToValueAtTime(300, t + dur)
      o.connect(f)
      o.start(t)
      o.stop(t + dur + 0.02)
    }
  },
  fail() {
    tone('triangle', 440, 330, 0.22, 0.25)
    tone('triangle', 330, 150, 0.4, 0.25, 0.22)
  },
  win() {
    ;[523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, f, 0.22, 0.22, i * 0.11))
  },
  get muted() { return muted },
  setMuted(m: boolean) {
    muted = m
    try { localStorage.setItem(MUTE_KEY, m ? '1' : '0') } catch { /* not persisted */ }
  },
}
