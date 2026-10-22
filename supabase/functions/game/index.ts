-- Neon RPS schema. Run once in Supabase SQL Editor (or `npx supabase db push`).
create table public.rooms (
  code text primary key,
  phase text not null default 'waiting' check (phase in ('waiting','playing','finished')),
  round int not null default 1,
  score1 int not null default 0,
  score2 int not null default 0,
  target int not null default 3,
  winner int check (winner in (1,2)),
  last_round jsonb,                       -- only filled AFTER both moves are in
  created_at timestamptz not null default now()
);
create table public.players (
  room_code text not null references public.rooms(code) on delete cascade,
  slot int not null check (slot in (1,2)),
  user_id uuid not null,
  name text not null check (char_length(name) between 1 and 20),
  has_moved boolean not null default false,   -- boolean only, never the move itself
  primary key (room_code, slot),
  unique (room_code, user_id)
);
-- Private: unrevealed moves live here. RLS on, NO policies, NO grants => unreachable from the browser.
create table public.moves (
  room_code text not null references public.rooms(code) on delete cascade,
  round int not null,
  slot int not null,
  move text not null check (move in ('rock','paper','scissors')),
  primary key (room_code, round, slot)
);

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.moves enable row level security;

create or replace function public.is_member(p_code text) returns boolean
language sql security definer stable set search_path = public as
$$ select exists (select 1 from players where room_code = p_code and user_id = auth.uid()) $$;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.rooms, public.players to authenticated;
revoke all on function public.is_member(text) from public, anon;
grant execute on function public.is_member(text) to authenticated;

create policy "members read room" on public.rooms for select to authenticated using (public.is_member(code));
create policy "members read players" on public.players for select to authenticated using (public.is_member(room_code));

alter publication supabase_realtime add table public.rooms, public.players;

-- ===== Game logic (callable ONLY by the Edge Function via service_role) =====
create or replace function public._reset(p_code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  delete from moves where room_code = p_code;
  update players set has_moved = false where room_code = p_code;
  update rooms set round = 1, score1 = 0, score2 = 0, winner = null, last_round = null,
    phase = case when (select count(*) from players where room_code = p_code) = 2 then 'playing' else 'waiting' end
  where code = p_code;
end $$;

create or replace function public.create_room(p_user uuid, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare c text;
begin
  delete from rooms where created_at < now() - interval '24 hours';
  loop
    c := (select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random()*32)::int, 1), '') from generate_series(1,5));
    begin insert into rooms(code) values (c); exit;
    exception when unique_violation then null; end;
  end loop;
  insert into players(room_code, slot, user_id, name) values (c, 1, p_user, p_name);
  return c;
end $$;

create or replace function public.join_room(p_user uuid, p_code text, p_name text) returns text
language plpgsql security definer set search_path = public as $$
declare r rooms; n int; s int;
begin
  select * into r from rooms where code = p_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if exists (select 1 from players where room_code = p_code and user_id = p_user) then
    update players set name = p_name where room_code = p_code and user_id = p_user;
    return p_code;
  end if;
  select count(*) into n from players where room_code = p_code;
  if n >= 2 then raise exception 'ROOM_FULL'; end if;
  s := case when exists (select 1 from players where room_code = p_code and slot = 1) then 2 else 1 end;
  insert into players(room_code, slot, user_id, name) values (p_code, s, p_user, p_name);
  perform _reset(p_code);
  return p_code;
end $$;

create or replace function public.submit_move(p_user uuid, p_code text, p_move text) returns void
language plpgsql security definer set search_path = public as $$
declare r rooms; me players; m1 text; m2 text; w int := 0; s1 int; s2 int;
begin
  if p_move not in ('rock','paper','scissors') then raise exception 'INVALID_MOVE'; end if;
  select * into r from rooms where code = p_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into me from players where room_code = p_code and user_id = p_user;
  if not found then raise exception 'NOT_A_MEMBER'; end if;
  if r.phase <> 'playing' then raise exception 'NOT_PLAYING'; end if;
  if me.has_moved then raise exception 'ALREADY_MOVED'; end if;

  insert into moves(room_code, round, slot, move) values (p_code, r.round, me.slot, p_move);
  update players set has_moved = true where room_code = p_code and slot = me.slot;

  select move into m1 from moves where room_code = p_code and round = r.round and slot = 1;
  select move into m2 from moves where room_code = p_code and round = r.round and slot = 2;
  if m1 is null or m2 is null then return; end if;   -- opponent hasn't moved: reveal nothing

  if m1 = m2 then w := 0;
  elsif (m1='rock' and m2='scissors') or (m1='scissors' and m2='paper') or (m1='paper' and m2='rock') then w := 1;
  else w := 2; end if;
  s1 := r.score1 + (w = 1)::int;
  s2 := r.score2 + (w = 2)::int;

  update rooms set score1 = s1, score2 = s2, round = round + 1,
    last_round = jsonb_build_object('round', r.round, 'moves', jsonb_build_object('1', m1, '2', m2), 'winner', w),
    phase = case when s1 >= target or s2 >= target then 'finished' else 'playing' end,
    winner = case when s1 >= target then 1 when s2 >= target then 2 else null end
  where code = p_code;
  update players set has_moved = false where room_code = p_code;
  delete from moves where room_code = p_code and round = r.round;
end $$;

create or replace function public.reset_room(p_user uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from rooms where code = p_code for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if not exists (select 1 from players where room_code = p_code and user_id = p_user) then raise exception 'NOT_A_MEMBER'; end if;
  perform _reset(p_code);
end $$;

create or replace function public.leave_room(p_user uuid, p_code text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform 1 from rooms where code = p_code for update;
  if not found then return; end if;
  delete from players where room_code = p_code and user_id = p_user;
  if not exists (select 1 from players where room_code = p_code) then delete from rooms where code = p_code;
  else perform _reset(p_code); end if;
end $$;

revoke all on function public._reset(text), public.create_room(uuid,text), public.join_room(uuid,text,text),
  public.submit_move(uuid,text,text), public.reset_room(uuid,text), public.leave_room(uuid,text)
  from public, anon, authenticated;
grant execute on function public._reset(text), public.create_room(uuid,text), public.join_room(uuid,text,text),
  public.submit_move(uuid,text,text), public.reset_room(uuid,text), public.leave_room(uuid,text) to service_role;
