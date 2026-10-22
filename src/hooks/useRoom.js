import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

// Loads room + players (RLS-filtered), keeps them fresh via Realtime, tracks presence.
export function useRoom(code, uid) {
  const [state, setState] = useState({ loading: true, room: null, players: [], error: null })
  const [online, setOnline] = useState([])

  useEffect(() => {
    let dead = false, timer
    const load = async () => {
      const [r, p] = await Promise.all([
        supabase.from('rooms').select('*').eq('code', code).maybeSingle(),
        supabase.from('players').select('*').eq('room_code', code).order('slot'),
      ])
      if (dead) return
      if (r.error || p.error) setState((s) => ({ ...s, loading: false, error: 'NETWORK' }))
      else if (!r.data || !p.data.some((x) => x.user_id === uid))
        setState({ loading: false, room: null, players: [], error: 'GONE' })
      else setState({ loading: false, room: r.data, players: p.data, error: null })
    }
    const refresh = () => { clearTimeout(timer); timer = setTimeout(load, 60) }
    const onVisible = () => document.visibilityState === 'visible' && load()

    const ch = supabase.channel(`room:${code}`, { config: { presence: { key: uid } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `code=eq.${code}` }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `room_code=eq.${code}` }, refresh)
      .on('presence', { event: 'sync' }, () => setOnline(Object.keys(ch.presenceState())))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { ch.track({ at: Date.now() }); load() }
      })
    document.addEventListener('visibilitychange', onVisible)
    load()
    return () => {
      dead = true
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(ch)
    }
  }, [code, uid])

  return { ...state, online }
}
