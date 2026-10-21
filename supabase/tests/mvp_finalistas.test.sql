-- pgTAP: MVP candidates chosen by a superadmin (migration 20261022000000_mvp_finalistas.sql)
-- Run with:  npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

-- ── Fixtures (as postgres) ──────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000b1', 'super@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000bb01', null);
insert into public.temporadas (id, nombre, "año", activa) values (800, 'Finalistas test', extract(year from current_date)::int, false);
insert into public.equipos_liga (id, temporada_id, nombre, es_propio) values (810, 800, 'CD Tembleque FC', true), (811, 800, 'Rival F', false), (812, 800, 'Rival G', false), (813, 800, 'Rival H', false);
insert into public.jugadores (id, nombre, posicion, dorsal) values
  (801, 'Uno', 'Portero', 1), (802, 'Dos', 'Defensa', 2), (803, 'Tres', 'Defensa', 3), (804, 'Cuatro', 'Centrocampista', 4),
  (805, 'Cinco', 'Centrocampista', 5), (806, 'Seis', 'Delantero', 6), (807, 'Siete', 'Delantero', 7), (808, 'Fuera', 'Defensa', 8);
-- 820: today, 7 called up, not played yet · 821: today, 3 called up · 822: today, no call-up · 823: two weeks ago (vote long closed)
insert into public.partidos (id, temporada_id, jornada, fecha, hora, local, visitante, jugado, goles_local, goles_visitante, convocados) values
  (820, 800, 1, current_date, '00:00', 'CD Tembleque FC', 'Rival F', false, 0, 0, '[801, 802, 803, 804, 805, 806, 807]'),
  (821, 800, 2, current_date, '00:00', 'Rival G', 'CD Tembleque FC', false, 0, 0, '[801, 802, 803]'),
  (822, 800, 3, current_date, '00:00', 'CD Tembleque FC', 'Rival H', false, 0, 0, '[]'),
  (823, 800, 4, current_date - 14, '00:00', 'CD Tembleque FC', 'Rival H', false, 0, 0, '[]');
select public.asignar_rol('00000000-0000-0000-0000-0000000000b1', 'superadmin');
select public.asignar_rol('00000000-0000-0000-0000-0000000000b2', 'admin');

create function pg_temp.como(p_uid text, p_anon boolean default false) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'is_anonymous', p_anon)::text, true),
         set_config('request.headers', '{"cf-connecting-ip":"1.2.3.4"}', true)
$$;
grant execute on function pg_temp.como(text, boolean) to authenticated;

set local role authenticated;

-- ── An admin can't choose them nor mark the match as played without them ────
select pg_temp.como('00000000-0000-0000-0000-0000000000b2');
select throws_ok($$ update public.partidos set mvp_finalistas = '[801, 802, 803, 804, 805]' where id = 820 $$,
  'CD400', 'Solo un superadmin puede elegir los candidatos al MVP.', 'admin: no elige candidatos');
select throws_ok($$ update public.partidos set jugado = true where id = 820 $$,
  'CD400', 'Elige los 5 candidatos al MVP antes de marcar el partido como jugado.', 'admin: no marca como jugado sin candidatos');
select throws_ok($$ update public.partidos set jugado = true where id = 822 $$,
  'CD400', 'Antes de marcar el partido como jugado, haz la convocatoria y elige los candidatos al MVP.', 'sin convocatoria no se marca como jugado');
select lives_ok($$ update public.partidos set jugado = true where id = 823 $$, 'un partido antiguo (votación ya cerrada) se marca sin candidatos');

-- ── Superadmin ──────────────────────────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ update public.partidos set jugado = true where id = 820 $$,
  'CD400', null, 'superadmin: tampoco marca como jugado sin candidatos');
select throws_ok($$ update public.partidos set jugado = true, mvp_finalistas = '[801, 802, 803, 804]' where id = 820 $$,
  'CD400', 'Elige 5 candidatos al MVP (has elegido 4).', 'hacen falta exactamente 5');
select throws_ok($$ update public.partidos set jugado = true, mvp_finalistas = '[801, 802, 803, 804, 805, 806]' where id = 820 $$,
  'CD400', null, 'no más de 5');
select throws_ok($$ update public.partidos set jugado = true, mvp_finalistas = '[801, 802, 803, 804, 808]' where id = 820 $$,
  'CD400', 'Fuera es candidato al MVP y tiene que estar convocado.', 'solo convocados');
select throws_ok($$ update public.partidos set jugado = true, mvp_finalistas = '[801, 801, 803, 804, 805]' where id = 820 $$,
  'CD400', null, 'sin repetidos');
select throws_ok($$ update public.partidos set jugado = true, mvp_finalistas = '[801, 802, 803, 804, "x"]' where id = 820 $$,
  'CD400', null, 'solo identificadores válidos');
select lives_ok($$ update public.partidos set jugado = true, mvp_finalistas = '[807, 806, 805, 804, 803]' where id = 820 $$,
  'superadmin: elige 5 y marca el partido como jugado');
select lives_ok($$ update public.partidos set jugado = true, mvp_finalistas = '[801, 802, 803]' where id = 821 $$,
  'con menos de 5 convocados, todos son candidatos');
select lives_ok($$ update public.partidos set mvp_finalistas = '[801, 802, 803, 804, 805]' where id = 820 $$,
  'superadmin: los cambia mientras nadie ha votado');
select throws_ok($$ update public.partidos set convocados = '[801, 802, 803, 804, 806, 807]' where id = 820 $$,
  'CD400', 'Cinco es candidato al MVP y tiene que estar convocado.', 'no se quita de la convocatoria a un candidato');
select lives_ok($$ update public.partidos set convocados = convocados || '[808]' where id = 820 $$,
  'ampliar la convocatoria no obliga a cambiar los candidatos');

-- ── Voting only among the candidates ────────────────────────────────────────
select pg_temp.como('00000000-0000-0000-0000-00000000bb01', true);
select throws_ok($$ select public.votar_mvp(820, 807) $$, 'CD400', null, 'no se vota a un convocado que no es candidato');
select lives_ok($$ select public.votar_mvp(820, 803) $$, 'se vota a un candidato');
select is((select array_agg(jugador_id order by jugador_id) from validacion.mvp_candidatos(820)),
  array[801, 802, 803, 804, 805], 'los candidatos son los elegidos');

select pg_temp.como('00000000-0000-0000-0000-0000000000b1');
select throws_ok($$ update public.partidos set mvp_finalistas = '[801, 802, 803, 804, 806]' where id = 820 $$,
  'CD400', 'Ya hay votos en este partido: los candidatos al MVP no se pueden cambiar.', 'con votos ya no se cambian');
select lives_ok($$ update public.partidos set goles_local = 2 where id = 820 $$, 'corregir el resultado sigue siendo posible');

-- ── Deleting a player ───────────────────────────────────────────────────────
reset role;
delete from public.mvp_votos where partido_id = 821;
delete from public.jugadores where id = 802;
select is((select mvp_finalistas from public.partidos where id = 821), '[801, 803]'::jsonb, 'borrar un jugador lo quita de los candidatos');

-- ── Matches from before this change keep the whole call-up ──────────────────
select is((select count(*)::int from validacion.mvp_candidatos(823)), 0, 'partido antiguo sin convocatoria ni minutos: sin candidatos');

select * from finish();
rollback;
