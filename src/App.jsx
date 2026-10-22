import { useEffect, useMemo, useState } from 'react'
import { supabase, configured } from './supabase'
import Landing from './components/Landing'
import Game from './components/Game'

const urlCode = () => (new URLSearchParams(location.search).get('room') || '').toUpperCase()

export default function App() {
  const [uid, setUid] = useState(null)
  const [code, setCode] = useState(null)
  const [boot, setBoot] = useState(configured ? 'loading' : 'config')

  useEffect(() => {
    if (!configured) return
    ;(async () => {
      try {
        let { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          const { data, error } = await supabase.auth.signInAnonymously()
          if (error) throw error
          session = data.session
        }
        setUid(session.user.id)
        const c = urlCode()
        if (c) { // reconnect after a refresh if already a member
          const { data } = await supabase.from('players').select('room_code').eq('room_code', c).eq('user_id', session.user.id).maybeSingle()
          if (data) setCode(c)
        }
        setBoot('ready')
      } catch { setBoot('error') }
    })()
  }, [])

  const enter = (c) => { history.replaceState(null, '', `?room=${c}`); setCode(c) }
  const exit = () => { history.replaceState(null, '', location.pathname); setCode(null) }

  const bits = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    e: ['💗', '✨', '🌸', '🩷', '⭐'][i % 5], l: (i * 37) % 100, s: 14 + ((i * 5) % 16),
    d: 14 + ((i * 7) % 14), t: -((i * 3) % 20),
  })), [])

  return (
    <>
      <div className="bg" aria-hidden="true">
        {bits.map((b, i) => <span key={i} style={{ left: `${b.l}%`, fontSize: b.s, animationDuration: `${b.d}s`, animationDelay: `${b.t}s` }}>{b.e}</span>)}
      </div>
      {boot === 'loading' && <main className="center"><p className="muted" role="status">Starting…</p></main>}
      {boot === 'config' && <main className="center"><p className="error">Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. See the README.</p></main>}
      {boot === 'error' && <main className="center"><div className="card glass"><h2>Could not start</h2><p className="muted">Sign-in failed. Make sure Anonymous sign-ins are enabled in Supabase, then reload.</p></div></main>}
      {boot === 'ready' && (code ? <Game code={code} uid={uid} onExit={exit} /> : <Landing initialCode={urlCode()} onEnter={enter} />)}
    </>
  )
}
