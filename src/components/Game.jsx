import { useEffect, useRef, useState } from 'react'
import { useRoom } from '../hooks/useRoom'
import { call, friendly } from '../api'
import { play, isMuted, setMuted } from '../sound'

const MOVES = {
  rock: { icon: '🪨', label: 'Rock' },
  paper: { icon: '📄', label: 'Paper' },
  scissors: { icon: '✂️', label: 'Scissors' },
}

function Player({ p, mine, on, score, phase }) {
  return (
    <div className={`pcard glass ${on ? 'on' : ''}`}>
      <span className={`dot ${on ? 'on' : ''}`} aria-hidden="true" />
      <div>
        <strong>{p ? p.name : 'Waiting…'}{mine && ' (you)'}</strong>
        <small className="muted">
          {!p ? 'Empty seat' : on ? 'Connected' : 'Disconnected'}
          {p && phase === 'playing' && (p.has_moved ? ' · locked in' : ' · thinking')}
        </small>
      </div>
      <b className="score" aria-label={`Score ${score}`}>{score}</b>
    </div>
  )
}

export default function Game({ code, uid, onExit }) {
  const { loading, room, players, error, online } = useRoom(code, uid)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [muted, setMutedState] = useState(isMuted())
  const [copied, setCopied] = useState(false)
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

  const act = async (action, extra) => {
    setBusy(true); setErr('')
    try { await call(action, { code, ...extra }) } catch (e) { setErr(friendly(e.message)) } finally { setBusy(false) }
  }
  const choose = (m) => { play('click'); setPicked(m); act('move', { move: m }) }
  const leave = async () => {
    if (!window.confirm('Leave this room? Your score will be lost.')) return
    setBusy(true)
    try { await call('leave', { code }) } catch { /* room may already be gone */ }
    onExit()
  }
  const copy = async () => {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1800) }
    catch { window.prompt('Copy this invite link:', link) }
  }
  const toggleMute = () => { setMuted(!muted); setMutedState(!muted) }

  if (loading) return <main className="center"><p className="muted" role="status">Loading room…</p></main>
  if (error || !room || !me) return (
    <main className="center"><div className="card glass">
      <h2>{error === 'NETWORK' ? 'Connection problem' : 'Room unavailable'}</h2>
      <p className="muted">{error === 'NETWORK' ? 'Could not reach the server. Check your connection and retry.' : 'This room was closed or you are no longer in it.'}</p>
      <button className="btn primary" onClick={onExit}>Back to home</button>
    </div></main>
  )

  const oppOnline = Boolean(opp) && online.includes(opp.user_id)
  const meOnline = online.includes(uid)
  const phase = room.phase
  const oppSlot = me.slot === 1 ? 2 : 1
  const scoreOf = (slot) => (slot === 1 ? room.score1 : room.score2)

  let status
  if (phase === 'waiting') status = 'Waiting for a second player to join…'
  else if (phase === 'finished') status = room.winner === me.slot ? '🏆 You win the match!' : `${opp?.name || 'Opponent'} wins the match.`
  else if (me.has_moved) status = `Move locked in. Waiting for ${opp?.name}…`
  else if (opp?.has_moved) status = `${opp.name} has chosen. Your turn!`
  else status = `Round ${room.round}: pick your move`

  const verdict = lr ? (lr.winner === 0 ? 'draw' : lr.winner === me.slot ? 'win' : 'lose') : null
  const verdictText = { draw: 'Draw', win: 'You won the round', lose: 'You lost the round' }[verdict]

  return (
    <main className="game">
      <header className="bar">
        <div><small className="muted">Room</small> <code className="roomcode">{code}</code></div>
        <div className="bar-actions">
          <button className="btn small" onClick={copy}>{copied ? 'Copied!' : 'Copy invite link'}</button>
          <button className="btn small" onClick={toggleMute} aria-pressed={muted} aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}>{muted ? '🔇' : '🔊'}</button>
          <button className="btn small danger" onClick={leave}>Leave</button>
        </div>
      </header>

      {!meOnline && <p className="banner" role="status">Reconnecting to the realtime server…</p>}
      {opp && !oppOnline && phase !== 'waiting' && <p className="banner" role="status">{opp.name} disconnected. Waiting for them to come back…</p>}

      <section className="board">
        <Player p={me} mine on={meOnline} score={scoreOf(me.slot)} phase={phase} />
        <div className="mid"><small className="muted">First to {room.target}</small><b>Round {room.round}</b></div>
        <Player p={opp} on={oppOnline} score={opp ? scoreOf(oppSlot) : 0} phase={phase} />
      </section>

      <section className="stage glass" aria-live="polite">
        {phase === 'waiting' && (
          <div className="invite">
            <p>Share this link with your friend:</p>
            <code className="link">{link}</code>
            <p className="muted">Or give them the room code <b>{code}</b>.</p>
          </div>
        )}
        {lr && phase !== 'waiting' && (
          <div className="reveal" key={lr.round}>
            <div className="hand">{MOVES[lr.moves[me.slot]]?.icon}<small>You</small></div>
            <div className={`verdict ${verdict}`}>{verdictText}</div>
            <div className="hand">{MOVES[lr.moves[oppSlot]]?.icon}<small>{opp?.name}</small></div>
          </div>
        )}
        <p className="status">{status}</p>
      </section>

      {phase === 'playing' && (
        <div className="moves" role="group" aria-label="Choose your move">
          {Object.entries(MOVES).map(([k, v]) => (
            <button key={k} className={`move ${me.has_moved && picked === k ? 'picked' : ''}`} disabled={busy || me.has_moved || !opp} onClick={() => choose(k)}>
              <span className="emoji">{v.icon}</span>{v.label}
            </button>
          ))}
        </div>
      )}
      {phase === 'finished' && <button className="btn primary big" disabled={busy} onClick={() => act('reset')}>Rematch</button>}
      {phase === 'playing' && room.score1 + room.score2 > 0 && (
        <button className="btn small" disabled={busy} onClick={() => window.confirm('Reset the score and restart?') && act('reset')}>Reset score</button>
      )}
      {err && <p className="error" role="alert">{err}</p>}
    </main>
  )
}
