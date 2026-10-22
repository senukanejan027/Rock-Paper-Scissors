import { supabase } from './supabase'
const MESSAGES = {
  ROOM_NOT_FOUND: 'That room does not exist. Check the code or ask for a new invite link.',
  ROOM_FULL: 'This room already has two players.',
  INVALID_NAME: 'Enter a display name (1–20 characters).',
  RATE_LIMIT: 'Too many requests. Wait a few seconds and try again.',
  ALREADY_MOVED: 'You already locked in a move this round.',
  NOT_PLAYING: 'The game is not accepting moves right now.',
  NOT_A_MEMBER: 'You are not a player in this room.',
  UNAUTHENTICATED: 'Your session expired. Refresh the page.',
}
export const friendly = (m) => MESSAGES[m] || 'Something went wrong. Please try again.'

export async function call(action, params = {}) {
  const { data, error } = await supabase.functions.invoke('game', { body: { action, ...params } })
  if (error) {
    let msg = 'NETWORK'
    try { msg = (await error.context.json()).error || msg } catch { /* ignore */ }
    throw new Error(msg)
  }
  return data?.data
}
