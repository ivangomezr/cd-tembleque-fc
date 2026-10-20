-- pgTAP: exact permission matrix for visitors, players, admins and superadmins.
-- Covers every table (insert/update/delete), private columns, the secret MVP ballot,
-- vote rules, GRANTs, RPC exposure, RLS coverage, views and storage policies.
-- Run with:  npx supabase test db     (see docs/database-security.md)

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(198);

-- ── Fixtures (as postgres) ──────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'super@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'jugador-901@test.local'),
  ('00000000-0000-0000-0000-0000000000b2', 'jugador-902@test.local'),
  ('00000000-0000-0000-0000-0000000000c1', 'sinperfil@test.local');
insert into public.temporadas (id, nombre, "año", activa) values (900, 'Test', 2020, false);
insert into public.jugadores (id, nombre, posicion, dorsal) values
  (901, 'Uno', 'Portero', 1), (902, 'Dos', 'Defensa', 2), (903, 'Tres', 'Delantero', 9);
insert into public.jugadores_privado (jugador_id, estado_desc) values (901, 'Lesión de rodilla');
insert into public.equipos_liga (id, temporada_id, nombre) values (920, 900, 'A'), (921, 900, 'B');
insert into public.partidos_liga (id, temporada_id, jornada, local_id, visitante_id) values (930, 900, 5, 920, 921);
insert into public.partidos (id, temporada_id, jornada, fecha, local, visitante, jugado, convocados) values
  (910, 900, 1, '2020-01-01', 'A', 'B', true, '[901, 902]'),
  (911, 900, 2, '2020-01-08', 'A', 'C', false, '[]');
insert into public.alineaciones (partido_id, formacion) values (910, '4-4-2');
insert into public.eventos_partido (id, partido_id, minuto, tipo, equipo) values (940, 910, 10, 'gol', 'rival');
insert into public.estadisticas (id, jugador_id, partido_id, minutos) values (950, 901, 910, 90);
insert into public.patrocinadores (id, nombre) values (960, 'Sponsor');
insert into public.activity_log (id, accion, entidad) values (970, 'fixture', 'Test');
insert into public.votos_mvp (partido_id, votante_id, votado_id) values (910, 902, 901);

select public.asignar_rol('00000000-0000-0000-0000-0000000000a1', 'admin');
select public.asignar_rol('00000000-0000-0000-0000-0000000000a2', 'superadmin');
select public.asignar_rol('00000000-0000-0000-0000-0000000000b1', 'jugador', 901);
select public.asignar_rol('00000000-0000-0000-0000-0000000000b2', 'jugador', 902);

create function pg_temp.como(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_uid is null then '{"role":"anon"}'
         else json_build_object('sub', p_uid, 'role', 'authenticated')::text end, true)
$$;
-- Rows affected by a statement; 0 when the caller lacks the privilege.
create function pg_temp.filas(p_sql text) returns int language plpgsql as $$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
exception when insufficient_privilege then
  return 0;
end $$;
create function pg_temp.sin_buckets_publicos() returns boolean language plpgsql as $$
declare n int;
begin
  if to_regclass('storage.buckets') is null then return true; end if;
  execute 'select count(*) from storage.buckets where public' into n;
  return n = 0;
end $$;
grant execute on function pg_temp.como(text), pg_temp.filas(text) to anon, authenticated;

-- ═══ Write matrix ═══════════════════════════════════════════════════════════

-- ── anon ──────────────────────────────────────────────────────
reset role;
set local role anon;
select pg_temp.como(null);
select throws_ok($q$insert into public.jugadores (nombre, posicion, dorsal) values ('Matrix', 'Portero', 50)$q$, '42501', null, 'anon: NO inserta en jugadores');
select is(pg_temp.filas($q$update public.jugadores set dorsal = dorsal where id = 901$q$), 0, 'anon: NO actualiza jugadores');
select is(pg_temp.filas($q$delete from public.jugadores where nombre = 'Matrix'$q$), 0, 'anon: NO borra en jugadores');
select throws_ok($q$insert into public.equipos_liga (temporada_id, nombre) values (900, 'Matrix FC')$q$, '42501', null, 'anon: NO inserta en equipos_liga');
select is(pg_temp.filas($q$update public.equipos_liga set nombre = nombre where id = 920$q$), 0, 'anon: NO actualiza equipos_liga');
select is(pg_temp.filas($q$delete from public.equipos_liga where nombre = 'Matrix FC'$q$), 0, 'anon: NO borra en equipos_liga');
select throws_ok($q$insert into public.partidos_liga (temporada_id, jornada, local_id, visitante_id) values (900, 9, 921, 920)$q$, '42501', null, 'anon: NO inserta en partidos_liga');
select is(pg_temp.filas($q$update public.partidos_liga set jornada = jornada where id = 930$q$), 0, 'anon: NO actualiza partidos_liga');
select is(pg_temp.filas($q$delete from public.partidos_liga where jornada = 9$q$), 0, 'anon: NO borra en partidos_liga');
select throws_ok($q$insert into public.partidos (temporada_id, jornada, fecha, local, visitante) values (900, 9, '2020-03-01', 'Matrix', 'B')$q$, '42501', null, 'anon: NO inserta en partidos');
select is(pg_temp.filas($q$update public.partidos set campo = campo where id = 910$q$), 0, 'anon: NO actualiza partidos');
select is(pg_temp.filas($q$delete from public.partidos where local = 'Matrix'$q$), 0, 'anon: NO borra en partidos');
select throws_ok($q$insert into public.alineaciones (partido_id) values (911)$q$, '42501', null, 'anon: NO inserta en alineaciones');
select is(pg_temp.filas($q$update public.alineaciones set formacion = formacion where partido_id = 910$q$), 0, 'anon: NO actualiza alineaciones');
select is(pg_temp.filas($q$delete from public.alineaciones where partido_id = 911$q$), 0, 'anon: NO borra en alineaciones');
select throws_ok($q$insert into public.eventos_partido (partido_id, minuto, tipo, equipo) values (910, 77, 'amarilla', 'rival')$q$, '42501', null, 'anon: NO inserta en eventos_partido');
select is(pg_temp.filas($q$update public.eventos_partido set minuto = minuto where id = 940$q$), 0, 'anon: NO actualiza eventos_partido');
select is(pg_temp.filas($q$delete from public.eventos_partido where minuto = 77$q$), 0, 'anon: NO borra en eventos_partido');
select throws_ok($q$insert into public.estadisticas (jugador_id, partido_id) values (903, 911)$q$, '42501', null, 'anon: NO inserta en estadisticas');
select is(pg_temp.filas($q$update public.estadisticas set goles = goles where id = 950$q$), 0, 'anon: NO actualiza estadisticas');
select is(pg_temp.filas($q$delete from public.estadisticas where partido_id = 911$q$), 0, 'anon: NO borra en estadisticas');
select throws_ok($q$insert into public.patrocinadores (nombre) values ('Matrix SL')$q$, '42501', null, 'anon: NO inserta en patrocinadores');
select is(pg_temp.filas($q$update public.patrocinadores set nombre = nombre where id = 960$q$), 0, 'anon: NO actualiza patrocinadores');
select is(pg_temp.filas($q$delete from public.patrocinadores where nombre = 'Matrix SL'$q$), 0, 'anon: NO borra en patrocinadores');
select throws_ok($q$insert into public.jugadores_privado (jugador_id, estado_desc) values (903, 'Matrix')$q$, '42501', null, 'anon: NO inserta en jugadores_privado');
select is(pg_temp.filas($q$update public.jugadores_privado set estado_desc = estado_desc where jugador_id = 901$q$), 0, 'anon: NO actualiza jugadores_privado');
select is(pg_temp.filas($q$delete from public.jugadores_privado where jugador_id = 903$q$), 0, 'anon: NO borra en jugadores_privado');
select throws_ok($q$insert into public.temporadas (nombre, "año", activa) values ('Matrix', 2030, false)$q$, '42501', null, 'anon: NO inserta en temporadas');
select is(pg_temp.filas($q$update public.temporadas set zona_ascenso = zona_ascenso where id = 900$q$), 0, 'anon: NO actualiza temporadas');
select is(pg_temp.filas($q$delete from public.temporadas where nombre = 'Matrix'$q$), 0, 'anon: NO borra en temporadas');
select throws_ok($q$insert into public.perfiles (user_id, rol) values ('00000000-0000-0000-0000-0000000000c1', 'superadmin')$q$, '42501', null, 'anon: NO inserta en perfiles');
select is(pg_temp.filas($q$update public.perfiles set rol = 'superadmin' where user_id = '00000000-0000-0000-0000-0000000000b1'$q$), 0, 'anon: NO actualiza perfiles');
select is(pg_temp.filas($q$delete from public.perfiles where user_id = '00000000-0000-0000-0000-0000000000b2'$q$), 0, 'anon: NO borra en perfiles');
select is(pg_temp.filas($q$update public.activity_log set accion = 'x' where id = 970$q$), 0, 'anon: NO actualiza activity_log');
select is(pg_temp.filas($q$delete from public.activity_log where id = 970$q$), 0, 'anon: NO borra en activity_log');
select throws_ok($q$insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://x', 'k', 'a')$q$, '42501', null, 'anon: NO inserta en push_subscriptions');
select is(pg_temp.filas($q$update public.push_subscriptions set auth = auth$q$), 0, 'anon: NO actualiza push_subscriptions');
select is(pg_temp.filas($q$delete from public.push_subscriptions$q$), 0, 'anon: NO borra en push_subscriptions');
select throws_ok($q$insert into public.claves_jugadores (jugador_id, clave_hash) values (903, 'x')$q$, '42501', null, 'anon: NO inserta en claves_jugadores');
select is(pg_temp.filas($q$update public.claves_jugadores set clave_hash = clave_hash$q$), 0, 'anon: NO actualiza claves_jugadores');
select is(pg_temp.filas($q$delete from public.claves_jugadores$q$), 0, 'anon: NO borra en claves_jugadores');

-- ── jugador ──────────────────────────────────────────────────────
reset role;
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000b1');
select throws_ok($q$insert into public.jugadores (nombre, posicion, dorsal) values ('Matrix', 'Portero', 50)$q$, '42501', null, 'jugador: NO inserta en jugadores');
select is(pg_temp.filas($q$update public.jugadores set dorsal = dorsal where id = 901$q$), 0, 'jugador: NO actualiza jugadores');
select is(pg_temp.filas($q$delete from public.jugadores where nombre = 'Matrix'$q$), 0, 'jugador: NO borra en jugadores');
select throws_ok($q$insert into public.equipos_liga (temporada_id, nombre) values (900, 'Matrix FC')$q$, '42501', null, 'jugador: NO inserta en equipos_liga');
select is(pg_temp.filas($q$update public.equipos_liga set nombre = nombre where id = 920$q$), 0, 'jugador: NO actualiza equipos_liga');
select is(pg_temp.filas($q$delete from public.equipos_liga where nombre = 'Matrix FC'$q$), 0, 'jugador: NO borra en equipos_liga');
select throws_ok($q$insert into public.partidos_liga (temporada_id, jornada, local_id, visitante_id) values (900, 9, 921, 920)$q$, '42501', null, 'jugador: NO inserta en partidos_liga');
select is(pg_temp.filas($q$update public.partidos_liga set jornada = jornada where id = 930$q$), 0, 'jugador: NO actualiza partidos_liga');
select is(pg_temp.filas($q$delete from public.partidos_liga where jornada = 9$q$), 0, 'jugador: NO borra en partidos_liga');
select throws_ok($q$insert into public.partidos (temporada_id, jornada, fecha, local, visitante) values (900, 9, '2020-03-01', 'Matrix', 'B')$q$, '42501', null, 'jugador: NO inserta en partidos');
select is(pg_temp.filas($q$update public.partidos set campo = campo where id = 910$q$), 0, 'jugador: NO actualiza partidos');
select is(pg_temp.filas($q$delete from public.partidos where local = 'Matrix'$q$), 0, 'jugador: NO borra en partidos');
select throws_ok($q$insert into public.alineaciones (partido_id) values (911)$q$, '42501', null, 'jugador: NO inserta en alineaciones');
select is(pg_temp.filas($q$update public.alineaciones set formacion = formacion where partido_id = 910$q$), 0, 'jugador: NO actualiza alineaciones');
select is(pg_temp.filas($q$delete from public.alineaciones where partido_id = 911$q$), 0, 'jugador: NO borra en alineaciones');
select throws_ok($q$insert into public.eventos_partido (partido_id, minuto, tipo, equipo) values (910, 77, 'amarilla', 'rival')$q$, '42501', null, 'jugador: NO inserta en eventos_partido');
select is(pg_temp.filas($q$update public.eventos_partido set minuto = minuto where id = 940$q$), 0, 'jugador: NO actualiza eventos_partido');
select is(pg_temp.filas($q$delete from public.eventos_partido where minuto = 77$q$), 0, 'jugador: NO borra en eventos_partido');
select throws_ok($q$insert into public.estadisticas (jugador_id, partido_id) values (903, 911)$q$, '42501', null, 'jugador: NO inserta en estadisticas');
select is(pg_temp.filas($q$update public.estadisticas set goles = goles where id = 950$q$), 0, 'jugador: NO actualiza estadisticas');
select is(pg_temp.filas($q$delete from public.estadisticas where partido_id = 911$q$), 0, 'jugador: NO borra en estadisticas');
select throws_ok($q$insert into public.patrocinadores (nombre) values ('Matrix SL')$q$, '42501', null, 'jugador: NO inserta en patrocinadores');
select is(pg_temp.filas($q$update public.patrocinadores set nombre = nombre where id = 960$q$), 0, 'jugador: NO actualiza patrocinadores');
select is(pg_temp.filas($q$delete from public.patrocinadores where nombre = 'Matrix SL'$q$), 0, 'jugador: NO borra en patrocinadores');
select throws_ok($q$insert into public.jugadores_privado (jugador_id, estado_desc) values (903, 'Matrix')$q$, '42501', null, 'jugador: NO inserta en jugadores_privado');
select is(pg_temp.filas($q$update public.jugadores_privado set estado_desc = estado_desc where jugador_id = 901$q$), 0, 'jugador: NO actualiza jugadores_privado');
select is(pg_temp.filas($q$delete from public.jugadores_privado where jugador_id = 903$q$), 0, 'jugador: NO borra en jugadores_privado');
select throws_ok($q$insert into public.temporadas (nombre, "año", activa) values ('Matrix', 2030, false)$q$, '42501', null, 'jugador: NO inserta en temporadas');
select is(pg_temp.filas($q$update public.temporadas set zona_ascenso = zona_ascenso where id = 900$q$), 0, 'jugador: NO actualiza temporadas');
select is(pg_temp.filas($q$delete from public.temporadas where nombre = 'Matrix'$q$), 0, 'jugador: NO borra en temporadas');
select throws_ok($q$insert into public.perfiles (user_id, rol) values ('00000000-0000-0000-0000-0000000000c1', 'superadmin')$q$, '42501', null, 'jugador: NO inserta en perfiles');
select is(pg_temp.filas($q$update public.perfiles set rol = 'superadmin' where user_id = '00000000-0000-0000-0000-0000000000b1'$q$), 0, 'jugador: NO actualiza perfiles');
select is(pg_temp.filas($q$delete from public.perfiles where user_id = '00000000-0000-0000-0000-0000000000b2'$q$), 0, 'jugador: NO borra en perfiles');
select is(pg_temp.filas($q$update public.activity_log set accion = 'x' where id = 970$q$), 0, 'jugador: NO actualiza activity_log');
select is(pg_temp.filas($q$delete from public.activity_log where id = 970$q$), 0, 'jugador: NO borra en activity_log');
select throws_ok($q$insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://x', 'k', 'a')$q$, '42501', null, 'jugador: NO inserta en push_subscriptions');
select is(pg_temp.filas($q$update public.push_subscriptions set auth = auth$q$), 0, 'jugador: NO actualiza push_subscriptions');
select is(pg_temp.filas($q$delete from public.push_subscriptions$q$), 0, 'jugador: NO borra en push_subscriptions');
select throws_ok($q$insert into public.claves_jugadores (jugador_id, clave_hash) values (903, 'x')$q$, '42501', null, 'jugador: NO inserta en claves_jugadores');
select is(pg_temp.filas($q$update public.claves_jugadores set clave_hash = clave_hash$q$), 0, 'jugador: NO actualiza claves_jugadores');
select is(pg_temp.filas($q$delete from public.claves_jugadores$q$), 0, 'jugador: NO borra en claves_jugadores');

-- ── admin ──────────────────────────────────────────────────────
reset role;
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000a1');
select lives_ok($q$insert into public.jugadores (nombre, posicion, dorsal) values ('Matrix', 'Portero', 50)$q$, 'admin: inserta en jugadores');
select ok(pg_temp.filas($q$update public.jugadores set dorsal = dorsal where id = 901$q$) >= 1, 'admin: actualiza jugadores');
select ok(pg_temp.filas($q$delete from public.jugadores where nombre = 'Matrix'$q$) >= 1, 'admin: borra en jugadores');
select lives_ok($q$insert into public.equipos_liga (temporada_id, nombre) values (900, 'Matrix FC')$q$, 'admin: inserta en equipos_liga');
select ok(pg_temp.filas($q$update public.equipos_liga set nombre = nombre where id = 920$q$) >= 1, 'admin: actualiza equipos_liga');
select ok(pg_temp.filas($q$delete from public.equipos_liga where nombre = 'Matrix FC'$q$) >= 1, 'admin: borra en equipos_liga');
select lives_ok($q$insert into public.partidos_liga (temporada_id, jornada, local_id, visitante_id) values (900, 9, 921, 920)$q$, 'admin: inserta en partidos_liga');
select ok(pg_temp.filas($q$update public.partidos_liga set jornada = jornada where id = 930$q$) >= 1, 'admin: actualiza partidos_liga');
select ok(pg_temp.filas($q$delete from public.partidos_liga where jornada = 9$q$) >= 1, 'admin: borra en partidos_liga');
select lives_ok($q$insert into public.partidos (temporada_id, jornada, fecha, local, visitante) values (900, 9, '2020-03-01', 'Matrix', 'B')$q$, 'admin: inserta en partidos');
select ok(pg_temp.filas($q$update public.partidos set campo = campo where id = 910$q$) >= 1, 'admin: actualiza partidos');
select ok(pg_temp.filas($q$delete from public.partidos where local = 'Matrix'$q$) >= 1, 'admin: borra en partidos');
select lives_ok($q$insert into public.alineaciones (partido_id) values (911)$q$, 'admin: inserta en alineaciones');
select ok(pg_temp.filas($q$update public.alineaciones set formacion = formacion where partido_id = 910$q$) >= 1, 'admin: actualiza alineaciones');
select ok(pg_temp.filas($q$delete from public.alineaciones where partido_id = 911$q$) >= 1, 'admin: borra en alineaciones');
select lives_ok($q$insert into public.eventos_partido (partido_id, minuto, tipo, equipo) values (910, 77, 'amarilla', 'rival')$q$, 'admin: inserta en eventos_partido');
select ok(pg_temp.filas($q$update public.eventos_partido set minuto = minuto where id = 940$q$) >= 1, 'admin: actualiza eventos_partido');
select ok(pg_temp.filas($q$delete from public.eventos_partido where minuto = 77$q$) >= 1, 'admin: borra en eventos_partido');
select lives_ok($q$insert into public.estadisticas (jugador_id, partido_id) values (903, 911)$q$, 'admin: inserta en estadisticas');
select ok(pg_temp.filas($q$update public.estadisticas set goles = goles where id = 950$q$) >= 1, 'admin: actualiza estadisticas');
select ok(pg_temp.filas($q$delete from public.estadisticas where partido_id = 911$q$) >= 1, 'admin: borra en estadisticas');
select lives_ok($q$insert into public.patrocinadores (nombre) values ('Matrix SL')$q$, 'admin: inserta en patrocinadores');
select ok(pg_temp.filas($q$update public.patrocinadores set nombre = nombre where id = 960$q$) >= 1, 'admin: actualiza patrocinadores');
select ok(pg_temp.filas($q$delete from public.patrocinadores where nombre = 'Matrix SL'$q$) >= 1, 'admin: borra en patrocinadores');
select lives_ok($q$insert into public.jugadores_privado (jugador_id, estado_desc) values (903, 'Matrix')$q$, 'admin: inserta en jugadores_privado');
select ok(pg_temp.filas($q$update public.jugadores_privado set estado_desc = estado_desc where jugador_id = 901$q$) >= 1, 'admin: actualiza jugadores_privado');
select ok(pg_temp.filas($q$delete from public.jugadores_privado where jugador_id = 903$q$) >= 1, 'admin: borra en jugadores_privado');
select throws_ok($q$insert into public.temporadas (nombre, "año", activa) values ('Matrix', 2030, false)$q$, '42501', null, 'admin: NO inserta en temporadas');
select ok(pg_temp.filas($q$update public.temporadas set zona_ascenso = zona_ascenso where id = 900$q$) >= 1, 'admin: actualiza la configuración de temporadas');
select is(pg_temp.filas($q$delete from public.temporadas where nombre = 'Matrix'$q$), 0, 'admin: NO borra en temporadas');
select throws_ok($q$insert into public.perfiles (user_id, rol) values ('00000000-0000-0000-0000-0000000000c1', 'superadmin')$q$, '42501', null, 'admin: NO inserta en perfiles');
select is(pg_temp.filas($q$update public.perfiles set rol = 'superadmin' where user_id = '00000000-0000-0000-0000-0000000000b1'$q$), 0, 'admin: NO actualiza perfiles');
select is(pg_temp.filas($q$delete from public.perfiles where user_id = '00000000-0000-0000-0000-0000000000b2'$q$), 0, 'admin: NO borra en perfiles');
select is(pg_temp.filas($q$update public.activity_log set accion = 'x' where id = 970$q$), 0, 'admin: NO actualiza activity_log');
select is(pg_temp.filas($q$delete from public.activity_log where id = 970$q$), 0, 'admin: NO borra en activity_log');
select throws_ok($q$insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://x', 'k', 'a')$q$, '42501', null, 'admin: NO inserta en push_subscriptions');
select is(pg_temp.filas($q$update public.push_subscriptions set auth = auth$q$), 0, 'admin: NO actualiza push_subscriptions');
select is(pg_temp.filas($q$delete from public.push_subscriptions$q$), 0, 'admin: NO borra en push_subscriptions');
select throws_ok($q$insert into public.claves_jugadores (jugador_id, clave_hash) values (903, 'x')$q$, '42501', null, 'admin: NO inserta en claves_jugadores');
select is(pg_temp.filas($q$update public.claves_jugadores set clave_hash = clave_hash$q$), 0, 'admin: NO actualiza claves_jugadores');
select is(pg_temp.filas($q$delete from public.claves_jugadores$q$), 0, 'admin: NO borra en claves_jugadores');

-- ── superadmin ──────────────────────────────────────────────────────
reset role;
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000a2');
select lives_ok($q$insert into public.jugadores (nombre, posicion, dorsal) values ('Matrix', 'Portero', 50)$q$, 'superadmin: inserta en jugadores');
select ok(pg_temp.filas($q$update public.jugadores set dorsal = dorsal where id = 901$q$) >= 1, 'superadmin: actualiza jugadores');
select ok(pg_temp.filas($q$delete from public.jugadores where nombre = 'Matrix'$q$) >= 1, 'superadmin: borra en jugadores');
select lives_ok($q$insert into public.equipos_liga (temporada_id, nombre) values (900, 'Matrix FC')$q$, 'superadmin: inserta en equipos_liga');
select ok(pg_temp.filas($q$update public.equipos_liga set nombre = nombre where id = 920$q$) >= 1, 'superadmin: actualiza equipos_liga');
select ok(pg_temp.filas($q$delete from public.equipos_liga where nombre = 'Matrix FC'$q$) >= 1, 'superadmin: borra en equipos_liga');
select lives_ok($q$insert into public.partidos_liga (temporada_id, jornada, local_id, visitante_id) values (900, 9, 921, 920)$q$, 'superadmin: inserta en partidos_liga');
select ok(pg_temp.filas($q$update public.partidos_liga set jornada = jornada where id = 930$q$) >= 1, 'superadmin: actualiza partidos_liga');
select ok(pg_temp.filas($q$delete from public.partidos_liga where jornada = 9$q$) >= 1, 'superadmin: borra en partidos_liga');
select lives_ok($q$insert into public.partidos (temporada_id, jornada, fecha, local, visitante) values (900, 9, '2020-03-01', 'Matrix', 'B')$q$, 'superadmin: inserta en partidos');
select ok(pg_temp.filas($q$update public.partidos set campo = campo where id = 910$q$) >= 1, 'superadmin: actualiza partidos');
select ok(pg_temp.filas($q$delete from public.partidos where local = 'Matrix'$q$) >= 1, 'superadmin: borra en partidos');
select lives_ok($q$insert into public.alineaciones (partido_id) values (911)$q$, 'superadmin: inserta en alineaciones');
select ok(pg_temp.filas($q$update public.alineaciones set formacion = formacion where partido_id = 910$q$) >= 1, 'superadmin: actualiza alineaciones');
select ok(pg_temp.filas($q$delete from public.alineaciones where partido_id = 911$q$) >= 1, 'superadmin: borra en alineaciones');
select lives_ok($q$insert into public.eventos_partido (partido_id, minuto, tipo, equipo) values (910, 77, 'amarilla', 'rival')$q$, 'superadmin: inserta en eventos_partido');
select ok(pg_temp.filas($q$update public.eventos_partido set minuto = minuto where id = 940$q$) >= 1, 'superadmin: actualiza eventos_partido');
select ok(pg_temp.filas($q$delete from public.eventos_partido where minuto = 77$q$) >= 1, 'superadmin: borra en eventos_partido');
select lives_ok($q$insert into public.estadisticas (jugador_id, partido_id) values (903, 911)$q$, 'superadmin: inserta en estadisticas');
select ok(pg_temp.filas($q$update public.estadisticas set goles = goles where id = 950$q$) >= 1, 'superadmin: actualiza estadisticas');
select ok(pg_temp.filas($q$delete from public.estadisticas where partido_id = 911$q$) >= 1, 'superadmin: borra en estadisticas');
select lives_ok($q$insert into public.patrocinadores (nombre) values ('Matrix SL')$q$, 'superadmin: inserta en patrocinadores');
select ok(pg_temp.filas($q$update public.patrocinadores set nombre = nombre where id = 960$q$) >= 1, 'superadmin: actualiza patrocinadores');
select ok(pg_temp.filas($q$delete from public.patrocinadores where nombre = 'Matrix SL'$q$) >= 1, 'superadmin: borra en patrocinadores');
select lives_ok($q$insert into public.jugadores_privado (jugador_id, estado_desc) values (903, 'Matrix')$q$, 'superadmin: inserta en jugadores_privado');
select ok(pg_temp.filas($q$update public.jugadores_privado set estado_desc = estado_desc where jugador_id = 901$q$) >= 1, 'superadmin: actualiza jugadores_privado');
select ok(pg_temp.filas($q$delete from public.jugadores_privado where jugador_id = 903$q$) >= 1, 'superadmin: borra en jugadores_privado');
select lives_ok($q$insert into public.temporadas (nombre, "año", activa) values ('Matrix', 2030, false)$q$, 'superadmin: inserta en temporadas');
select ok(pg_temp.filas($q$update public.temporadas set zona_ascenso = zona_ascenso where id = 900$q$) >= 1, 'superadmin: actualiza temporadas');
select ok(pg_temp.filas($q$delete from public.temporadas where nombre = 'Matrix'$q$) >= 1, 'superadmin: borra en temporadas');
select throws_ok($q$insert into public.perfiles (user_id, rol) values ('00000000-0000-0000-0000-0000000000c1', 'superadmin')$q$, '42501', null, 'superadmin: NO inserta en perfiles');
select is(pg_temp.filas($q$update public.perfiles set rol = 'superadmin' where user_id = '00000000-0000-0000-0000-0000000000b1'$q$), 0, 'superadmin: NO actualiza perfiles');
select is(pg_temp.filas($q$delete from public.perfiles where user_id = '00000000-0000-0000-0000-0000000000b2'$q$), 0, 'superadmin: NO borra en perfiles');
select is(pg_temp.filas($q$update public.activity_log set accion = 'x' where id = 970$q$), 0, 'superadmin: NO actualiza activity_log');
select is(pg_temp.filas($q$delete from public.activity_log where id = 970$q$), 0, 'superadmin: NO borra en activity_log');
select throws_ok($q$insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://x', 'k', 'a')$q$, '42501', null, 'superadmin: NO inserta en push_subscriptions');
select is(pg_temp.filas($q$update public.push_subscriptions set auth = auth$q$), 0, 'superadmin: NO actualiza push_subscriptions');
select is(pg_temp.filas($q$delete from public.push_subscriptions$q$), 0, 'superadmin: NO borra en push_subscriptions');
select throws_ok($q$insert into public.claves_jugadores (jugador_id, clave_hash) values (903, 'x')$q$, '42501', null, 'superadmin: NO inserta en claves_jugadores');
select is(pg_temp.filas($q$update public.claves_jugadores set clave_hash = clave_hash$q$), 0, 'superadmin: NO actualiza claves_jugadores');
select is(pg_temp.filas($q$delete from public.claves_jugadores$q$), 0, 'superadmin: NO borra en claves_jugadores');

-- ═══ Reads & privacy ════════════════════════════════════════════════════════
reset role;
set local role anon;
select pg_temp.como(null);
select ok((select count(*) from public.partidos where id = 910) = 1, 'anon: lee partidos');
select ok((select count(*) from (select id, nombre, dorsal, foto_url, estado from public.jugadores) j) >= 3, 'anon: lee columnas públicas de jugadores');
select throws_ok($q$select estado_desc from public.jugadores$q$, '42501', null, 'anon: NO lee jugadores.estado_desc');
select throws_ok($q$select * from public.jugadores_privado$q$, '42501', null, 'anon: NO lee jugadores_privado');
select throws_ok($q$select * from public.votos_mvp$q$, '42501', null, 'anon: NO ve quién votó a quién');
select is((select votos from public.mvp_ranking(910) where votado_id = 901), 1, 'anon: ve el total de votos (mvp_ranking)');
select throws_ok($q$select * from public.perfiles$q$, '42501', null, 'anon: NO lee perfiles');
select throws_ok($q$select * from public.activity_log$q$, '42501', null, 'anon: NO lee el log');
select throws_ok($q$select * from public.push_subscriptions$q$, '42501', null, 'anon: NO lee suscripciones push');
select throws_ok($q$select * from public.claves_jugadores$q$, '42501', null, 'anon: NO lee hashes de PIN');
select throws_ok($q$select public.is_admin()$q$, '42501', null, 'anon: NO ejecuta funciones internas');

reset role;
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000b1');
select is((select estado_desc from public.jugadores_privado where jugador_id = 901), 'Lesión de rodilla', 'jugador: lee datos privados del club');
select is((select count(*)::int from public.votos_mvp), 0, 'jugador: no ve votos ajenos');
select is((select count(*)::int from public.perfiles), 1, 'jugador: solo ve su perfil');
select is((select count(*)::int from public.activity_log), 0, 'jugador: no lee el log');

-- ═══ MVP vote rules (player 901) ════════════════════════════════════════════
select lives_ok($q$insert into public.votos_mvp (partido_id, votante_id, votado_id) values (910, 901, 902)$q$, 'voto: válido (convocado, partido jugado)');
select is((select count(*)::int from public.votos_mvp), 1, 'voto: el jugador ve su propio voto');
select throws_ok($q$update public.votos_mvp set votado_id = 903 where votante_id = 901$q$, 'CD400', null, 'voto: NO a quien no participó');
select throws_ok($q$update public.votos_mvp set votado_id = 901 where votante_id = 901$q$, 'CD400', null, 'voto: NO a sí mismo');
select throws_ok($q$insert into public.votos_mvp (partido_id, votante_id, votado_id) values (910, 902, 901)$q$, '42501', null, 'voto: NO suplantar a otro votante');
select throws_ok($q$insert into public.votos_mvp (partido_id, votante_id, votado_id) values (911, 901, 902)$q$, 'CD400', null, 'voto: NO en partido sin jugar');
select is(pg_temp.filas($q$delete from public.votos_mvp where votante_id = 902$q$), 0, 'voto: NO borra votos ajenos');
select is(pg_temp.filas($q$delete from public.votos_mvp where votante_id = 901$q$), 1, 'voto: retira su propio voto');

-- ═══ Admin reads & private data handling ════════════════════════════════════
reset role;
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.votos_mvp), 1, 'admin: ve todos los votos');
select is((select count(*)::int from public.activity_log), 0, 'admin: no lee el log (solo superadmin)');
update public.jugadores set estado_desc = 'Sancionado 2 partidos' where id = 902;
select is((select estado_desc from public.jugadores where id = 902), null, 'privado: estado_desc no queda en la tabla pública');
select is((select estado_desc from public.jugadores_privado where jugador_id = 902), 'Sancionado 2 partidos', 'privado: se guarda en jugadores_privado');

-- ═══ Structural guarantees ══════════════════════════════════════════════════
reset role;
select is((select count(*)::int from information_schema.table_privileges
            where table_schema = 'public' and grantee = 'anon' and privilege_type <> 'SELECT'), 0,
  'grants: anon no tiene ningún privilegio de escritura');
select is((select count(*)::int from information_schema.table_privileges
            where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')), 0,
  'grants: nadie de la API puede TRUNCATE/REFERENCES/TRIGGER');
select is((select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')), array['mvp_ranking', 'mvp_votacion'],
  'rpc: anon solo puede ejecutar mvp_ranking y mvp_votacion');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity), 0,
  'rls: todas las tablas de public tienen RLS');
select is((select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind in ('v', 'm')
              and not coalesce((select option_value = 'true' from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), false)), 0,
  'vistas: ninguna vista sin security_invoker');
select is((select count(*)::int from pg_policies
            where schemaname = 'storage' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
              and (roles && array['anon', 'public']::name[])), 0,
  'storage: ninguna política de escritura anónima');
select ok(pg_temp.sin_buckets_publicos(), 'storage: ningún bucket público');

select * from finish();
rollback;
