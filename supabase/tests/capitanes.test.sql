-- pgTAP: captains (migration 20261023000000_capitanes.sql)
-- Run with:  npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(15);

-- ── Fixtures (as postgres) ──────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000c1', 'admin-cap@test.local'),
  ('00000000-0000-0000-0000-0000000000c2', 'jugador-cap@test.local');
insert into public.temporadas (id, nombre, "año", activa) values (600, 'Capitanes test', extract(year from current_date)::int, false);
insert into public.equipos_liga (id, temporada_id, nombre, es_propio) values (610, 600, 'CD Tembleque FC', true), (611, 600, 'Rival C', false);
insert into public.jugadores (id, nombre, posicion, dorsal) values
  (601, 'Capi Uno', 'Defensa', 61), (602, 'Capi Dos', 'Centrocampista', 62), (603, 'Titular Tres', 'Delantero', 63), (604, 'Suplente Cuatro', 'Delantero', 64);
insert into public.partidos (id, temporada_id, jornada, fecha, hora, local, visitante, jugado, goles_local, goles_visitante, convocados) values
  (620, 600, 1, current_date - 20, '17:00', 'CD Tembleque FC', 'Rival C', false, 0, 0, '[601, 602, 603, 604]');
insert into public.alineaciones (partido_id, formacion, jugadores) values
  (620, '4-4-2', '[{"linea":0,"posicion":0,"jugador_id":601},{"linea":1,"posicion":0,"jugador_id":602},{"linea":3,"posicion":0,"jugador_id":603}]');
select public.asignar_rol('00000000-0000-0000-0000-0000000000c1', 'admin');
select public.asignar_rol('00000000-0000-0000-0000-0000000000c2', 'jugador');

create function pg_temp.como(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true)
$$;
grant execute on function pg_temp.como(text) to authenticated, anon;

-- ── Captaincy of the squad ──────────────────────────────────────────────────
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
select lives_ok($$ update public.jugadores set capitania = 1 where id = 601 $$, 'admin: marca primer capitán');
select lives_ok($$ update public.jugadores set capitania = 2 where id = 602 $$, 'admin: marca segundo capitán');
select throws_ok($$ update public.jugadores set capitania = 3 where id = 603 $$, '23514', null, 'solo primer o segundo capitán');
select lives_ok($$ update public.jugadores set capitania = null where id = 602 $$, 'admin: quita la capitanía');

select pg_temp.como('00000000-0000-0000-0000-0000000000c2');
update public.jugadores set capitania = 1 where id = 604;
reset role;
select is((select capitania from public.jugadores where id = 604), null, 'un jugador no puede hacerse capitán');

-- Visitors read the captaincy (public column)
set local role anon;
select pg_temp.como(null);
select is((select capitania from public.jugadores where id = 601), 1::smallint, 'visitante: lee la capitanía');
reset role; set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');

-- ── Captain of the match ────────────────────────────────────────────────────
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
select lives_ok($$ update public.partidos set capitan_id = 601 where id = 620 $$, 'capitán del partido: un titular que es capitán');
select lives_ok($$ update public.partidos set capitan_id = 603 where id = 620 $$, 'capitán del partido: cualquier titular, aunque no sea capitán');
select throws_ok($$ update public.partidos set capitan_id = 604 where id = 620 $$, 'CD400',
  'Suplente Cuatro no está en el once inicial: el capitán tiene que ser titular.', 'un suplente no puede llevar el brazalete');
select throws_ok($$ update public.partidos set capitan_id = 999999 where id = 620 $$, 'CD400', null, 'un jugador que no existe tampoco');

select pg_temp.como('00000000-0000-0000-0000-0000000000c2');
update public.partidos set capitan_id = 601 where id = 620;
reset role;
select is((select capitan_id from public.partidos where id = 620), 603, 'un jugador no puede cambiar el capitán');

-- Leaving the starting XI takes the armband away
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000c1');
select lives_ok($$ update public.alineaciones set jugadores = '[{"linea":0,"posicion":0,"jugador_id":601},{"linea":3,"posicion":0,"jugador_id":604}]' where partido_id = 620 $$,
  'cambiar la alineación sigue funcionando');
reset role;
select is((select capitan_id from public.partidos where id = 620), null, 'si el capitán sale del once, el partido se queda sin capitán');

update public.partidos set capitan_id = 601 where id = 620;
delete from public.alineaciones where partido_id = 620;
insert into public.alineaciones (partido_id, formacion, jugadores) values (620, '4-4-2', '[{"linea":0,"posicion":0,"jugador_id":601}]');
select is((select capitan_id from public.partidos where id = 620), 601, 'volver a guardar la alineación con el capitán lo mantiene');

-- Deleting the player clears the match captain
delete from public.alineaciones where partido_id = 620;
update public.partidos set convocados = '[602, 603, 604]', capitan_id = null where id = 620;
update public.partidos set capitan_id = null where id = 620;
delete from public.jugadores where id = 601;
select is((select count(*)::int from public.partidos where capitan_id = 601), 0, 'borrar el jugador quita el capitán del partido');

select * from finish();
rollback;
