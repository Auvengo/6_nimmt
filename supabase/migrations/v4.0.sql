-- Коровосчёт v4.0: управление архивом и объединение профилей
-- Запускать после миграций v3.0 и v3.1.

create or replace function public.korova_admin_delete_game(
  p_code text, p_token text, p_game_id uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_room uuid;
begin
  v_room := korova_admin_room(p_code,p_token);
  delete from korova_games
   where id=p_game_id and room_id=v_room and status='archived';
  if not found then raise exception 'Архивная партия не найдена'; end if;
  return korova_get_state(p_code);
end;$$;

create or replace function public.korova_admin_update_archived_game(
  p_code text, p_token text, p_game_id uuid, p_played_at timestamptz,
  p_profiles uuid[], p_rounds jsonb
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_room uuid;
begin
  v_room := korova_admin_room(p_code,p_token);
  if not exists(select 1 from korova_games where id=p_game_id and room_id=v_room and status='archived') then
    raise exception 'Архивная партия не найдена';
  end if;
  delete from korova_games where id=p_game_id and room_id=v_room;
  return korova_import_game(p_code,p_played_at,p_profiles,p_rounds);
end;$$;

create or replace function public.korova_admin_merge_profiles(
  p_code text, p_token text, p_keep_id uuid, p_remove_id uuid
) returns jsonb
language plpgsql security definer set search_path=public as $$
declare v_room uuid;
begin
  v_room := korova_admin_room(p_code,p_token);
  if p_keep_id=p_remove_id then raise exception 'Выберите разные профили'; end if;
  if not exists(select 1 from korova_profiles where id=p_keep_id and room_id=v_room)
     or not exists(select 1 from korova_profiles where id=p_remove_id and room_id=v_room) then
    raise exception 'Профиль не найден';
  end if;
  if exists(
    select 1 from korova_players a join korova_players b on a.game_id=b.game_id
     where a.profile_id=p_keep_id and b.profile_id=p_remove_id
  ) then
    raise exception 'Эти игроки встречаются в одной партии. Сначала исправьте такую партию';
  end if;
  update korova_players set profile_id=p_keep_id where profile_id=p_remove_id;
  delete from korova_profiles where id=p_remove_id and room_id=v_room;
  return korova_get_state(p_code);
end;$$;

grant execute on function public.korova_admin_delete_game(text,text,uuid),
  public.korova_admin_update_archived_game(text,text,uuid,timestamptz,uuid[],jsonb),
  public.korova_admin_merge_profiles(text,text,uuid,uuid)
to anon,authenticated;
