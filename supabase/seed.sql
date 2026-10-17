-- Minimal seed: the active season and our club as a league team.
-- Run once on a fresh project (Supabase › SQL Editor) or via `supabase db reset`.
insert into public.temporadas (nombre, "año", activa, zona_ascenso, zona_promocion, zona_descenso)
values ('Segunda Autonómica 2026/27', 2026, true, 1, 1, 0);

insert into public.equipos_liga (temporada_id, nombre, nombre_corto, escudo_url, es_propio)
select id, 'CD Tembleque FC', 'Tembleque', '/escudo.png', true from public.temporadas where activa;

-- Accounts and roles are created with scripts/auth-admin.mjs (see docs/auth.md), e.g.
--   node scripts/auth-admin.mjs user you@example.com --role superadmin --generate
-- or, for a user created in Dashboard › Authentication › Add user:
--   select asignar_rol_por_email('you@example.com', 'superadmin');
