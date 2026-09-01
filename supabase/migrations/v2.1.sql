-- Коровосчёт v2.1: совместный ввод очков раунда
create table if not exists public.korova_round_drafts (
  game_id uuid not null references public.korova_games(id) on delete cascade,
  player_id uuid not null references public.korova_players(id) on delete cascade,
  score int not null check(score between 0 and 999),
  updated_at timestamptz not null default now(),
  primary key(game_id,player_id)
);
alter table public.korova_round_drafts enable row level security;
revoke all on public.korova_round_drafts from anon,authenticated;

create or replace function public.korova_get_draft_scores(p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_game uuid;v_scores jsonb;
begin
 select g.id into v_game from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=korova_normalize_code(p_code);
 select coalesce(jsonb_object_agg(player_id::text,score),'{}'::jsonb) into v_scores from korova_round_drafts where game_id=v_game;
 return v_scores;
end;$$;

create or replace function public.korova_set_draft_score(p_code text,p_player_id uuid,p_score int)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_game uuid;
begin
 select g.id into v_game from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=korova_normalize_code(p_code);
 if not exists(select 1 from korova_players where id=p_player_id and game_id=v_game) then raise exception 'Игрок не найден';end if;
 if p_score<0 or p_score>999 then raise exception 'Очки должны быть от 0 до 999';end if;
 insert into korova_round_drafts(game_id,player_id,score,updated_at) values(v_game,p_player_id,p_score,now()) on conflict(game_id,player_id) do update set score=excluded.score,updated_at=now();
 return korova_get_draft_scores(p_code);
end;$$;

create or replace function public.korova_finalize_round(p_code text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_game uuid;v_round uuid;v_number int;v_players int;v_ready int;
begin
 select g.id into v_game from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=korova_normalize_code(p_code) for update of g;
 select count(*) into v_players from korova_players where game_id=v_game;
 select count(*) into v_ready from korova_round_drafts where game_id=v_game;
 if v_players<2 then raise exception 'Добавьте минимум двух игроков';end if;
 if v_ready<>v_players then raise exception 'Сначала каждый игрок должен внести свои очки';end if;
 select coalesce(max(number),0)+1 into v_number from korova_rounds where game_id=v_game;
 insert into korova_rounds(game_id,number) values(v_game,v_number) returning id into v_round;
 insert into korova_round_scores(round_id,player_id,score) select v_round,player_id,score from korova_round_drafts where game_id=v_game;
 delete from korova_round_drafts where game_id=v_game;
 return korova_get_state(p_code);
end;$$;

grant execute on function public.korova_get_draft_scores(text),public.korova_set_draft_score(text,uuid,int),public.korova_finalize_round(text) to anon,authenticated;
