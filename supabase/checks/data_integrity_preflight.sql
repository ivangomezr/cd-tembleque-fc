-- Read-only check to run BEFORE migration 20261017180000_data_integrity.sql
-- (Supabase › SQL Editor). Lists existing rows that break the new rules.
-- Empty result = the migration will apply cleanly and validate everything.
--
-- Duplicates (marked BLOQUEA) must be fixed first: the migration stops on them.
-- The rest only produce a warning; the rule then applies to new changes and the
-- old row can be fixed whenever you like (editing it will ask you to).

with problemas(gravedad, regla, detalle) as (
  -- ── Duplicates: block the migration ──────────────────────────────────────
  select 'BLOQUEA', 'Dorsal repetido entre jugadores en activo', 'Dorsal ' || dorsal || ': ' || string_agg(nombre, ', ')
    from public.jugadores where activo and dorsal is not null group by dorsal having count(*) > 1
  union all
  select 'BLOQUEA', 'Temporadas con el mismo nombre', string_agg(nombre || ' (#' || id || ')', ', ')
    from public.temporadas group by lower(btrim(nombre)) having count(*) > 1
  union all
  select 'BLOQUEA', 'Equipos repetidos en una temporada', 'Temporada ' || temporada_id || ': ' || string_agg(nombre, ', ')
    from public.equipos_liga group by temporada_id, lower(btrim(nombre)) having count(*) > 1
  union all
  select 'BLOQUEA', 'Más de un equipo propio en una temporada', 'Temporada ' || temporada_id
    from public.equipos_liga where es_propio group by temporada_id having count(*) > 1
  union all
  select 'BLOQUEA', 'Dos partidos del club en la misma jornada', 'Temporada ' || temporada_id || ', jornada ' || jornada
    from public.partidos where not amistoso group by temporada_id, jornada having count(*) > 1
  union all
  select 'BLOQUEA', 'Enfrentamiento de liga repetido', 'Temporada ' || temporada_id || ': equipos ' || local_id || ' - ' || visitante_id
    from public.partidos_liga group by temporada_id, local_id, visitante_id having count(*) > 1

  -- ── Warnings: rule applies to new writes only until the row is fixed ─────
  union all
  select 'AVISO', 'Jugador sin posición, nombre no válido o dorsal fuera de 1-99', nombre || ' (#' || id || ')'
    from public.jugadores
   where posicion is null or btrim(coalesce(nombre, '')) = '' or char_length(nombre) > 60 or dorsal not between 1 and 99
      or estado not in ('disponible', 'lesionado', 'duda', 'sancionado', 'baja')
  union all
  select 'AVISO', 'Imagen que no es https', 'Jugador ' || nombre
    from public.jugadores where foto_url is not null and foto_url !~ '^(https://|/)'
  union all
  select 'AVISO', 'Partido sin temporada', 'Partido #' || id || ' ' || local || ' - ' || visitante
    from public.partidos where temporada_id is null
  union all
  select 'AVISO', 'Amistoso con jornada o partido de liga sin jornada', 'Partido #' || id || ' (jornada ' || jornada || ')'
    from public.partidos where (amistoso and jornada <> 0) or (not amistoso and jornada not between 1 and 99)
  union all
  select 'AVISO', 'Partido marcado como jugado con fecha futura', 'Partido #' || id || ' del ' || fecha
    from public.partidos where jugado and fecha > current_date
  union all
  select 'AVISO', 'Hora con formato no válido', 'Partido #' || id || ': ' || hora
    from public.partidos where hora is not null and hora !~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$'
  union all
  select 'AVISO', 'Evento con minuto fuera de 1-120 o añadido mayor de 15', 'Evento #' || id || ' del partido #' || partido_id
    from public.eventos_partido where minuto not between 1 and 120 or minuto_extra not between 0 and 15
  union all
  select 'AVISO', 'Estadísticas imposibles (tarjetas, minutos o contadores)', 'Jugador #' || jugador_id || ' en partido #' || partido_id
    from public.estadisticas
   where minutos not between 0 and 120 or tarjetas_amarillas not between 0 and 2 or tarjetas_rojas not between 0 and 1
      or (tarjetas_amarillas = 2 and tarjetas_rojas = 0) or least(goles, asistencias, paradas, goles_encajados) < 0
  union all
  select 'AVISO', 'Minutos en un partido no jugado', 'Jugador #' || s.jugador_id || ' en partido #' || s.partido_id
    from public.estadisticas s join public.partidos p on p.id = s.partido_id where not p.jugado and (s.minutos > 0 or s.titular)
  union all
  select 'AVISO', 'Convocatoria con jugadores que ya no existen', 'Partido #' || p.id
    from public.partidos p
   where exists (select 1 from jsonb_array_elements(p.convocados) e
                  where jsonb_typeof(e) <> 'number' or not exists (select 1 from public.jugadores j where j.id::text = e::text))
)
select * from problemas order by gravedad, regla;
