import { useEffect, useRef, useState } from 'react'
import { useRoom } from '../hooks/useRoom'
import { call, friendly } from '../api'
import { play, isMuted, setMuted } from '../sound'
import Fx from './Fx'

const MOVES = {
  rock: { icon: '🪨', label: 'Rock' },
  paper: { icon: '📄', label: 'Paper' },
  scissors: { icon: '✂️', label: 'Scissors' },
}
const MSG = {
  win: 'Yay! You won, cutie! 💗',
  lose: "Aww, don't worry! You're still my favorite. 🥹💕",
  draw: 'Great minds think alike! 💞',
}

function Player({ p, mine, on, score, phase, fallback, avatar }) {
  const moved = Boolean(p?.has_moved) && phase === 'playing'
  return (
    <div className={`pcard glass ${on ? 'on' : ''} ${moved ? 'moved' : ''}`}>
      <div className="avatar" aria-hidden="true">{avatar}{moved && <span className="pop">💗</span>}</div>
      <div className="pinfo">
        <strong>{p ? p.name : fallback}{mine && <em className="tag">You 💕</em>}</strong>
        <small className="muted">
          {!p ? 'Waiting for them…' : on ? 'Online' : 'Away for a moment'}
          {p && phase === 'playing' && (moved ? ' · chose! 💗' : ' · thinking…')}
        </small>
      </div>
      <span className={`pulse ${on ? 'on' : ''}`} aria-hidden="true">♥</span>
      <b className="score" aria-label={`Score ${score}`}>{score}</b>
    </div>
  )
}

export default function Game({ code, uid, onExit }) {
  const { loading, room, players, error, online } = useRoom(code, uid)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [muted, setMutedState] = useState(isMuted())
  const [toast, setToast] = useState('')
  const [askLeave, setAskLeave] = useState(false)
  const [picked, setPicked] = useState(null)
  const seen = useRef(null)

  const me = players.find((p) => p.user_id === uid)
  const opp = players.find((p) => p.user_id !== uid)
  const lr = room?.last_round
  const link = `${location.origin}/?room=${code}`

  useEffect(() => {
    if (!room || !me) return
    const n = lr?.round ?? 0
    if (seen.current !== null && n > seen.current) play(lr.winner === 0 ? 'draw' : lr.winner === me.slot ? 'win' : 'lose')
    seen.current = n
  }, [lr?.round, room, me]) // eslint-disable-line

  const flash = (m) => { setToast(m); setTimeout(() => setToast(''), 2000) }
  const copy = async (text, msg) => {
    try { await navigator.clipboard.writeText(text); flash(msg) } catch { window.prompt('Copy this:', text) }
  }
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'Play with me 💗', text: 'Join my Rock Paper Scissors room!', url: link }); return }
      catch (e) { if (e.name === 'AbortError') return }
    }
    copy(link, 'Invite link copied 💌')
  }
  const act = async (action, extra) => {
    setBusy(true); setErr('')
    try { await call(action, { code, ...extra }) } catch (e) { setErr(friendly(e.message)) } finally { setBusy(false) }
  }
  const choose = (m) => { play('click'); setPicked(m); act('move', { move: m }) }
  const leave = async () => {
    setBusy(true)
    try { await call('leave', { code }) } catch { /* room may already be gone */ }
    onExit()
  }
  const toggleMute = () => { setMuted(!muted); setMutedState(!muted) }

  if (loading) return <main className="center"><p className="muted" role="status"><span className="dots">Loading our room</span></p></main>
  if (error || !room || !me) return (
    <main className="center"><div className="card glass enter">
      <h2>{error === 'NETWORK' ? 'Connection problem' : 'Room unavailable'}</h2>
      <p className="muted">{error === 'NETWORK' ? 'Could not reach the server. Check your connection and retry.' : 'This room was closed or you are no longer in it.'}</p>
      <button className="btn primary" onClick={onExit}>Back to home</button>
    </div></main>
  )

  const oppOnline = Boolean(opp) && online.includes(opp.user_id)
  const meOnline = online.includes(uid)
  const phase = room.phase
  const oppSlot = me.slot === 1 ? 2 : 1
  const scoreOf = (s) => (s === 1 ? room.score1 : room.score2)
  const verdict = lr ? (lr.winner === 0 ? 'draw' : lr.winner === me.slot ? 'win' : 'lose') : null

  let status
  if (phase === 'waiting') status = 'Waiting for your player two 💗'
  else if (phase === 'finished') status = room.winner === me.slot ? 'You won the whole game! 🏆💗' : `${opp?.name} won this time — you're still my favorite 💕`
  else if (me.has_moved) status = `Locked in! Waiting for ${opp?.name}…`
  else if (opp?.has_moved) status = `${opp.name} has chosen. Your turn! 💕`
  else if (!lr) status = 'Both players are here! Let the fun begin! ✨'
  else status = `Round ${room.round}: pick your move`

  return (
    <main className="game">
      <header className="roomcard glass enter">
        <div><small className="muted">Our room</small><code className="roomcode">{code}</code></div>
        <div className="bar-actions">
          <button className="btn small" onClick={() => copy(code, 'Room code copied 💗')}>Copy code</button>
          <button className="btn small lav" onClick={share}>Share invite 💌</button>
          <button className="btn small" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}>{muted ? '🔇' : '🔊'}</button>
          <button className="btn small ghost" onClick={() => setAskLeave(true)}>Leave</button>
        </div>
      </header>

      {!meOnline && <p className="banner" role="status">Reconnecting to the realtime server…</p>}
      {opp && !oppOnline && phase !== 'waiting' && <p className="banner" role="status">{opp.name} stepped away. Waiting for them to come back…</p>}

      <section className="board">
        <Player p={me} mine on={meOnline} score={scoreOf(me.slot)} phase={phase} avatar="🐰" fallback="You 💕" />
        <div className={`link ${opp ? 'joined' : ''}`} aria-hidden="true"><i /><span>{opp ? '💗' : '💌'}</span><i /></div>
        <Player p={opp} on={oppOnline} score={opp ? scoreOf(oppSlot) : 0} phase={phase} avatar="🧸" fallback="My Favorite Person 🧸" />
      </section>
      <p className="meta muted">First to {room.target} · Round {room.round}</p>

      <section className="stage glass" aria-live="polite">
        {phase === 'waiting' && (
          <div className="invite enter">
            <div className="envelope" aria-hidden="true">💌</div>
            <p>Your favorite person is joining... 💌</p>
            <code className="url">{link}</code>
          </div>
        )}
        {lr && phase !== 'waiting' && (
          <div className="reveal" key={lr.round}>
            <Fx kind={verdict} />
            <div className="hand">{MOVES[lr.moves[me.slot]]?.icon}<small>You</small></div>
            <div className={`verdict ${verdict}`}>{MSG[verdict]}</div>
            <div className="hand">{MOVES[lr.moves[oppSlot]]?.icon}<small>{opp?.name}</small></div>
          </div>
        )}
        <p className="status">{me.has_moved && phase === 'playing' ? <span className="dots">{status.replace('…', '')}</span> : status}</p>
      </section>

      {phase === 'playing' && (
        <div className="moves" role="group" aria-label="Choose your move">
          {Object.entries(MOVES).map(([k, v]) => (
            <button key={k} className={`move ${k} ${me.has_moved && picked === k ? 'picked' : ''}`} disabled={busy || me.has_moved || !opp} onClick={() => choose(k)}>
              <span className="emoji">{v.icon}</span>{v.label}
              {me.has_moved && picked === k && <span className="pop" aria-hidden="true">💗</span>}
            </button>
          ))}
        </div>
      )}
      {phase === 'finished' && <button className="btn primary big again" disabled={busy} onClick={() => act('reset')}>Play Again 💞</button>}
      {phase === 'playing' && room.score1 + room.score2 > 0 && (
        <button className="btn small ghost" disabled={busy} onClick={() => act('reset')}>Reset score</button>
      )}
      {err && <p className="error" role="alert">{err}</p>}

      {toast && <div className="toast" role="status">{toast}</div>}
      {askLeave && (
        <div className="overlay" onClick={() => setAskLeave(false)}>
          <div className="modal glass" role="dialog" aria-modal="true" aria-labelledby="lv" onClick={(e) => e.stopPropagation()}>
            <h2 id="lv">Leave our room? 🥺</h2>
            <p className="muted">Your score will be lost and your favorite person will be left waiting.</p>
            <div className="bar-actions">
              <button className="btn primary" autoFocus onClick={() => setAskLeave(false)}>Stay 💗</button>
              <button className="btn" disabled={busy} onClick={leave}>Leave</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
