-- Коровосчёт v2.0: управление профилями, повтор состава и отмена исправлений
create table if not exists public.korova_change_log(id uuid primary key default gen_random_uuid(),room_id uuid not null references public.korova_rooms(id) on delete cascade,game_id uuid not null references public.korova_games(id) on delete cascade,round_id uuid references public.korova_rounds(id) on delete cascade,action text not null,before_scores jsonb,after_scores jsonb,undone boolean not null default false,created_at timestamptz not null default now());
alter table public.korova_change_log enable row level security; revoke all on public.korova_change_log from anon,authenticated;

create or replace function public.korova_update_profile(p_code text,p_player_id uuid,p_name text,p_emoji text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_game uuid;v_profile uuid;v_room uuid;
begin
 select r.id,g.id into v_room,v_game from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=korova_normalize_code(p_code);
 select profile_id into v_profile from korova_players where id=p_player_id and game_id=v_game;
 if v_profile is null then raise exception 'Игрок не найден'; end if;
 if nullif(trim(p_name),'') is null or nullif(p_emoji,'') is null then raise exception 'Заполните имя и значок'; end if;
 if exists(select 1 from korova_profiles where room_id=v_room and id<>v_profile and lower(trim(name))=lower(trim(p_name))) then raise exception 'Игрок с таким именем уже существует'; end if;
 update korova_profiles set name=left(trim(p_name),24),emoji=p_emoji,updated_at=now() where id=v_profile;
 update korova_players set name=left(trim(p_name),24),emoji=p_emoji where profile_id=v_profile;
 return korova_get_state(p_code);
end;$$;

create or replace function public.korova_delete_profile(p_code text,p_player_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_game uuid;v_profile uuid;
begin
 select g.id into v_game from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=korova_normalize_code(p_code);
 select profile_id into v_profile from korova_players where id=p_player_id and game_id=v_game;
 if v_profile is null then raise exception 'Игрок не найден'; end if;
 if exists(select 1 from korova_players p join korova_games g on g.id=p.game_id where p.profile_id=v_profile and g.status='archived') then raise exception 'У профиля есть история. Переименуйте его вместо удаления'; end if;
 delete from korova_players where profile_id=v_profile; delete from korova_profiles where id=v_profile;
 return korova_get_state(p_code);
end;$$;

create or replace function public.korova_repeat_last_roster(p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room uuid;v_game uuid;v_previous uuid;
begin
 select r.id,g.id into v_room,v_game from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=korova_normalize_code(p_code);
 if exists(select 1 from korova_rounds where game_id=v_game) or exists(select 1 from korova_players where game_id=v_game) then raise exception 'Повтор состава доступен для пустой новой игры'; end if;
 select id into v_previous from korova_games where room_id=v_room and status='archived' order by finished_at desc limit 1;
 if v_previous is null then raise exception 'Прошлая партия не найдена'; end if;
 insert into korova_players(game_id,profile_id,name,emoji,seat) select v_game,profile_id,name,emoji,seat from korova_players where game_id=v_previous order by seat limit 10;
 return korova_get_state(p_code);
end;$$;

create or replace function public.korova_update_round(p_code text,p_round_id uuid,p_scores jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room uuid;v_game uuid;v_players int;p record;v_score text;v_before jsonb;
begin
 select r.id,g.id into v_room,v_game from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=korova_normalize_code(p_code);
 if not exists(select 1 from korova_rounds where id=p_round_id and game_id=v_game) then raise exception 'Раунд не найден'; end if;
 select count(*) into v_players from korova_players where game_id=v_game;
 if (select count(*) from jsonb_object_keys(coalesce(p_scores,'{}'::jsonb)))<>v_players then raise exception 'Укажите очки каждого игрока'; end if;
 select coalesce(jsonb_object_agg(player_id::text,score),'{}'::jsonb) into v_before from korova_round_scores where round_id=p_round_id;
 for p in select id from korova_players where game_id=v_game loop v_score:=p_scores->>p.id::text;if v_score is null or v_score!~'^\d{1,3}$' or v_score::int>999 then raise exception 'Очки должны быть целым числом от 0 до 999';end if;update korova_round_scores set score=v_score::int where round_id=p_round_id and player_id=p.id;end loop;
 insert into korova_change_log(room_id,game_id,round_id,action,before_scores,after_scores) values(v_room,v_game,p_round_id,'update_round',v_before,p_scores);
 return korova_get_state(p_code);
end;$$;

create or replace function public.korova_undo_last_change(p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room uuid;v_game uuid;v_log korova_change_log%rowtype;p record;
begin
 select r.id,g.id into v_room,v_game from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=korova_normalize_code(p_code);
 select * into v_log from korova_change_log where room_id=v_room and game_id=v_game and action='update_round' and not undone order by created_at desc limit 1 for update;
 if v_log.id is null then raise exception 'Нет исправлений для отмены'; end if;
 for p in select key,value from jsonb_each_text(v_log.before_scores) loop update korova_round_scores set score=p.value::int where round_id=v_log.round_id and player_id=p.key::uuid;end loop;
 update korova_change_log set undone=true where id=v_log.id;
 return korova_get_state(p_code);
end;$$;

grant execute on function public.korova_update_profile(text,uuid,text,text),public.korova_delete_profile(text,uuid),public.korova_repeat_last_roster(text),public.korova_update_round(text,uuid,jsonb),public.korova_undo_last_change(text) to anon,authenticated;
