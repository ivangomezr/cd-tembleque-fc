-- pgTAP: MVP voted by everyone (migration 20261020000000_mvp_votacion_abierta.sql)
-- Run with:  npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(34);

-- ── Fixtures (as postgres) ──────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000aa01', null), ('00000000-0000-0000-0000-00000000aa02', null),
  ('00000000-0000-0000-0000-00000000aa03', null), ('00000000-0000-0000-0000-00000000aa04', null),
  ('00000000-0000-0000-0000-00000000aa05', null), ('00000000-0000-0000-0000-00000000aa06', null),
  ('00000000-0000-0000-0000-00000000aa07', null),
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local');
insert into public.temporadas (id, nombre, "año", activa) values (700, 'MVP test', extract(year from current_date)::int, false);
insert into public.equipos_liga (id, temporada_id, nombre, es_propio) values (710, 700, 'CD Tembleque FC', true), (711, 700, 'Rival M', false), (712, 700, 'Rival N', false), (713, 700, 'Rival O', false);
insert into public.jugadores (id, nombre, posicion, dorsal) values
  (701, 'Goleador', 'Delantero', 9), (702, 'Asistente', 'Centrocampista', 8), (703, 'Titular', 'Defensa', 2),
  (704, 'Suplente', 'Defensa', 15), (705, 'No convocado', 'Portero', 13);
-- 720: played today (voting open) · 721: played 5 days ago (closed) · 722: not played · 723: closed, tie
insert into public.partidos (id, temporada_id, jornada, fecha, hora, local, visitante, jugado, goles_local, goles_visitante, convocados) values
  (720, 700, 1, current_date, '00:00', 'CD Tembleque FC', 'Rival M', true, 1, 0, '[701, 702, 703, 704]'),
  (721, 700, 2, current_date - 5, '00:00', 'CD Tembleque FC', 'Rival N', true, 0, 0, '[701, 702, 703]'),
  (722, 700, 3, current_date + 7, '17:00', 'CD Tembleque FC', 'Rival O', false, 0, 0, '[701, 702]'),
  (723, 700, 4, current_date - 6, '00:00', 'Rival O', 'CD Tembleque FC', true, 0, 1, '[701, 702, 703]');
insert into public.estadisticas (jugador_id, partido_id, minutos, titular, goles, asistencias) values
  (701, 720, 90, false, 1, 0), (702, 720, 60, false, 0, 1), (703, 720, 90, false, 0, 0),
  (701, 723, 90, false, 1, 0), (703, 723, 90, false, 0, 0);
-- closed matches: votes cast while they were open
insert into public.mvp_votos (partido_id, user_id, votado_id, red_hash) values
  (721, '00000000-0000-0000-0000-00000000aa01', 702, 'h1'), (721, '00000000-0000-0000-0000-00000000aa02', 702, 'h1'),
  (721, '00000000-0000-0000-0000-00000000aa03', 703, 'h2'),
  (723, '00000000-0000-0000-0000-00000000aa01', 703, null), (723, '00000000-0000-0000-0000-00000000aa02', 701, null);
select public.asignar_rol('00000000-0000-0000-0000-0000000000a1', 'admin');

create function pg_temp.como(p_uid text, p_ip text default '1.1.1.1') returns void language sql as $$
  select set_config('request.jwt.claims', case when p_uid is null then '{"role":"anon"}'
           else json_build_object('sub', p_uid, 'role', 'authenticated', 'is_anonymous', true)::text end, true),
         set_config('request.headers', json_build_object('cf-connecting-ip', p_ip)::text, true)
$$;
grant execute on function pg_temp.como(text, text) to anon, authenticated;

-- ── Visitors without a session ──────────────────────────────────────────────
set local role anon;
select pg_temp.como(null);
select is((public.mvp_votacion(720)->>'abierta')::boolean, true, 'visitante: ve que la votación está abierta');
select ok((public.mvp_votacion(720)->>'cierra')::timestamptz > now(), 'visitante: ve cuándo cierra');
select throws_ok($$ select public.votar_mvp(720, 701) $$, '42501', null, 'visitante sin sesión: no puede votar directamente');
select throws_ok($$ select * from public.mvp_votos $$, '42501', null, 'visitante: no ve los votos individuales');

-- ── Anonymous sessions ──────────────────────────────────────────────────────
reset role; set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-00000000aa01');
select lives_ok($$ select public.votar_mvp(720, 703) $$, 'anónimo: vota a un convocado');
select is((public.mvp_votacion(720)->>'mi_voto')::int, 703, 'anónimo: ve su voto');
select lives_ok($$ select public.votar_mvp(720, 701) $$, 'anónimo: puede cambiar su voto');
select is((public.mvp_votacion(720)->>'total')::int, 1, 'un voto por sesión: cambiar no suma otro');
select is((public.mvp_votacion(720)->>'mi_voto')::int, 701, 'el cambio queda guardado');
select throws_ok($$ select public.votar_mvp(720, 705) $$, 'CD400', null, 'no se vota a un jugador no convocado');
select throws_ok($$ select public.votar_mvp(720, 999999) $$, 'CD400', null, 'no se vota a un jugador inexistente');
select throws_ok($$ select public.votar_mvp(722, 701) $$, 'CD400', null, 'no se vota en un partido sin jugar');
select throws_ok($$ select public.votar_mvp(721, 701) $$, 'CD400', null, 'no se vota cuando la votación ha cerrado');
select throws_ok($$ select public.votar_mvp(999999, 701) $$, 'CD400', null, 'no se vota en un partido inexistente');
select throws_ok($$ insert into public.mvp_votos (partido_id, user_id, votado_id) values (720, '00000000-0000-0000-0000-00000000aa01', 702) $$,
  '42501', null, 'nadie escribe en la tabla de votos directamente');
select throws_ok($$ update public.mvp_votos set votado_id = 702 $$, '42501', null, 'nadie modifica votos directamente');

-- Network cap: at most 5 sessions per network and match
select pg_temp.como('00000000-0000-0000-0000-00000000aa02', '9.9.9.9');  select lives_ok($$ select public.votar_mvp(720, 702) $$, 'red: voto 1');
select pg_temp.como('00000000-0000-0000-0000-00000000aa03', '9.9.9.9');  select lives_ok($$ select public.votar_mvp(720, 702) $$, 'red: voto 2');
select pg_temp.como('00000000-0000-0000-0000-00000000aa04', '9.9.9.9');  select lives_ok($$ select public.votar_mvp(720, 702) $$, 'red: voto 3');
select pg_temp.como('00000000-0000-0000-0000-00000000aa05', '9.9.9.9');  select lives_ok($$ select public.votar_mvp(720, 701) $$, 'red: voto 4');
select pg_temp.como('00000000-0000-0000-0000-00000000aa06', '9.9.9.9');  select lives_ok($$ select public.votar_mvp(720, 701) $$, 'red: voto 5');
select pg_temp.como('00000000-0000-0000-0000-00000000aa07', '9.9.9.9');
select throws_ok($$ select public.votar_mvp(720, 701) $$, 'CD400', null, 'red: el sexto voto desde la misma conexión se rechaza');
select pg_temp.como('00000000-0000-0000-0000-00000000aa07', '8.8.8.8');
select lives_ok($$ select public.votar_mvp(720, 701) $$, 'otra conexión: sí puede votar');
select pg_temp.como('00000000-0000-0000-0000-00000000aa06', '9.9.9.9');
select lives_ok($$ select public.votar_mvp(720, 703) $$, 'red: cambiar un voto existente no cuenta como voto nuevo');

select is((public.mvp_votacion(720)->>'total')::int, 7, 'total de votos');
select is((public.mvp_votacion(720)->'ranking'->0->>'jugador_id')::int, 701, 'ranking: el más votado primero');
select is(public.mvp_votacion(720)->>'mvp_jugador_id', null, 'con la votación abierta no hay MVP guardado');

-- ── Admin cannot pick the MVP by hand while voting is open ──────────────────
select pg_temp.como('00000000-0000-0000-0000-0000000000a1');
select throws_ok($$ update public.partidos set mvp_jugador_id = 702 where id = 720 $$, 'CD400', null, 'admin: no elige MVP durante la votación');

-- ── Closing ─────────────────────────────────────────────────────────────────
reset role; set local role anon;
select pg_temp.como(null);
select is((public.mvp_votacion(721)->>'mvp_jugador_id')::int, 702, 'al cerrar se guarda el más votado');
select is((public.mvp_votacion(721)->>'abierta')::boolean, false, 'votación cerrada');
select is((public.mvp_votacion(723)->>'mvp_jugador_id')::int, 701, 'empate: gana quien va primero en el orden (goles/asistencias, minutos)');
reset role;
select is((select count(*)::int from public.mvp_votos where partido_id = 721 and red_hash is not null), 0, 'al cerrar se borran las huellas de red');
select is(public.cerrar_votaciones_mvp() >= 0, true, 'la tarea programada se puede ejecutar varias veces');

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000a1');
select lives_ok($$ update public.partidos set mvp_jugador_id = 703 where id = 721 $$, 'admin: puede corregir el MVP cuando la votación ya cerró');

select * from finish();
rollback;
