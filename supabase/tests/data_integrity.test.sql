-- pgTAP: data integrity rules (migration 20261017180000_data_integrity.sql).
-- Valid input, boundaries and malicious input for every writable table, run as
-- the real API roles so RLS, constraints and triggers all take part.
-- Run with:  npx supabase test db     (see docs/data-validation.md)

begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
-- Cross-table checks are deferred to the end of each API request; run them per statement here.
set constraints all immediate;

select plan(148);

-- ── Fixtures (as postgres) ──────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local'),
  ('00000000-0000-0000-0000-0000000000a2', 'super@test.local'),
  ('00000000-0000-0000-0000-0000000000b1', 'jugador-801@test.local'),
  ('00000000-0000-0000-0000-0000000000b3', 'jugador-807@test.local');

insert into public.temporadas (id, nombre, "año", activa, duracion_partido) values
  (800, 'Integridad 2020', 2020, false, 90),
  (850, 'Integridad actual', extract(year from current_date)::int, false, 90);
insert into public.equipos_liga (id, temporada_id, nombre, es_propio) values
  (810, 800, 'CD Tembleque FC', true), (811, 800, 'Rival A', false), (812, 800, 'Rival B', false),
  (813, 800, 'Rival C', false), (814, 800, 'Rival D', false),
  (860, 850, 'CD Tembleque FC', true), (861, 850, 'Rival F', false), (862, 850, 'Rival G', false);
insert into public.jugadores (id, nombre, posicion, dorsal, activo) values
  (801, 'Portero Uno', 'Portero', 1, true), (802, 'Defensa Dos', 'Defensa', 2, true),
  (803, 'Medio Ocho', 'Centrocampista', 8, true), (804, 'Delantero Nueve', 'Delantero', 9, true),
  (805, 'Suplente Once', 'Delantero', 11, true), (806, 'No Convocado', 'Defensa', 15, true),
  (807, 'Retirado Siete', 'Defensa', 7, false);
insert into public.partidos (id, temporada_id, jornada, fecha, hora, local, visitante, jugado, goles_local, goles_visitante, convocados) values
  (820, 800, 1, '2020-02-01', '17:00', 'CD Tembleque FC', 'Rival A', true, 2, 1, '[801, 802, 803, 804, 805]'),
  (821, 800, 2, '2020-02-08', '17:00', 'Rival B', 'CD Tembleque FC', false, 0, 0, '[801, 802, 803, 804, 805]'),
  (822, 800, 5, '2020-03-08', '17:00', 'CD Tembleque FC', 'Rival C', true, 2, 0, '[]'),
  (851, 850, 1, current_date + 30, '17:00', 'CD Tembleque FC', 'Rival F', false, 0, 0, '[]');

select public.asignar_rol('00000000-0000-0000-0000-0000000000a1', 'admin');
select public.asignar_rol('00000000-0000-0000-0000-0000000000a2', 'superadmin');
select public.asignar_rol('00000000-0000-0000-0000-0000000000b1', 'jugador', 801);
select public.asignar_rol('00000000-0000-0000-0000-0000000000b3', 'jugador', 807);

create function pg_temp.como(p_uid text) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true)
$$;
-- SQLSTATE + message of a statement ('ok' when it succeeds)
create function pg_temp.error_de(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate || ' ' || sqlerrm;
end $$;
grant execute on function pg_temp.como(text), pg_temp.error_de(text) to authenticated;

-- Lineup used below: 801 GK, 802, 803, 804 starters (805 on the bench)
create function pg_temp.slots(p_ids int[]) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('linea', case when i = 1 then 0 when i <= 5 then 1 when i <= 9 then 2 else 3 end,
                                               'posicion', case when i = 1 then 0 when i <= 5 then i - 2 when i <= 9 then i - 6 else i - 10 end,
                                               'jugador_id', p_ids[i]) order by i), '[]')
    from generate_series(1, 11) i
$$;
grant execute on function pg_temp.slots(int[]) to authenticated;

set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000a1'); -- admin

-- ═══ Players ════════════════════════════════════════════════════════════════
select lives_ok($$ insert into jugadores (id, nombre, posicion, dorsal) values (808, '  Nuevo Fichaje  ', 'Delantero', 99) $$, 'jugador: alta válida (dorsal 99 = límite)');
select is((select nombre from jugadores where id = 808), 'Nuevo Fichaje', 'jugador: el nombre se guarda sin espacios sobrantes');
select throws_ok($$ insert into jugadores (nombre, posicion, dorsal) values ('Cero', 'Defensa', 0) $$, '23514', null, 'jugador: dorsal 0 fuera de rango');
select throws_ok($$ insert into jugadores (nombre, posicion, dorsal) values ('Cien', 'Defensa', 100) $$, '23514', null, 'jugador: dorsal 100 fuera de rango');
select throws_ok($$ insert into jugadores (nombre, posicion, dorsal) values ('Repe', 'Defensa', 9) $$, '23505', null, 'jugador: dorsal repetido entre jugadores en activo');
select lives_ok($$ insert into jugadores (nombre, posicion, dorsal) values ('Hereda el 7', 'Defensa', 7) $$, 'jugador: puede usar el dorsal de un jugador que ya no está en activo');
select throws_ok($$ insert into jugadores (nombre, posicion) values ('   ', 'Defensa') $$, 'CD400', null, 'jugador: nombre en blanco');
select throws_ok($$ insert into jugadores (nombre, posicion) values (repeat('x', 61), 'Defensa') $$, 'CD400', null, 'jugador: nombre de más de 60 caracteres');
select throws_ok($$ insert into jugadores (nombre, posicion) values (E'Ana\x07\x1b[2J', 'Defensa') $$, 'CD400', null, 'jugador: nombre con caracteres de control');
select throws_ok($$ insert into jugadores (nombre, posicion) values ('Sin Posición', null) $$, 'CD400', null, 'jugador: posición obligatoria');
select throws_ok($$ insert into jugadores (nombre, posicion) values ('Líbero', 'Libero') $$, '23514', null, 'jugador: posición inexistente');
select throws_ok($$ update jugadores set estado = 'hackeado' where id = 806 $$, '23514', null, 'jugador: estado inexistente');
select throws_ok($$ update jugadores set foto_url = 'javascript:alert(1)' where id = 806 $$, '23514', null, 'jugador: foto con javascript:');
select throws_ok($$ update jugadores set foto_url = 'data:image/png;base64,AAAA' where id = 806 $$, '23514', null, 'jugador: foto incrustada (data:)');
select lives_ok($$ update jugadores set foto_url = 'https://res.cloudinary.com/demo/image/upload/v1/a.jpg' where id = 806 $$, 'jugador: foto https válida');
select lives_ok($$ insert into jugadores (nombre, posicion) values ('Robert''); drop table jugadores;--', 'Defensa') $$, 'jugador: texto con SQL se guarda como texto');
select ok(to_regclass('public.jugadores') is not null, 'jugador: la tabla sigue intacta tras el intento de inyección');
select throws_ok($$ insert into jugadores_privado (jugador_id, estado_desc) values (806, repeat('a', 281)) $$, '23514', null, 'jugador: nota privada de más de 280 caracteres');

-- ═══ Seasons ════════════════════════════════════════════════════════════════
select throws_ok($$ update temporadas set duracion_partido = 0 where id = 800 $$, '23514', null, 'temporada: duración 0');
select throws_ok($$ update temporadas set duracion_partido = 121 where id = 800 $$, '23514', null, 'temporada: duración mayor de 120');
select throws_ok($$ update temporadas set zona_descenso = -1 where id = 800 $$, '23514', null, 'temporada: plazas negativas');
select throws_ok($$ update temporadas set "año" = 2021 where id = 800 $$, '42501', null, 'temporada: un admin no cambia el año');
reset role;
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000a2'); -- superadmin
select throws_ok($$ insert into temporadas (nombre, "año", activa) values ('Antigua', 1999, false) $$, '23514', null, 'temporada: año fuera de rango');
select throws_ok($$ insert into temporadas (nombre, "año", activa) values ('  integridad 2020 ', 2021, false) $$, '23505', null, 'temporada: nombre repetido (sin distinguir mayúsculas)');
select throws_ok($$ update temporadas set "año" = 2030 where id = 800 $$, 'CD400', null, 'temporada: cambiar el año dejaría partidos fuera');
select lives_ok($$ update temporadas set "año" = 2021 where id = 800 $$, 'temporada: año compatible con sus partidos');
select lives_ok($$ update temporadas set "año" = 2020 where id = 800 $$, 'temporada: vuelta al año original');
reset role;
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000a1'); -- admin

-- ═══ League teams ═══════════════════════════════════════════════════════════
select throws_ok($$ insert into equipos_liga (temporada_id, nombre) values (800, ' rival a ') $$, '23505', null, 'equipo: nombre repetido en la temporada');
select throws_ok($$ insert into equipos_liga (temporada_id, nombre, es_propio) values (800, 'Otro Club', true) $$, '23505', null, 'equipo: solo un equipo propio por temporada');
select throws_ok($$ update equipos_liga set nombre_corto = repeat('x', 17) where id = 811 $$, '23514', null, 'equipo: nombre corto de más de 16');
select throws_ok($$ update equipos_liga set sancion_puntos = -3 where id = 811 $$, '23514', null, 'equipo: sanción negativa');
select throws_ok($$ update equipos_liga set es_propio = true where id = 811 $$, 'CD400', null, 'equipo: no se convierte en equipo propio');
select throws_ok($$ update equipos_liga set nombre = 'Otro nombre' where id = 810 $$, 'CD400', null, 'equipo: no se renombra el club');
select throws_ok($$ delete from equipos_liga where id = 810 $$, 'CD400', null, 'equipo: no se borra el club');
select throws_ok($$ delete from equipos_liga where id = 811 $$, 'CD400', null, 'equipo: no se borra un rival con partidos contra el club');

-- ═══ League fixtures between other teams ════════════════════════════════════
select lives_ok($$ insert into partidos_liga (id, temporada_id, jornada, local_id, visitante_id, fecha, jugado, goles_local, goles_visitante)
                   values (830, 800, 1, 812, 813, '2020-02-01', true, 3, 0) $$, 'liga: resultado válido');
select throws_ok($$ insert into partidos_liga (temporada_id, jornada, local_id, visitante_id) values (800, 1, 814, 812) $$, 'CD400', null, 'liga: un equipo no juega dos veces en la misma jornada');
select throws_ok($$ insert into partidos_liga (temporada_id, jornada, local_id, visitante_id) values (800, 1, 814, 811) $$, 'CD400', null, 'liga: el rival ya juega contra el club esa jornada');
select throws_ok($$ insert into partidos_liga (temporada_id, jornada, local_id, visitante_id) values (800, 3, 810, 812) $$, 'CD400', null, 'liga: el club no se registra aquí');
select throws_ok($$ insert into partidos_liga (temporada_id, jornada, local_id, visitante_id) values (800, 3, 812, 861) $$, 'CD400', null, 'liga: equipo de otra temporada');
select throws_ok($$ insert into partidos_liga (temporada_id, jornada, local_id, visitante_id) values (800, 3, 812, 812) $$, '23514', null, 'liga: un equipo contra sí mismo');
select throws_ok($$ insert into partidos_liga (temporada_id, jornada, local_id, visitante_id) values (800, 3, 812, 813) $$, '23505', null, 'liga: el mismo enfrentamiento (ida) dos veces');
select lives_ok($$ insert into partidos_liga (temporada_id, jornada, local_id, visitante_id) values (800, 3, 813, 812) $$, 'liga: la vuelta sí se puede registrar');
select throws_ok($$ insert into partidos_liga (temporada_id, jornada, local_id, visitante_id, fecha, jugado) values (850, 1, 861, 862, current_date + 30, true) $$, 'CD400', null, 'liga: no se marca jugado con fecha futura');
select throws_ok($$ insert into partidos_liga (temporada_id, jornada, local_id, visitante_id, fecha) values (800, 4, 814, 813, '2030-01-01') $$, 'CD400', null, 'liga: fecha fuera de la temporada');
select throws_ok($$ update partidos_liga set goles_local = 100 where id = 830 $$, '23514', null, 'liga: más de 99 goles');
select throws_ok($$ update partidos_liga set jornada = 0 where id = 830 $$, '23514', null, 'liga: jornada 0');
select throws_ok($$ insert into partidos_liga (temporada_id, jornada, local_id, visitante_id) values (800, 6, 812, 999999) $$, '23503', null, 'liga: equipo inexistente');

-- ═══ Our matches ════════════════════════════════════════════════════════════
select lives_ok($$ insert into partidos (id, temporada_id, jornada, fecha, hora, local, visitante) values (823, 800, 8, '2020-03-01', '12:00', 'CD Tembleque FC', 'Rival B') $$, 'partido: alta válida');
select throws_ok($$ insert into partidos (temporada_id, jornada, fecha, local, visitante) values (800, 1, '2020-03-01', 'CD Tembleque FC', 'Rival D') $$, '23505', null, 'partido: jornada repetida');
select throws_ok($$ insert into partidos (temporada_id, jornada, fecha, local, visitante) values (800, 6, '2020-03-01', 'CD Tembleque FC', 'Fantasma CF') $$, 'CD400', null, 'partido: rival que no está en el grupo');
select lives_ok($$ insert into partidos (temporada_id, jornada, fecha, local, visitante, amistoso) values (800, 0, '2020-07-01', 'CD Tembleque FC', 'Fantasma CF', true) $$, 'partido: amistoso contra un equipo de fuera');
select throws_ok($$ insert into partidos (temporada_id, jornada, fecha, local, visitante, amistoso) values (800, 5, '2020-07-02', 'CD Tembleque FC', 'Otro CF', true) $$, '23514', null, 'partido: un amistoso no tiene jornada');
select throws_ok($$ insert into partidos (temporada_id, jornada, fecha, local, visitante) values (800, 7, '2020-03-01', 'Rival A', 'Rival B') $$, 'CD400', null, 'partido: el club debe ser uno de los equipos');
select throws_ok($$ insert into partidos (temporada_id, jornada, fecha, local, visitante) values (800, 7, '2020-03-01', 'CD Tembleque FC', ' cd tembleque fc') $$, 'CD400', null, 'partido: mismo equipo en los dos lados');
select throws_ok($$ insert into partidos (temporada_id, jornada, fecha, local, visitante) values (800, 7, '2030-03-01', 'CD Tembleque FC', 'Rival D') $$, 'CD400', null, 'partido: fecha fuera de la temporada');
select throws_ok($$ insert into partidos (jornada, fecha, local, visitante) values (7, '2020-03-01', 'CD Tembleque FC', 'Rival D') $$, '23514', null, 'partido: temporada obligatoria');
select throws_ok($$ update partidos set hora = '25:00' where id = 823 $$, '23514', null, 'partido: hora imposible');
select throws_ok($$ update partidos set hora = '17:00''; drop table partidos;--' where id = 823 $$, '23514', null, 'partido: hora con texto malicioso');
select throws_ok($$ update partidos set goles_local = -1 where id = 823 $$, '23514', null, 'partido: goles negativos');
select throws_ok($$ update partidos set jugado = true where id = 851 $$, 'CD400', null, 'partido: no se marca jugado antes de empezar');
select lives_ok($$ insert into partidos_liga (temporada_id, jornada, local_id, visitante_id) values (800, 4, 814, 813) $$, 'partido: (preparación) Rival D juega la jornada 4 en la liga');
select throws_ok($$ insert into partidos (temporada_id, jornada, fecha, local, visitante) values (800, 4, '2020-03-15', 'CD Tembleque FC', 'Rival D') $$, 'CD400', null, 'partido: el rival ya juega otro partido esa jornada');

-- Call-ups: a JSON list of existing, distinct player ids
select throws_ok($$ update partidos set convocados = '"801"' where id = 823 $$, 'CD400', null, 'convocatoria: no es una lista');
select throws_ok($$ update partidos set convocados = '["801"]' where id = 823 $$, 'CD400', null, 'convocatoria: ids como texto');
select throws_ok($$ update partidos set convocados = '[801, 801]' where id = 823 $$, 'CD400', null, 'convocatoria: jugador repetido');
select throws_ok($$ update partidos set convocados = '[999999]' where id = 823 $$, 'CD400', null, 'convocatoria: jugador inexistente');
select throws_ok($$ update partidos set convocados = '[-1, 1.5]' where id = 823 $$, 'CD400', null, 'convocatoria: ids negativos o decimales');
select throws_ok($$ update partidos set convocados = '[{"id": 801}]' where id = 823 $$, 'CD400', null, 'convocatoria: objetos en lugar de ids');
select throws_ok($$ update partidos set convocados = (select jsonb_agg(i) from generate_series(1, 51) i) where id = 823 $$, 'CD400', null, 'convocatoria: más de 50 jugadores');
select lives_ok($$ update partidos set convocados = '[801, 802, 803]' where id = 823 $$, 'convocatoria: lista válida');

-- ═══ Lineups ════════════════════════════════════════════════════════════════
select lives_ok($$ insert into alineaciones (partido_id, formacion, jugadores) values (820, '4-4-2', pg_temp.slots(array[801, 802, 803, 804])) $$, 'alineación: válida');
select throws_ok($$ update alineaciones set formacion = '9-9-9' where partido_id = 820 $$, 'CD400', null, 'alineación: formación inexistente');
select throws_ok($$ update alineaciones set jugadores = jugadores || '[{"linea": 3, "posicion": 2, "jugador_id": null}]' where partido_id = 820 $$, 'CD400', null, 'alineación: 12 posiciones');
select throws_ok($$ update alineaciones set jugadores = pg_temp.slots(array[801, 802, 802]) where partido_id = 820 $$, 'CD400', null, 'alineación: jugador repetido');
select throws_ok($$ update alineaciones set jugadores = pg_temp.slots(array[801, 806]) where partido_id = 820 $$, 'CD400', null, 'alineación: jugador no convocado');
select throws_ok($$ update alineaciones set jugadores = '[{"linea": 0, "posicion": 0, "jugador_id": 801, "x": "<script>"}]' where partido_id = 820 $$, 'CD400', null, 'alineación: claves no permitidas');
select throws_ok($$ update alineaciones set jugadores = '[{"linea": 9, "posicion": 0, "jugador_id": 801}]' where partido_id = 820 $$, 'CD400', null, 'alineación: línea imposible');
select throws_ok($$ update alineaciones set jugadores = '[{"linea": 1, "posicion": 0, "jugador_id": 801}, {"linea": 1, "posicion": 0, "jugador_id": 802}]' where partido_id = 820 $$, 'CD400', null, 'alineación: dos jugadores en el mismo puesto');
select throws_ok($$ update alineaciones set jugadores = '[{"linea": 0, "posicion": 0, "jugador_id": "801"}]' where partido_id = 820 $$, 'CD400', null, 'alineación: id como texto');

-- ═══ Timeline events (match 820: 801, 802, 803, 804 start; 805 on the bench) ═
select lives_ok($$ insert into eventos_partido (id, partido_id, minuto, tipo, equipo, jugador_id, jugador2_id) values (840, 820, 30, 'gol', 'propio', 804, 803) $$, 'evento: gol con asistencia');
select lives_ok($$ insert into eventos_partido (id, partido_id, minuto, minuto_extra, tipo, equipo, jugador_id) values (841, 820, 45, 3, 'amarilla', 'propio', 802) $$, 'evento: tiempo añadido al final de la primera parte (45+3)');
select lives_ok($$ insert into eventos_partido (partido_id, minuto, minuto_extra, tipo, equipo, nombre_rival) values (820, 90, 4, 'gol', 'rival', 'Dorsal 10') $$, 'evento: gol rival en el 90+4 (límite)');
select throws_ok($$ insert into eventos_partido (partido_id, minuto, tipo, equipo) values (820, 0, 'amarilla', 'rival') $$, 'CD400', null, 'evento: minuto 0');
select throws_ok($$ insert into eventos_partido (partido_id, minuto, tipo, equipo) values (820, 91, 'amarilla', 'rival') $$, 'CD400', null, 'evento: minuto 91 en un partido de liga (se escribe 90+1)');
select throws_ok($$ insert into eventos_partido (partido_id, minuto, minuto_extra, tipo, equipo) values (820, 60, 3, 'amarilla', 'rival') $$, 'CD400', null, 'evento: tiempo añadido a mitad de una parte');
select throws_ok($$ insert into eventos_partido (partido_id, minuto, minuto_extra, tipo, equipo) values (820, 90, 16, 'amarilla', 'rival') $$, '23514', null, 'evento: más de 15 minutos añadidos');
select throws_ok($$ insert into eventos_partido (partido_id, minuto, tipo, equipo) values (820, 50, 'gol', 'propio') $$, 'CD400', null, 'evento: gol nuestro sin goleador');
select throws_ok($$ insert into eventos_partido (partido_id, minuto, tipo, equipo, jugador_id) values (820, 50, 'gol', 'rival', 804) $$, 'CD400', null, 'evento: gol rival con un jugador nuestro');
select throws_ok($$ insert into eventos_partido (partido_id, minuto, tipo, equipo, jugador_id) values (820, 50, 'cambio', 'propio', 805) $$, 'CD400', null, 'evento: cambio sin jugador que sale');
select throws_ok($$ insert into eventos_partido (partido_id, minuto, tipo, equipo, jugador_id, jugador2_id) values (820, 50, 'cambio', 'propio', 804, 804) $$, '23514', null, 'evento: entra y sale el mismo jugador');
select throws_ok($$ insert into eventos_partido (partido_id, minuto, tipo, equipo, jugador_id, jugador2_id) values (820, 50, 'amarilla', 'propio', 803, 802) $$, 'CD400', null, 'evento: tarjeta con segundo jugador');
select throws_ok($$ insert into eventos_partido (partido_id, minuto, tipo, equipo, jugador_id) values (820, 50, 'amarilla', 'propio', 806) $$, 'CD400', null, 'evento: jugador no convocado');
select throws_ok($$ insert into eventos_partido (partido_id, minuto, tipo, equipo, jugador_id) values (822, 50, 'amarilla', 'propio', 999999) $$, '23503', null, 'evento: jugador inexistente');
select throws_ok($$ insert into eventos_partido (partido_id, minuto, tipo, equipo, nombre_rival) values (851, 10, 'gol', 'rival', 'X') $$, 'CD400', null, 'evento: partido que no ha empezado');
-- Order of the match
select throws_ok($$ insert into eventos_partido (partido_id, minuto, tipo, equipo, jugador_id) values (820, 70, 'amarilla', 'propio', 802) $$, 'CD400', null, 'cronología: dos amarillas simples al mismo jugador');
select throws_ok($$ insert into eventos_partido (partido_id, minuto, tipo, equipo, jugador_id) values (820, 70, 'segunda_amarilla', 'propio', 803) $$, 'CD400', null, 'cronología: 2ª amarilla sin una amarilla previa');
select lives_ok($$ insert into eventos_partido (id, partido_id, minuto, tipo, equipo, jugador_id) values (842, 820, 70, 'segunda_amarilla', 'propio', 802) $$, 'cronología: 2ª amarilla válida');
select throws_ok($$ insert into eventos_partido (partido_id, minuto, tipo, equipo, jugador_id) values (820, 80, 'gol', 'propio', 802) $$, 'CD400', null, 'cronología: un expulsado no marca después');
select throws_ok($$ delete from eventos_partido where id = 841 $$, 'CD400', null, 'cronología: no se borra la amarilla de la que depende la 2ª');
select throws_ok($$ insert into eventos_partido (partido_id, minuto, tipo, equipo, jugador_id, jugador2_id) values (820, 60, 'cambio', 'propio', 803, 804) $$, 'CD400', null, 'cronología: entra alguien que ya está en el campo');
select throws_ok($$ insert into eventos_partido (partido_id, minuto, tipo, equipo, jugador_id, jugador2_id) values (820, 60, 'cambio', 'propio', 804, 805) $$, 'CD400', null, 'cronología: sale alguien que no está en el campo');
select lives_ok($$ insert into eventos_partido (id, partido_id, minuto, tipo, equipo, jugador_id, jugador2_id) values (843, 820, 60, 'cambio', 'propio', 805, 804) $$, 'cronología: cambio válido');
select throws_ok($$ insert into eventos_partido (partido_id, minuto, tipo, equipo, jugador_id) values (820, 75, 'gol', 'propio', 804) $$, 'CD400', null, 'cronología: el sustituido ya no marca');
select throws_ok($$ update alineaciones set jugadores = pg_temp.slots(array[801, 802, 804]) where partido_id = 820 $$, 'CD400', null, 'cronología: la alineación no puede contradecir los eventos');
select is((select temporada_id from eventos_partido where id = 840), 800, 'evento: la temporada se toma del partido');
select lives_ok($$ update eventos_partido set temporada_id = 850 where id = 840 $$, 'evento: (intento de mover un evento a otra temporada)');
select is((select temporada_id from eventos_partido where id = 840), 800, 'evento: la temporada no se puede falsear');

-- ═══ Stats ══════════════════════════════════════════════════════════════════
select lives_ok($$ insert into estadisticas (jugador_id, partido_id, minutos, titular, goles) values (804, 820, 60, true, 1) $$, 'stats: coherentes con la cronología');
select throws_ok($$ update estadisticas set goles = 2 where jugador_id = 804 and partido_id = 820 $$, 'CD400', null, 'stats: goles distintos de la cronología');
select throws_ok($$ update estadisticas set minutos = 91 where jugador_id = 804 and partido_id = 820 $$, 'CD400', null, 'stats: más minutos que la duración');
select throws_ok($$ update estadisticas set minutos = 130 where jugador_id = 804 and partido_id = 820 $$, '23514', null, 'stats: minutos fuera de rango');
select throws_ok($$ insert into estadisticas (jugador_id, partido_id, minutos, titular) values (805, 820, 30, true) $$, 'CD400', null, 'stats: titular sin estar en la alineación');
select throws_ok($$ insert into estadisticas (jugador_id, partido_id, paradas) values (806, 820, 2) $$, 'CD400', null, 'stats: jugador no convocado');
select throws_ok($$ insert into estadisticas (jugador_id, partido_id, minutos) values (802, 822, 30) $$, 'CD400', null, 'stats: minutos sin alineación ni cambio');
select throws_ok($$ insert into estadisticas (jugador_id, partido_id, minutos) values (801, 821, 10) $$, 'CD400', null, 'stats: minutos en un partido sin jugar');
select lives_ok($$ insert into estadisticas (jugador_id, partido_id) values (801, 821) $$, 'stats: fila vacía en un partido sin jugar');
select throws_ok($$ insert into estadisticas (jugador_id, partido_id, tarjetas_amarillas, tarjetas_rojas) values (803, 822, 2, 0) $$, '23514', null, 'stats: dos amarillas sin expulsión');
select throws_ok($$ insert into estadisticas (jugador_id, partido_id, tarjetas_amarillas) values (803, 822, 3) $$, '23514', null, 'stats: tres amarillas');
select throws_ok($$ insert into estadisticas (jugador_id, partido_id, goles) values (803, 822, -1) $$, '23514', null, 'stats: goles negativos');
select throws_ok($$ insert into estadisticas (jugador_id, partido_id, goles_encajados) values (801, 822, 1) $$, 'CD400', null, 'stats: más goles encajados que los del rival');
select lives_ok($$ insert into estadisticas (jugador_id, partido_id, goles) values (804, 822, 2) $$, 'stats: sin cronología, goles hasta el resultado (2)');
select throws_ok($$ insert into estadisticas (jugador_id, partido_id, goles) values (805, 822, 1) $$, 'CD400', null, 'stats: sin cronología, no se superan los goles del equipo');
select throws_ok($$ update partidos set goles_local = 1 where id = 822 $$, 'CD400', null, 'partido: no se baja el resultado por debajo de las stats');

-- ═══ MVP ════════════════════════════════════════════════════════════════════
select throws_ok($$ update partidos set mvp_jugador_id = 803 where id = 821 $$, 'CD400', null, 'mvp: no en un partido sin jugar');
select throws_ok($$ update partidos set mvp_jugador_id = 806 where id = 820 $$, 'CD400', null, 'mvp: no a quien no participó');
select lives_ok($$ update partidos set mvp_jugador_id = 803 where id = 820 $$, 'mvp: convocado en un partido jugado');
select throws_ok($$ update partidos set convocados = '[801, 802, 803, 805]' where id = 820 $$, 'CD400', null, 'convocatoria: no se quita a quien tiene eventos');

-- ═══ Votes ══════════════════════════════════════════════════════════════════
reset role;
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000b1'); -- player 801
select lives_ok($$ insert into votos_mvp (partido_id, votante_id, votado_id) values (820, 801, 803) $$, 'voto: válido');
select throws_ok($$ insert into votos_mvp (partido_id, votante_id, votado_id) values (820, 801, 804) $$, '23505', null, 'voto: un solo voto por partido');
select throws_ok($$ update votos_mvp set votado_id = 801 where votante_id = 801 $$, 'CD400', null, 'voto: no a uno mismo');
select throws_ok($$ update votos_mvp set votado_id = 806 where votante_id = 801 $$, 'CD400', null, 'voto: no a quien no participó');
select throws_ok($$ insert into votos_mvp (partido_id, votante_id, votado_id) values (821, 801, 803) $$, 'CD400', null, 'voto: no en un partido sin jugar');
select throws_ok($$ insert into votos_mvp (partido_id, votante_id, votado_id) values (820, 802, 803) $$, '42501', null, 'voto: no en nombre de otro');
reset role;
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000b3'); -- player 807, no longer active
select throws_ok($$ insert into votos_mvp (partido_id, votante_id, votado_id) values (820, 807, 803) $$, 'CD400', null, 'voto: un jugador que ya no está en activo no vota');

-- ═══ The app's own write sequences still work ═══════════════════════════════
reset role;
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000a1'); -- admin
select lives_ok($$ insert into alineaciones (partido_id, formacion, jugadores) values (823, '4-3-3', pg_temp.slots(array[801, 802, 803])) $$, 'flujo: guardar alineación');
select lives_ok($$ update partidos set jugado = true, goles_local = 1, goles_visitante = 0 where id = 823 $$, 'flujo: marcar como jugado con resultado');
select lives_ok($$ insert into estadisticas (jugador_id, partido_id, minutos, titular) values (801, 823, 90, true), (802, 823, 90, true), (803, 823, 90, true)
                   on conflict (jugador_id, partido_id) do update set minutos = excluded.minutos, titular = excluded.titular $$, 'flujo: recálculo de minutos (upsert múltiple)');
select lives_ok($$ insert into eventos_partido (partido_id, minuto, tipo, equipo, jugador_id) values (823, 10, 'gol', 'propio', 803) $$, 'flujo: añadir gol a la cronología');
select lives_ok($$ insert into estadisticas (jugador_id, partido_id, goles) values (803, 823, 1)
                   on conflict (jugador_id, partido_id) do update set goles = excluded.goles $$, 'flujo: recálculo de goles desde la cronología');
select lives_ok($$ update partidos set jugado = false where id = 823 $$, 'flujo: volver a «pendiente»');
select lives_ok($$ update estadisticas set minutos = 0, titular = false where partido_id = 823 $$, 'flujo: el recálculo pone los minutos a 0');

-- ═══ Error messages are for people, not leaks ═══════════════════════════════
reset role;
set local role authenticated;
select pg_temp.como('00000000-0000-0000-0000-0000000000a1');
select ok(pg_temp.error_de($$ insert into eventos_partido (partido_id, minuto, tipo, equipo, jugador_id) values (820, 85, 'gol', 'propio', 802) $$)
          ~ '^CD400 Defensa Dos no puede aparecer en el 85''', 'errores: mensaje claro con nombre y minuto');
select ok(pg_temp.error_de($$ update partidos set convocados = '[999999]' where id = 823 $$)
          !~* '(public\.|validacion\.|jsonb|relation|constraint|select |partidos|convocados_)', 'errores: sin nombres de tablas, funciones ni SQL');
select ok(pg_temp.error_de($$ insert into estadisticas (jugador_id, partido_id, minutos) values (802, 822, 30) $$)
          !~* '(public\.|validacion\.|relation|constraint|estadisticas|eventos_partido)', 'errores: sin detalles internos (stats)');

-- ═══ Deleting a player keeps references clean ═══════════════════════════════
select lives_ok($$ delete from jugadores where id = 805 $$, 'borrado: se puede eliminar un jugador con eventos');
select ok(not (select convocados from partidos where id = 820) @> '805', 'borrado: sale de las convocatorias');
select ok(not (select jugadores::text from alineaciones where partido_id = 820) ~ '"jugador_id": 805\M', 'borrado: sale de las alineaciones');

select * from finish();
rollback;
