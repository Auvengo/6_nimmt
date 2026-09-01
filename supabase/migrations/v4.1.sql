-- Коровосчёт v4.1: игровые действия доступны всем участникам комнаты
-- PIN остаётся для переименования профилей, объединения дублей и удаления архивных партий.
grant execute on function public.korova_add_player(text,text,text) to anon,authenticated;
grant execute on function public.korova_add_existing_player(text,uuid) to anon,authenticated;
grant execute on function public.korova_remove_player(text,uuid) to anon,authenticated;
grant execute on function public.korova_update_player_icon(text,uuid,text) to anon,authenticated;
grant execute on function public.korova_finalize_round(text) to anon,authenticated;
grant execute on function public.korova_update_round(text,uuid,jsonb) to anon,authenticated;
grant execute on function public.korova_undo_last_round(text) to anon,authenticated;
grant execute on function public.korova_new_game(text,boolean) to anon,authenticated;
grant execute on function public.korova_import_game(text,timestamptz,uuid[],jsonb) to anon,authenticated;
