-- pgTAP tests for roles and Row Level Security.
-- Run with the Supabase CLI:  npx supabase test db
-- (needs `npx supabase start`, which applies every migration to a local database)

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(27);

-- ── Fixtures (as postgres) ──────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'super@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'jugador-901@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'jugador-902@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'sinperfil@test.local');

insert into public.temporadas (id, nombre, "año", activa) values (900, 'Test', 2099, false);
insert into public.jugadores (id, nombre, posicion, dorsal) values
  (901, 'Uno', 'Portero', 1), (902, 'Dos', 'Defensa', 2), (903, 'Tres', 'Delantero', 9);
insert into public.partidos (id, temporada_id, jornada, fecha, local, visitante, jugado) values
  (910, 900, 1, '2099-01-01', 'A', 'B', true),
  (911, 900, 2, '2099-01-08', 'A', 'C', false);

select public.asignar_rol('00000000-0000-0000-0000-0000000000a1', 'admin');
select public.asignar_rol('00000000-0000-0000-0000-0000000000a2', 'superadmin');
select public.asignar_rol('00000000-0000-0000-0000-0000000000b1', 'jugador', 901);
select public.asignar_rol('00000000-0000-0000-0000-0000000000b2', 'jugador', 902);

create function pg_temp.como(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_uid is null then '{"role":"anon"}'
         else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true)
$$;

-- ── Visitors (anon) ─────────────────────────────────────────────────────────
set local role anon;
select pg_temp.como(null);

select ok((select count(*) from public.partidos where id in (910, 911)) = 2, 'visitante: lee partidos');
select ok((select count(*) from public.jugadores where id >= 901) = 3, 'visitante: lee la plantilla');
select throws_ok($$ insert into public.partidos (jornada, fecha, local, visitante) values (3, '2099-02-01', 'X', 'Y') $$,
  '42501', null, 'visitante: no puede crear partidos');
select is((select count(*)::int from public.perfiles), 0, 'visitante: no ve perfiles');
select is((select count(*)::int from public.activity_log), 0, 'visitante: no lee el log');
select throws_ok($$ select public.asignar_rol('00000000-0000-0000-0000-0000000000c1', 'superadmin') $$,
  '42501', null, 'visitante: no puede asignar roles');

-- ── Player ──────────────────────────────────────────────────────────────────
reset role;
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000b1');

select is(public.mi_rol()::text, 'jugador', 'jugador: mi_rol() = jugador');
select is(public.mi_jugador_id(), 901, 'jugador: vinculado a su ficha');
select is(public.is_admin(), false, 'jugador: no es admin');
select throws_ok($$ insert into public.partidos (jornada, fecha, local, visitante) values (3, '2099-02-01', 'X', 'Y') $$,
  '42501', null, 'jugador: no puede crear partidos');
select throws_ok($$ update public.perfiles set rol = 'superadmin' where user_id = auth.uid() $$,
  '42501', null, 'jugador: no puede ascenderse de rol');
select throws_ok($$ select public.asignar_rol(auth.uid(), 'superadmin') $$,
  '42501', null, 'jugador: no puede llamar a asignar_rol');
select lives_ok($$ insert into public.votos_mvp (partido_id, votante_id, votado_id) values (910, 901, 903) $$,
  'jugador: vota en un partido jugado');
select throws_ok($$ insert into public.votos_mvp (partido_id, votante_id, votado_id) values (910, 902, 903) $$,
  '42501', null, 'jugador: no puede votar en nombre de otro');
select throws_ok($$ insert into public.votos_mvp (partido_id, votante_id, votado_id) values (911, 901, 903) $$,
  '42501', null, 'jugador: no puede votar en un partido sin jugar');
select is((select count(*)::int from public.perfiles), 1, 'jugador: solo ve su propio perfil');

-- a player cannot delete someone else's vote (row is invisible → 0 rows affected)
reset role;
insert into public.votos_mvp (partido_id, votante_id, votado_id) values (910, 902, 901);
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000b1');
delete from public.votos_mvp where votante_id = 902;
reset role;
select is((select count(*)::int from public.votos_mvp where votante_id = 902), 1, 'jugador: no borra votos ajenos');

-- ── Authenticated user without profile ──────────────────────────────────────
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
select is(public.mi_rol(), null, 'sin perfil: no tiene rol');
select throws_ok($$ insert into public.jugadores (nombre, posicion, dorsal) values ('Intruso', 'Portero', 99) $$,
  '42501', null, 'sin perfil: no puede escribir');

-- ── Admin ───────────────────────────────────────────────────────────────────
reset role;
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000a1');

select lives_ok($$ insert into public.partidos (jornada, fecha, local, visitante, temporada_id) values (3, '2099-02-01', 'X', 'Y', 900) $$,
  'admin: crea partidos');
select lives_ok($$ update public.temporadas set zona_ascenso = 2 where id = 900 $$,
  'admin: edita la configuración de la temporada');
select throws_ok($$ update public.temporadas set activa = true where id = 900 $$,
  '42501', null, 'admin: no puede activar/cerrar temporadas');
select throws_ok($$ insert into public.temporadas (nombre, "año", activa) values ('Nueva', 2100, false) $$,
  '42501', null, 'admin: no puede crear temporadas');
insert into public.activity_log (accion, entidad, jugador_nombre, jugador_id) values ('test', 'Test', 'Suplantado', 903);
select is((select count(*)::int from public.activity_log), 0, 'admin: no lee el log (solo superadmin)');

-- ── Superadmin ──────────────────────────────────────────────────────────────
reset role;
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000a2');

select lives_ok($$ insert into public.temporadas (nombre, "año", activa) values ('Nueva', 2100, false) $$,
  'superadmin: crea temporadas');
select ok((select count(*) from public.activity_log where accion = 'test') = 1, 'superadmin: lee el log');
select is((select user_id::text from public.activity_log where accion = 'test'), '00000000-0000-0000-0000-0000000000a1',
  'log: el autor lo fija el servidor, no el cliente');

select * from finish();
rollback;
