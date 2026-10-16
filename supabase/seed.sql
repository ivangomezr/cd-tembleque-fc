-- Minimal seed: the active season and our club as a league team.
-- Run once on a fresh project (Supabase › SQL Editor) or via `supabase db reset`.
insert into public.temporadas (nombre, "año", activa, zona_ascenso, zona_promocion, zona_descenso)
values ('Segunda Autonómica 2026/27', 2026, true, 1, 1, 0);

insert into public.equipos_liga (temporada_id, nombre, nombre_corto, escudo_url, es_propio)
select id, 'CD Tembleque FC', 'Tembleque', '/escudo.png', true from public.temporadas where activa;

-- Example: set a player's personal password (run from the SQL editor, never from the app)
-- select asignar_clave_jugador(1, 'a-strong-password');
