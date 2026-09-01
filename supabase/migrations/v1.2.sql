-- Коровосчёт v1.2: редактирование результатов раунда
create or replace function public.korova_update_round(p_code text,p_round_id uuid,p_scores jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_game uuid; v_players int; p record; v_score text;
begin
  select g.id into v_game from korova_rooms r join korova_games g on g.room_id=r.id and g.status='active' where r.code=public.korova_normalize_code(p_code);
  if not exists(select 1 from korova_rounds where id=p_round_id and game_id=v_game) then raise exception 'Раунд не найден'; end if;
  select count(*) into v_players from korova_players where game_id=v_game;
  if jsonb_object_length(coalesce(p_scores,'{}'::jsonb))<>v_players then raise exception 'Укажите очки каждого игрока'; end if;
  for p in select id from korova_players where game_id=v_game loop
    v_score:=p_scores->>p.id::text;
    if v_score is null or v_score !~ '^\d{1,3}$' or v_score::int>999 then raise exception 'Очки должны быть целым числом от 0 до 999'; end if;
    update korova_round_scores set score=v_score::int where round_id=p_round_id and player_id=p.id;
  end loop;
  return public.korova_get_state(p_code);
end; $$;
grant execute on function public.korova_update_round(text,uuid,jsonb) to anon, authenticated;
