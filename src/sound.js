let ctx
const KEY = 'rps_muted'
export const isMuted = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
export const setMuted = (m) => { try { localStorage.setItem(KEY, m ? '1' : '0') } catch { /* ignore */ } }
const SEQ = {
  click: [[520, 0.07]], join: [[600, 0.08], [800, 0.1]],
  win: [[523, 0.12], [659, 0.12], [784, 0.22]], lose: [[330, 0.16], [220, 0.28]], draw: [[440, 0.12], [440, 0.12]],
}
export function play(kind) {
  if (isMuted()) return
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()
    let t = ctx.currentTime
    for (const [f, d] of SEQ[kind] || []) {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = f
      g.gain.setValueAtTime(0.08, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + d)
      o.connect(g).connect(ctx.destination)
      o.start(t); o.stop(t + d); t += d
    }
  } catch { /* audio unavailable */ }
}
