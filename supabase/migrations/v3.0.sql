-- Коровосчёт v3.0: ручной импорт завершённых партий
create or replace function public.korova_import_game(p_code text,p_played_at timestamptz,p_profiles uuid[],p_rounds jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_room uuid;v_game uuid;v_round uuid;v_profile uuid;v_player uuid;v_score text;v_i int;v_j int;v_count int;
begin
 select id into v_room from korova_rooms where code=korova_normalize_code(p_code);
 if v_room is null then raise exception 'Комната не найдена';end if;
 v_count:=coalesce(array_length(p_profiles,1),0);
 if v_count<2 or v_count>10 then raise exception 'Выберите от 2 до 10 игроков';end if;
 if jsonb_typeof(p_rounds)<>'array' or jsonb_array_length(p_rounds)<1 then raise exception 'Добавьте хотя бы один раунд';end if;
 if exists(select 1 from unnest(p_profiles) x group by x having count(*)>1) then raise exception 'Игроки не должны повторяться';end if;
 if exists(select 1 from unnest(p_profiles) x where not exists(select 1 from korova_profiles pr where pr.id=x and pr.room_id=v_room)) then raise exception 'Один из профилей не найден';end if;
 insert into korova_games(room_id,status,started_at,finished_at) values(v_room,'archived',p_played_at,p_played_at) returning id into v_game;
 for v_i in 1..v_count loop
  v_profile:=p_profiles[v_i];
  insert into korova_players(game_id,profile_id,name,emoji,seat) select v_game,id,name,emoji,v_i from korova_profiles where id=v_profile returning id into v_player;
 end loop;
 for v_i in 0..jsonb_array_length(p_rounds)-1 loop
  insert into korova_rounds(game_id,number,created_at) values(v_game,v_i+1,p_played_at+(v_i||' minutes')::interval) returning id into v_round;
  for v_j in 1..v_count loop
   v_profile:=p_profiles[v_j];v_score:=p_rounds->v_i->>v_profile::text;
   if v_score is null or v_score!~'^\d+$' or v_score::int>999 then raise exception 'Заполните все результаты раунда %',v_i+1;end if;
   select id into v_player from korova_players where game_id=v_game and profile_id=v_profile;
   insert into korova_round_scores(round_id,player_id,score) values(v_round,v_player,v_score::int);
  end loop;
 end loop;
 return korova_get_state(p_code);
exception when others then if v_game is not null then delete from korova_games where id=v_game;end if;raise;
end;$$;
grant execute on function public.korova_import_game(text,timestamptz,uuid[],jsonb) to anon,authenticated;
