import { useRef, useState } from 'react'
import { call, friendly } from '../api'
import { play } from '../sound'

const parseCode = (s) => {
  try { return (new URL(s).searchParams.get('room') || '').toUpperCase() }
  catch { return s.trim().toUpperCase() }
}

export default function Landing({ initialCode, onEnter }) {
  const [name, setName] = useState(() => localStorage.getItem('rps_name') || '')
  const [joinText, setJoinText] = useState(initialCode || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const cardRef = useRef(null)

  const reveal = () => {
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setTimeout(() => cardRef.current?.querySelector('input')?.focus({ preventScroll: true }), 400)
  }
  const run = async (action, params) => {
    const clean = name.trim()
    if (!clean) return setErr(friendly('INVALID_NAME'))
    setBusy(true); setErr('')
    try {
      localStorage.setItem('rps_name', clean)
      const code = await call(action, { name: clean, ...params })
      play('join')
      onEnter(code)
    } catch (e) { setErr(friendly(e.message)) } finally { setBusy(false) }
  }

  return (
    <main className="landing">
      <section className="hero">
        <div className="bigheart" aria-hidden="true">💗</div>
        <h1 className="enter e1">Just You &amp; Me ♡</h1>
        <p className="sub enter e2">One little game, a million little smiles.</p>
        <button className="btn primary big enter e3" onClick={reveal}>Let&apos;s Play Together 💗</button>
      </section>
      <div className="card glass enter e4" ref={cardRef}>
        <label htmlFor="name">Your name</label>
        <input id="name" value={name} maxLength={20} placeholder="What should I call you?" onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={busy} onClick={() => run('create')}>Create our room 💌</button>
        <div className="or">or join your person</div>
        <label htmlFor="code">Room code or invite link</label>
        <input id="code" value={joinText} placeholder="ABCDE or the invite link" onChange={(e) => setJoinText(e.target.value)} />
        <button className="btn lav" disabled={busy || !joinText.trim()} onClick={() => run('join', { code: parseCode(joinText) })}>Join room 💞</button>
        {busy && <p className="muted" role="status"><span className="dots">Sending love</span></p>}
        {err && <p className="error" role="alert">{err}</p>}
      </div>
    </main>
  )
}
