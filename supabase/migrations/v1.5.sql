-- Коровосчёт v1.5: постоянные профили игроков
-- Выполните файл целиком в Supabase SQL Editor.

create table if not exists public.korova_profiles (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.korova_rooms(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 24),
  emoji text not null default '🐮' check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists korova_profile_name_unique on public.korova_profiles(room_id, lower(trim(name)));
alter table public.korova_profiles enable row level security;
revoke all on public.korova_profiles from anon, authenticated;

alter table public.korova_players add column if not exists profile_id uuid references public.korova_profiles(id) on delete restrict;

-- Создаём постоянные профили для уже сыгравших людей, объединяя одинаковые имена.
insert into public.korova_profiles(room_id,name,emoji)
select x.room_id,x.name,x.emoji from (
  select distinct on (g.room_id,lower(trim(p.name))) g.room_id,p.name,p.emoji
  from public.korova_players p join public.korova_games g on g.id=p.game_id
  order by g.room_id,lower(trim(p.name)),g.started_at desc
) x
where not exists (
  select 1 from public.korova_profiles pr
  where pr.room_id=x.room_id and lower(trim(pr.name))=lower(trim(x.name))
);

update public.korova_players p set profile_id=pr.id
from public.korova_games g, public.korova_profiles pr
where p.game_id=g.id and pr.room_id=g.room_id
  and lower(trim(pr.name))=lower(trim(p.name)) and p.profile_id is null;

create unique index if not exists korova_one_profile_per_game
on public.korova_players(game_id,profile_id) where profile_id is not null;

create or replace function public.korova_get_state(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_code text := public.korova_normalize_code(p_code); v_room korova_rooms%rowtype; v_game korova_games%rowtype; v_current jsonb; v_archive jsonb; v_known jsonb;
begin
  perform public.korova_ensure_room(v_code);
  select * into v_room from korova_rooms where code=v_code;
  select * into v_game from korova_games where room_id=v_room.id and status='active';

  select jsonb_build_object(
    'id',v_game.id,'startedAt',v_game.started_at,
    'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'profileId',p.profile_id,'name',p.name,'emoji',p.emoji,'seat',p.seat) order by p.seat) from korova_players p where p.game_id=v_game.id),'[]'::jsonb),
    'rounds',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'number',r.number,'createdAt',r.created_at,'scores',coalesce((select jsonb_object_agg(s.player_id::text,s.score) from korova_round_scores s where s.round_id=r.id),'{}'::jsonb)) order by r.number) from korova_rounds r where r.game_id=v_game.id),'[]'::jsonb)
  ) into v_current;

  select coalesce(jsonb_agg(item order by finished_at desc),'[]'::jsonb) into v_archive from (
    select g.finished_at, jsonb_build_object(
      'id',g.id,'startedAt',g.started_at,'finishedAt',g.finished_at,
      'players',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'profileId',p.profile_id,'name',p.name,'emoji',p.emoji,'seat',p.seat) order by p.seat) from korova_players p where p.game_id=g.id),'[]'::jsonb),
      'rounds',coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'number',r.number,'createdAt',r.created_at,'scores',coalesce((select jsonb_object_agg(s.player_id::text,s.score) from korova_round_scores s where s.round_id=r.id),'{}'::jsonb)) order by r.number) from korova_rounds r where r.game_id=g.id),'[]'::jsonb)
    ) item from korova_games g where g.room_id=v_room.id and g.status='archived'
  ) a;

  select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'emoji',emoji) order by lower(name)),'[]'::jsonb)
  into v_known from korova_profiles where room_id=v_room.id;

  return jsonb_build_object('room',jsonb_build_object('code',v_room.code,'createdAt',v_room.created_at),'knownPlayers',v_known,'currentGame',v_current,'archive',v_archive);
end; $$;

create or replace function public.korova_add_player(p_code text,p_name text,p_emoji text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_game uuid; v_count int; v_profile uuid;
begin
  perform public.korova_ensure_room(p_code);
  select r.id,g.id into v_room,v_game from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=public.korova_normalize_code(p_code);
  if exists(select 1 from korova_rounds where game_id=v_game) then raise exception 'Игроков можно менять только до первого раунда'; end if;
  select count(*) into v_count from korova_players where game_id=v_game;
  if v_count>=10 then raise exception 'В игре уже 10 игроков'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Введите имя игрока'; end if;
  select id into v_profile from korova_profiles where room_id=v_room and lower(trim(name))=lower(trim(p_name));
  if v_profile is null then
    insert into korova_profiles(room_id,name,emoji) values(v_room,left(trim(p_name),24),coalesce(nullif(p_emoji,''),'🐮')) returning id into v_profile;
  end if;
  if exists(select 1 from korova_players where game_id=v_game and profile_id=v_profile) then raise exception 'Этот игрок уже участвует'; end if;
  insert into korova_players(game_id,profile_id,name,emoji,seat)
  select v_game,id,name,emoji,v_count+1 from korova_profiles where id=v_profile;
  return public.korova_get_state(p_code);
end; $$;

create or replace function public.korova_add_existing_player(p_code text,p_profile_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_game uuid; v_count int;
begin
  select r.id,g.id into v_room,v_game from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=public.korova_normalize_code(p_code);
  if exists(select 1 from korova_rounds where game_id=v_game) then raise exception 'Игроков можно менять только до первого раунда'; end if;
  select count(*) into v_count from korova_players where game_id=v_game;
  if v_count>=10 then raise exception 'В игре уже 10 игроков'; end if;
  if not exists(select 1 from korova_profiles where id=p_profile_id and room_id=v_room) then raise exception 'Игрок не найден'; end if;
  if exists(select 1 from korova_players where game_id=v_game and profile_id=p_profile_id) then raise exception 'Этот игрок уже участвует'; end if;
  insert into korova_players(game_id,profile_id,name,emoji,seat)
  select v_game,id,name,emoji,v_count+1 from korova_profiles where id=p_profile_id;
  return public.korova_get_state(p_code);
end; $$;

create or replace function public.korova_update_player_icon(p_code text,p_player_id uuid,p_emoji text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_game uuid; v_profile uuid;
begin
  if nullif(p_emoji,'') is null then raise exception 'Выберите значок'; end if;
  select g.id into v_game from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=public.korova_normalize_code(p_code);
  select profile_id into v_profile from korova_players where id=p_player_id and game_id=v_game;
  if v_profile is null then raise exception 'Игрок не найден'; end if;
  update korova_profiles set emoji=p_emoji,updated_at=now() where id=v_profile;
  update korova_players set emoji=p_emoji where profile_id=v_profile;
  return public.korova_get_state(p_code);
end; $$;

create or replace function public.korova_new_game(p_code text,p_keep_players boolean default true)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_room uuid; v_old uuid; v_new uuid; v_has_rounds boolean;
begin
  select r.id,g.id into v_room,v_old from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=public.korova_normalize_code(p_code) for update of g;
  select exists(select 1 from korova_rounds where game_id=v_old) into v_has_rounds;
  update korova_games set status='archived',finished_at=now() where id=v_old;
  insert into korova_games(room_id) values(v_room) returning id into v_new;
  if coalesce(p_keep_players,true) then
    insert into korova_players(game_id,profile_id,name,emoji,seat) select v_new,profile_id,name,emoji,seat from korova_players where game_id=v_old order by seat;
  end if;
  if not v_has_rounds then delete from korova_games where id=v_old; end if;
  return public.korova_get_state(p_code);
end; $$;

grant execute on function public.korova_get_state(text), public.korova_add_player(text,text,text), public.korova_add_existing_player(text,uuid), public.korova_update_player_icon(text,uuid,text), public.korova_new_game(text,boolean) to anon, authenticated;
