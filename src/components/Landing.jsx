import { useState } from 'react'
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
      <h1 className="logo">Rock <span>Paper</span> Scissors</h1>
      <p className="tag">Private rooms. Real opponents. First to 3 wins.</p>
      <div className="card glass">
        <label htmlFor="name">Your display name</label>
        <input id="name" value={name} maxLength={20} placeholder="e.g. NeonFox" onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={busy} onClick={() => run('create')}>Create a room</button>
        <div className="or">or join a friend</div>
        <label htmlFor="code">Room code or invite link</label>
        <input id="code" value={joinText} placeholder="ABCDE or https://…/?room=ABCDE" onChange={(e) => setJoinText(e.target.value)} />
        <button className="btn cyan" disabled={busy || !joinText.trim()} onClick={() => run('join', { code: parseCode(joinText) })}>Join room</button>
        {busy && <p className="muted" role="status">Working…</p>}
        {err && <p className="error" role="alert">{err}</p>}
      </div>
      <div className="floaters" aria-hidden="true"><span>🪨</span><span>📄</span><span>✂️</span></div>
    </main>
  )
}
