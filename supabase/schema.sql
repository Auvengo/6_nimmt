-- Коровосчёт: схема Supabase
-- Запустите весь файл один раз в Supabase → SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.korova_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9]{4,10}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.korova_games (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.korova_rooms(id) on delete cascade,
  status text not null default 'active' check (status in ('active','archived')),
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create unique index if not exists korova_one_active_game on public.korova_games(room_id) where status = 'active';

create table if not exists public.korova_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.korova_games(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  emoji text not null default '🐮' check (char_length(emoji) between 1 and 16),
  seat int not null check (seat between 1 and 10),
  constraint korova_players_game_seat_unique unique(game_id, seat) deferrable initially immediate
);

create table if not exists public.korova_rounds (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.korova_games(id) on delete cascade,
  number int not null check (number > 0),
  created_at timestamptz not null default now(),
  unique(game_id, number)
);

create table if not exists public.korova_round_scores (
  round_id uuid not null references public.korova_rounds(id) on delete cascade,
  player_id uuid not null references public.korova_players(id) on delete cascade,
  score int not null check (score between 0 and 999),
  primary key(round_id, player_id)
);

alter table public.korova_rooms enable row level security;
alter table public.korova_games enable row level security;
alter table public.korova_players enable row level security;
alter table public.korova_rounds enable row level security;
alter table public.korova_round_scores enable row level security;

-- Прямой доступ к таблицам закрыт. Клиент работает только через функции ниже.
revoke all on public.korova_rooms, public.korova_games, public.korova_players, public.korova_rounds, public.korova_round_scores from anon, authenticated;

create or replace function public.korova_normalize_code(p_code text)
returns text language sql immutable as $$
  select upper(regexp_replace(coalesce(p_code,''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function public.korova_ensure_room(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := public.korova_normalize_code(p_code); v_room uuid; v_game uuid;
begin
  if char_length(v_code) < 4 or char_length(v_code) > 10 then raise exception 'Код комнаты должен содержать от 4 до 10 символов'; end if;
  insert into korova_rooms(code) values(v_code) on conflict(code) do update set code=excluded.code returning id into v_room;
  select id into v_game from korova_games where room_id=v_room and status='active';
  if v_game is null then insert into korova_games(room_id) values(v_room) returning id into v_game; end if;
  return jsonb_build_object('roomId',v_room,'gameId',v_game);
end; $$;

create or replace function public.korova_get_state(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := public.korova_normalize_code(p_code); v_room korova_rooms%rowtype; v_game korova_games%rowtype; v_current jsonb; v_archive jsonb;
begin
  perform public.korova_ensure_room(v_code);
  select * into v_room from korova_rooms where code=v_code;
  select * into v_game from korova_games where room_id=v_room.id and status='active';

  select jsonb_build_object(
    'id',v_game.id,'startedAt',v_game.started_at,
    'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'emoji',p.emoji,'seat',p.seat) order by p.seat) from korova_players p where p.game_id=v_game.id),'[]'::jsonb),
    'rounds',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'number',r.number,'createdAt',r.created_at,'scores',coalesce((select jsonb_object_agg(s.player_id::text,s.score) from korova_round_scores s where s.round_id=r.id),'{}'::jsonb)) order by r.number) from korova_rounds r where r.game_id=v_game.id),'[]'::jsonb)
  ) into v_current;

  select coalesce(jsonb_agg(item order by finished_at desc),'[]'::jsonb) into v_archive from (
    select g.finished_at, jsonb_build_object(
      'id',g.id,'startedAt',g.started_at,'finishedAt',g.finished_at,
      'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'emoji',p.emoji,'seat',p.seat) order by p.seat) from korova_players p where p.game_id=g.id),'[]'::jsonb),
      'rounds',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'number',r.number,'createdAt',r.created_at,'scores',coalesce((select jsonb_object_agg(s.player_id::text,s.score) from korova_round_scores s where s.round_id=r.id),'{}'::jsonb)) order by r.number) from korova_rounds r where r.game_id=g.id),'[]'::jsonb)
    ) item from korova_games g where g.room_id=v_room.id and g.status='archived'
  ) a;

  return jsonb_build_object('room',jsonb_build_object('code',v_room.code,'createdAt',v_room.created_at),'currentGame',v_current,'archive',v_archive);
end; $$;

create or replace function public.korova_add_player(p_code text,p_name text,p_emoji text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_game uuid; v_count int;
begin
  perform public.korova_ensure_room(p_code);
  select r.id,g.id into v_room,v_game from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=public.korova_normalize_code(p_code);
  if exists(select 1 from korova_rounds where game_id=v_game) then raise exception 'Игроков можно менять только до первого раунда'; end if;
  select count(*) into v_count from korova_players where game_id=v_game;
  if v_count>=10 then raise exception 'В игре уже 10 игроков'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Введите имя игрока'; end if;
  insert into korova_players(game_id,name,emoji,seat) values(v_game,left(trim(p_name),24),coalesce(nullif(p_emoji,''),'🐮'),v_count+1);
  return public.korova_get_state(p_code);
end; $$;

create or replace function public.korova_remove_player(p_code text,p_player_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_game uuid;
begin
  select g.id into v_game from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=public.korova_normalize_code(p_code);
  if exists(select 1 from korova_rounds where game_id=v_game) then raise exception 'Игроков можно менять только до первого раунда'; end if;
  delete from korova_players where id=p_player_id and game_id=v_game;
  set constraints korova_players_game_seat_unique deferred;
  with ordered as (select id,row_number() over(order by seat)::int n from korova_players where game_id=v_game) update korova_players p set seat=o.n from ordered o where p.id=o.id;
  return public.korova_get_state(p_code);
end; $$;

create or replace function public.korova_add_round(p_code text,p_scores jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_game uuid; v_round uuid; v_number int; v_players int; p record; v_score text;
begin
  select g.id into v_game from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=public.korova_normalize_code(p_code);
  select count(*) into v_players from korova_players where game_id=v_game;
  if v_players<2 then raise exception 'Добавьте минимум двух игроков'; end if;
  if jsonb_object_length(coalesce(p_scores,'{}'::jsonb))<>v_players then raise exception 'Укажите очки каждого игрока'; end if;
  select coalesce(max(number),0)+1 into v_number from korova_rounds where game_id=v_game;
  insert into korova_rounds(game_id,number) values(v_game,v_number) returning id into v_round;
  for p in select id from korova_players where game_id=v_game loop
    v_score:=p_scores->>p.id::text;
    if v_score is null or v_score !~ '^\d{1,3}$' or v_score::int>999 then raise exception 'Очки должны быть целым числом от 0 до 999'; end if;
    insert into korova_round_scores(round_id,player_id,score) values(v_round,p.id,v_score::int);
  end loop;
  return public.korova_get_state(p_code);
end; $$;

create or replace function public.korova_undo_last_round(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_game uuid; v_round uuid;
begin
  select g.id into v_game from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=public.korova_normalize_code(p_code);
  select id into v_round from korova_rounds where game_id=v_game order by number desc limit 1;
  if v_round is not null then delete from korova_rounds where id=v_round; end if;
  return public.korova_get_state(p_code);
end; $$;

create or replace function public.korova_new_game(p_code text,p_keep_players boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_old uuid; v_new uuid; v_has_rounds boolean;
begin
  select r.id,g.id into v_room,v_old from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=public.korova_normalize_code(p_code) for update of g;
  select exists(select 1 from korova_rounds where game_id=v_old) into v_has_rounds;
  if v_has_rounds then update korova_games set status='archived',finished_at=now() where id=v_old;
  else update korova_games set status='archived',finished_at=now() where id=v_old; end if;
  insert into korova_games(room_id) values(v_room) returning id into v_new;
  if coalesce(p_keep_players,true) then insert into korova_players(game_id,name,emoji,seat) select v_new,name,emoji,seat from korova_players where game_id=v_old order by seat; end if;
  -- Пустые партии не показываем в архиве.
  if not v_has_rounds then delete from korova_games where id=v_old; end if;
  return public.korova_get_state(p_code);
end; $$;

revoke all on function public.korova_normalize_code(text) from public;
grant execute on function public.korova_ensure_room(text), public.korova_get_state(text), public.korova_add_player(text,text,text), public.korova_remove_player(text,uuid), public.korova_add_round(text,jsonb), public.korova_undo_last_round(text), public.korova_new_game(text,boolean) to anon, authenticated;
