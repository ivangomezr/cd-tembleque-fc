-- =============================================================================
-- Data integrity (audit 2026-10-17)
--
-- The database is the last line of defence: every rule the app checks in the
-- browser is enforced here too, so a direct API call cannot store data the UI
-- would reject. Rules and the decisions behind them: docs/data-validation.md.
--
--   0. Unique indexes (dorsal, jornada, team names, fixtures, own team).
--   1. `validacion` schema with helpers (not exposed through the REST API).
--   2. CHECK constraints (simple bounds) — added NOT VALID, then validated when
--      the existing data allows it, so old rows never block the migration.
--   3. Validation triggers with clear, user-facing messages (SQLSTATE CD400).
--   4. Deferred checks across tables (timeline order, stats vs timeline/score).
--   5. Clean-up when a player is deleted (call-ups and lineups keep no ghost ids).
--
-- Rules apply to NEW writes. Run supabase/checks/data_integrity_preflight.sql
-- first to list existing rows that break them.
--
-- Error contract: validation failures raise SQLSTATE 'CD400' with a Spanish
-- message meant for the user and a short machine key in HINT. Constraint
-- violations (23xxx) are translated in src/lib/dbErrors.js by constraint name.
-- =============================================================================

-- ── 0. Unique indexes (first: if old data has duplicates, nothing else is applied) ──
do $$
begin
  create unique index temporadas_nombre_unico on public.temporadas (lower(btrim(nombre)));
  create unique index jugadores_dorsal_unico on public.jugadores (dorsal) where activo and dorsal is not null;
  create unique index equipos_liga_nombre_unico on public.equipos_liga (temporada_id, lower(btrim(nombre)));
  create unique index equipos_liga_un_propio on public.equipos_liga (temporada_id) where es_propio;
  create unique index partidos_jornada_unica on public.partidos (temporada_id, jornada) where not amistoso;
  create unique index partidos_liga_enfrentamiento_unico on public.partidos_liga (temporada_id, local_id, visitante_id);
exception when unique_violation then
  raise exception 'Hay datos duplicados que impiden aplicar las reglas de integridad: %', sqlerrm
    using hint = 'Ejecuta supabase/checks/data_integrity_preflight.sql, corrige los duplicados y vuelve a lanzar la migración.';
end $$;

-- ── 1. Helpers ──────────────────────────────────────────────────────────────
create schema if not exists validacion;
comment on schema validacion is 'Data validation helpers and triggers. Not exposed through PostgREST.';
revoke all on schema validacion from public;
grant usage on schema validacion to authenticated, service_role;

-- Raise a user-facing validation error
create or replace function validacion.fallo(p_mensaje text, p_clave text default null)
returns void language plpgsql as $$
begin
  raise exception using errcode = 'CD400', message = p_mensaje, hint = coalesce(p_clave, 'validacion');
end $$;

-- Required single-line text: not blank, max length, no control characters
create or replace function validacion.texto_ok(p text, p_max integer)
returns boolean language sql immutable as $$
  select p is not null and btrim(p) <> '' and char_length(p) <= p_max and p !~ '[[:cntrl:]]'
$$;

-- Optional free text (allows line breaks)
create or replace function validacion.texto_libre_ok(p text, p_max integer)
returns boolean language sql immutable as $$
  select p is null or (char_length(p) <= p_max and p !~ '[\x01-\x09\x0B\x0C\x0E-\x1F\x7F]')
$$;

-- Image URLs: https (Cloudinary) or a site-relative path (our crest). No data:, javascript:, etc.
create or replace function validacion.url_ok(p text)
returns boolean language sql immutable as $$
  select p is null or (char_length(p) <= 500 and p ~ '^(https://[^[:space:]"''<>\\]+|/[A-Za-z0-9._/-]+)$')
$$;

-- Has the match kicked off? (Spanish local time; no time → start of that day)
create or replace function validacion.ya_empezado(p_fecha date, p_hora text)
returns boolean language sql stable as $$
  select p_fecha is not null
     and p_fecha + coalesce(case when p_hora ~ '^\d{1,2}:\d{2}(:\d{2})?$' then p_hora::time end, time '00:00')
         <= (now() at time zone 'Europe/Madrid')
$$;

-- Dates of a season: año - 1 … año + 1. `año` may be the start or the end year of
-- a 2026/27 season, so the window covers both readings and still catches typos (2062).
create or replace function validacion.fecha_en_temporada(p_temporada integer, p_fecha date)
returns boolean language sql stable as $$
  select p_fecha is null or p_temporada is null
      or not exists (select 1 from public.temporadas t where t.id = p_temporada)
      or exists (select 1 from public.temporadas t
                  where t.id = p_temporada
                    and p_fecha between make_date(t."año" - 1, 1, 1) and make_date(t."año" + 1, 12, 31))
$$;

create or replace function validacion.minuto_txt(p_minuto integer, p_extra integer)
returns text language sql immutable as $$
  select p_minuto::text || case when coalesce(p_extra, 0) > 0 then '+' || p_extra else '' end || ''''
$$;

create or replace function validacion.nombre_jugador(p_id integer)
returns text language sql stable as $$
  select coalesce((select nombre from public.jugadores where id = p_id), 'Jugador ' || p_id)
$$;

-- Validates a JSON array of player ids. Returns an error message or null.
create or replace function validacion.ids_jugadores_error(p jsonb, p_max integer, p_que text)
returns text language plpgsql stable as $$
declare n integer; v_id integer;
begin
  if p is null or jsonb_typeof(p) <> 'array' then return format('La lista de %s no es válida.', p_que); end if;
  if jsonb_array_length(p) > p_max then return format('La lista de %s admite como máximo %s jugadores.', p_que, p_max); end if;
  if exists (select 1 from jsonb_array_elements(p) e where jsonb_typeof(e) <> 'number' or e::text !~ '^[1-9][0-9]{0,8}$') then
    return format('La lista de %s contiene identificadores no válidos.', p_que);
  end if;
  select count(*) - count(distinct e::text) into n from jsonb_array_elements(p) e;
  if n > 0 then return format('Hay jugadores repetidos en la lista de %s.', p_que); end if;
  select (e::text)::integer into v_id from jsonb_array_elements(p) e
   where not exists (select 1 from public.jugadores j where j.id = (e::text)::integer) limit 1;
  if v_id is not null then return format('La lista de %s incluye un jugador que no existe (#%s).', p_que, v_id); end if;
  return null;
end $$;

-- Player ids of a stored lineup (slots {linea, posicion, jugador_id} or legacy plain ids)
create or replace function validacion.titulares(p_partido_id integer)
returns integer[] language sql stable as $$
  select coalesce(array_agg(x.id), '{}')
    from public.alineaciones a,
         lateral (select case
                           when jsonb_typeof(e) = 'object' and e->>'jugador_id' ~ '^[0-9]{1,9}$' then (e->>'jugador_id')::integer
                           when jsonb_typeof(e) = 'number' and e::text ~ '^[0-9]{1,9}$' then (e::text)::integer
                         end as id
                    from jsonb_array_elements(case when jsonb_typeof(a.jugadores) = 'array' then a.jugadores else '[]'::jsonb end) e) x
   where a.partido_id = p_partido_id and x.id is not null
$$;

-- Goals from our point of view (null when the season has no own team to tell the sides apart)
create or replace function validacion.marcador(p_partido_id integer, out nuestros integer, out rivales integer)
language sql stable as $$
  select case when lower(btrim(p.local)) = lower(btrim(e.nombre)) then p.goles_local else p.goles_visitante end,
         case when lower(btrim(p.local)) = lower(btrim(e.nombre)) then p.goles_visitante else p.goles_local end
    from public.partidos p
    join public.equipos_liga e on e.temporada_id = p.temporada_id and e.es_propio
   where p.id = p_partido_id
$$;

create or replace function validacion.duracion(p_temporada integer)
returns integer language sql stable as $$
  select coalesce((select duracion_partido from public.temporadas where id = p_temporada), 90)
$$;

-- ── 2. CHECK constraints ────────────────────────────────────────────────────
-- Seasons
alter table public.temporadas
  add constraint temporadas_nombre_valido check (validacion.texto_ok(nombre, 80)) not valid,
  add constraint temporadas_anio_rango check ("año" between 2000 and 2100) not valid,
  add constraint temporadas_zonas_rango check (zona_ascenso between 0 and 30 and zona_promocion between 0 and 30 and zona_descenso between 0 and 30) not valid,
  add constraint temporadas_duracion_rango check (duracion_partido between 1 and 120) not valid;

-- Players
alter table public.jugadores
  add constraint jugadores_nombre_valido check (validacion.texto_ok(nombre, 60)) not valid,
  add constraint jugadores_posicion_obligatoria check (posicion is not null) not valid,
  add constraint jugadores_dorsal_rango check (dorsal is null or dorsal between 1 and 99) not valid,
  add constraint jugadores_estado_valido check (estado in ('disponible', 'lesionado', 'duda', 'sancionado', 'baja')) not valid,
  add constraint jugadores_foto_url_valida check (validacion.url_ok(foto_url)) not valid;

alter table public.jugadores_privado
  add constraint jugadores_privado_estado_desc_valido check (validacion.texto_libre_ok(estado_desc, 280)) not valid;

-- League teams
alter table public.equipos_liga
  add constraint equipos_liga_nombre_valido check (validacion.texto_ok(nombre, 80)) not valid,
  add constraint equipos_liga_nombre_corto_valido check (nombre_corto is null or validacion.texto_ok(nombre_corto, 16)) not valid,
  add constraint equipos_liga_sancion_rango check (sancion_puntos between 0 and 99) not valid,
  add constraint equipos_liga_escudo_url_valida check (validacion.url_ok(escudo_url)) not valid;

-- League fixtures between other teams
alter table public.partidos_liga
  add constraint partidos_liga_jornada_rango check (jornada between 1 and 99) not valid,
  add constraint partidos_liga_goles_rango check (goles_local between 0 and 99 and goles_visitante between 0 and 99) not valid;

-- Our matches
alter table public.partidos
  add constraint partidos_temporada_obligatoria check (temporada_id is not null) not valid,
  add constraint partidos_jornada_valida check ((amistoso and jornada = 0) or (not amistoso and jornada between 1 and 99)) not valid,
  add constraint partidos_goles_rango check (goles_local between 0 and 99 and goles_visitante between 0 and 99) not valid,
  add constraint partidos_hora_formato check (hora is null or hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$') not valid,
  add constraint partidos_campo_valido check (campo is null or validacion.texto_ok(campo, 120)) not valid,
  add constraint partidos_escudo_url_valida check (validacion.url_ok(escudo_rival_url)) not valid,
  add constraint partidos_convocados_array check (jsonb_typeof(convocados) = 'array') not valid;

-- Lineups
alter table public.alineaciones
  add constraint alineaciones_jugadores_array check (jsonb_typeof(jugadores) = 'array' and jsonb_array_length(jugadores) <= 11) not valid;

-- Timeline: absolute bounds (the per-match limit depends on the season, see trigger)
alter table public.eventos_partido
  add constraint eventos_partido_minuto_rango check (minuto between 1 and 120) not valid,
  add constraint eventos_partido_extra_rango check (minuto_extra between 0 and 15) not valid,
  add constraint eventos_partido_nombre_rival_valido check (nombre_rival is null or validacion.texto_ok(nombre_rival, 60)) not valid,
  add constraint eventos_partido_jugadores_distintos check (jugador_id is null or jugador2_id is null or jugador_id <> jugador2_id) not valid;

-- Per-player match stats
alter table public.estadisticas
  add constraint estadisticas_minutos_rango check (minutos between 0 and 120) not valid,
  add constraint estadisticas_contadores_rango check (goles between 0 and 99 and asistencias between 0 and 99
    and paradas between 0 and 99 and goles_encajados between 0 and 99) not valid,
  add constraint estadisticas_tarjetas_rango check (tarjetas_amarillas between 0 and 2 and tarjetas_rojas between 0 and 1) not valid,
  -- a second yellow is a sending-off (the app stores it as 2 yellows + 1 red)
  add constraint estadisticas_doble_amarilla_expulsa check (tarjetas_amarillas < 2 or tarjetas_rojas = 1) not valid;

-- Sponsors
alter table public.patrocinadores
  add constraint patrocinadores_nombre_valido check (nombre is null or validacion.texto_ok(nombre, 80)) not valid,
  add constraint patrocinadores_imagen_url_valida check (validacion.url_ok(imagen_url)) not valid;

-- ── 3. Row validation triggers ──────────────────────────────────────────────
-- Triggers fired by other triggers or by ON DELETE actions (pg_trigger_depth() > 1)
-- are maintenance, not user input: they only derive values and skip validation.

-- Seasons
create or replace function validacion.temporadas_validar()
returns trigger language plpgsql set search_path = public as $$
declare v_fecha date;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  new.nombre := btrim(new.nombre);
  if tg_op = 'UPDATE' and new."año" is distinct from old."año" then
    select f into v_fecha from (
      select fecha as f from partidos where temporada_id = new.id
      union all select fecha from partidos_liga where temporada_id = new.id and fecha is not null) x
     where f not between make_date(new."año" - 1, 1, 1) and make_date(new."año" + 1, 12, 31) limit 1;
    if v_fecha is not null then
      perform validacion.fallo(format('Con el año %s, el partido del %s quedaría fuera de la temporada.', new."año", to_char(v_fecha, 'DD/MM/YYYY')), 'temporada_fechas');
    end if;
  end if;
  return new;
end $$;
create trigger validar before insert or update on public.temporadas
  for each row execute function validacion.temporadas_validar();

-- Players
create or replace function validacion.jugadores_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  new.nombre := btrim(new.nombre);
  if not validacion.texto_ok(new.nombre, 60) then
    perform validacion.fallo('El nombre del jugador es obligatorio (máximo 60 caracteres).', 'jugador_nombre');
  end if;
  if new.posicion is null then perform validacion.fallo('Elige la posición del jugador.', 'jugador_posicion'); end if;
  return new;
end $$;
create trigger validar before insert or update on public.jugadores
  for each row execute function validacion.jugadores_validar();

-- League teams
create or replace function validacion.equipos_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 or not exists (select 1 from temporadas where id = old.temporada_id) then return old; end if;
    if old.es_propio then perform validacion.fallo('No se puede eliminar el equipo del club.', 'equipo_propio'); end if;
    if exists (select 1 from partidos p where p.temporada_id = old.temporada_id and not p.amistoso
                 and lower(btrim(old.nombre)) in (lower(btrim(p.local)), lower(btrim(p.visitante)))) then
      perform validacion.fallo(format('%s tiene partidos de liga con el club. Elimina o cambia esos partidos antes.', old.nombre), 'equipo_con_partidos');
    end if;
    return old;
  end if;
  if pg_trigger_depth() > 1 then return new; end if;
  new.nombre := btrim(new.nombre);
  new.nombre_corto := nullif(btrim(new.nombre_corto), '');
  if tg_op = 'UPDATE' then
    if new.es_propio is distinct from old.es_propio or new.temporada_id is distinct from old.temporada_id then
      perform validacion.fallo('No se puede cambiar la temporada ni el tipo de un equipo.', 'equipo_inmutable');
    end if;
    if old.es_propio and new.nombre is distinct from old.nombre then
      perform validacion.fallo('El nombre del club no se puede cambiar desde aquí.', 'equipo_propio');
    end if;
  end if;
  return new;
end $$;
create trigger validar before insert or update or delete on public.equipos_liga
  for each row execute function validacion.equipos_validar();

-- League fixtures between other teams
create or replace function validacion.partidos_liga_validar()
returns trigger language plpgsql set search_path = public as $$
declare v_l record; v_v record; v_dup text;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  select id, nombre, temporada_id, es_propio into v_l from equipos_liga where id = new.local_id;
  select id, nombre, temporada_id, es_propio into v_v from equipos_liga where id = new.visitante_id;
  if v_l.id is null or v_v.id is null then return new; end if; -- the foreign key reports it
  if v_l.temporada_id <> new.temporada_id or v_v.temporada_id <> new.temporada_id then
    perform validacion.fallo('Los dos equipos deben ser de la misma temporada que el partido.', 'liga_temporada');
  end if;
  if v_l.es_propio or v_v.es_propio then
    perform validacion.fallo('Los partidos del club se registran en Partidos, no en la liga.', 'liga_equipo_propio');
  end if;
  if tg_op = 'UPDATE' and (new.jornada, new.local_id, new.visitante_id, new.temporada_id)
                           is not distinct from (old.jornada, old.local_id, old.visitante_id, old.temporada_id) then
    v_dup := null; -- teams and matchday unchanged
  else
  -- a team plays once per matchday (here or in one of our matches)
  select e.nombre into v_dup
    from partidos_liga pl join equipos_liga e on e.id in (pl.local_id, pl.visitante_id)
   where pl.temporada_id = new.temporada_id and pl.jornada = new.jornada and pl.id is distinct from new.id
     and e.id in (new.local_id, new.visitante_id) limit 1;
  if v_dup is null then
    select e.nombre into v_dup
      from partidos p join equipos_liga e on e.temporada_id = p.temporada_id
     where p.temporada_id = new.temporada_id and not p.amistoso and p.jornada = new.jornada
       and e.id in (new.local_id, new.visitante_id)
       and lower(btrim(e.nombre)) in (lower(btrim(p.local)), lower(btrim(p.visitante))) limit 1;
  end if;
  end if;
  if v_dup is not null then
    perform validacion.fallo(format('%s ya juega otro partido en la jornada %s.', v_dup, new.jornada), 'liga_jornada_ocupada');
  end if;
  if (tg_op = 'INSERT' or new.fecha is distinct from old.fecha or new.temporada_id is distinct from old.temporada_id)
     and not validacion.fecha_en_temporada(new.temporada_id, new.fecha) then
    perform validacion.fallo('La fecha queda fuera de la temporada.', 'fecha_fuera_temporada');
  end if;
  if new.jugado and (tg_op = 'INSERT' or not old.jugado or new.fecha is distinct from old.fecha)
     and new.fecha is not null and new.fecha > (now() at time zone 'Europe/Madrid')::date then
    perform validacion.fallo('No se puede marcar como jugado un partido con fecha futura.', 'jugado_futuro');
  end if;
  return new;
end $$;
create trigger validar before insert or update on public.partidos_liga
  for each row execute function validacion.partidos_liga_validar();

-- Our matches
create or replace function validacion.partidos_validar()
returns trigger language plpgsql set search_path = public as $$
declare
  ins boolean := tg_op = 'INSERT';
  v_propio text;
  v_rival text;
  v_err text;
  v_id integer;
  v_m record;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  new.local := btrim(new.local);
  new.visitante := btrim(new.visitante);
  new.campo := nullif(btrim(new.campo), '');

  if ins or new.local is distinct from old.local or new.visitante is distinct from old.visitante
     or new.temporada_id is distinct from old.temporada_id or new.amistoso is distinct from old.amistoso
     or new.jornada is distinct from old.jornada then
    if not validacion.texto_ok(new.local, 80) or not validacion.texto_ok(new.visitante, 80) then
      perform validacion.fallo('Indica el equipo local y el visitante (máximo 80 caracteres).', 'partido_equipos');
    end if;
    if lower(new.local) = lower(new.visitante) then
      perform validacion.fallo('Un equipo no puede jugar contra sí mismo.', 'partido_mismo_equipo');
    end if;
    select nombre into v_propio from equipos_liga where temporada_id = new.temporada_id and es_propio;
    if v_propio is not null then
      if lower(btrim(v_propio)) not in (lower(new.local), lower(new.visitante)) then
        perform validacion.fallo(format('Uno de los dos equipos debe ser %s.', v_propio), 'partido_sin_club');
      end if;
      v_rival := case when lower(new.local) = lower(btrim(v_propio)) then new.visitante else new.local end;
      if not new.amistoso then
        if not exists (select 1 from equipos_liga where temporada_id = new.temporada_id and not es_propio
                         and lower(btrim(nombre)) = lower(v_rival)) then
          perform validacion.fallo(format('«%s» no está entre los equipos del grupo. Añádelo antes en Liga › Equipos.', v_rival), 'partido_rival_desconocido');
        end if;
        if exists (select 1 from partidos_liga pl join equipos_liga e on e.id in (pl.local_id, pl.visitante_id)
                    where pl.temporada_id = new.temporada_id and pl.jornada = new.jornada
                      and lower(btrim(e.nombre)) = lower(v_rival)) then
          perform validacion.fallo(format('%s ya juega otro partido en la jornada %s.', v_rival, new.jornada), 'liga_jornada_ocupada');
        end if;
      end if;
    end if;
  end if;

  if (ins or new.fecha is distinct from old.fecha or new.temporada_id is distinct from old.temporada_id)
     and not validacion.fecha_en_temporada(new.temporada_id, new.fecha) then
    perform validacion.fallo('La fecha del partido queda fuera de la temporada.', 'fecha_fuera_temporada');
  end if;

  if new.jugado and (ins or not old.jugado or new.fecha is distinct from old.fecha or new.hora is distinct from old.hora)
     and not validacion.ya_empezado(new.fecha, new.hora) then
    perform validacion.fallo('No se puede marcar como jugado un partido que todavía no ha empezado.', 'jugado_futuro');
  end if;

  if ins or new.convocados is distinct from old.convocados then
    v_err := validacion.ids_jugadores_error(new.convocados, 50, 'convocados');
    if v_err is not null then perform validacion.fallo(v_err, 'convocados'); end if;
    if not ins and jsonb_array_length(new.convocados) > 0 then
      -- nobody with a role in the match may be left out of the call-up
      select x.id into v_id from (
        select unnest(validacion.titulares(new.id)) as id
        union select jugador_id from eventos_partido where partido_id = new.id and jugador_id is not null
                  and (equipo = 'propio' or tipo = 'gol_propia')
        union select jugador2_id from eventos_partido where partido_id = new.id and jugador2_id is not null and equipo = 'propio'
        union select jugador_id from estadisticas where partido_id = new.id
                  and (minutos > 0 or titular or goles > 0 or asistencias > 0 or tarjetas_amarillas > 0 or tarjetas_rojas > 0
                       or paradas > 0 or goles_encajados > 0)
      ) x where not new.convocados @> to_jsonb(x.id) limit 1;
      if v_id is not null then
        perform validacion.fallo(format('%s tiene alineación, eventos o estadísticas en este partido: no se puede quitar de la convocatoria.',
                                        validacion.nombre_jugador(v_id)), 'convocados_en_uso');
      end if;
    end if;
  end if;

  if new.mvp_jugador_id is not null and (ins or new.mvp_jugador_id is distinct from old.mvp_jugador_id or new.jugado is distinct from old.jugado) then
    if not new.jugado then
      perform validacion.fallo('Solo se puede elegir MVP en un partido jugado.', 'mvp');
    end if;
    if jsonb_array_length(new.convocados) > 0 and not new.convocados @> to_jsonb(new.mvp_jugador_id)
       and not exists (select 1 from estadisticas where partido_id = new.id and jugador_id = new.mvp_jugador_id and minutos > 0) then
      perform validacion.fallo(format('%s no participó en este partido.', validacion.nombre_jugador(new.mvp_jugador_id)), 'mvp');
    end if;
  end if;

  -- Lowering the score below the goals already credited to players (stats without timeline)
  if not ins and new.jugado and (new.goles_local is distinct from old.goles_local or new.goles_visitante is distinct from old.goles_visitante)
     and not exists (select 1 from eventos_partido where partido_id = new.id) then
    select case when lower(new.local) = lower(btrim(e.nombre)) then new.goles_local else new.goles_visitante end as nuestros
      into v_m from equipos_liga e where e.temporada_id = new.temporada_id and e.es_propio;
    if v_m.nuestros is not null and (select coalesce(sum(goles), 0) from estadisticas where partido_id = new.id) > v_m.nuestros then
      perform validacion.fallo('Las estadísticas de los jugadores suman más goles que el nuevo resultado. Corrígelas primero.', 'goles_estadisticas');
    end if;
  end if;
  return new;
end $$;
create trigger validar before insert or update on public.partidos
  for each row execute function validacion.partidos_validar();

-- Child rows inherit the season of their match (a client cannot file them elsewhere)
create or replace function validacion.heredar_temporada()
returns trigger language plpgsql set search_path = public as $$
begin
  select temporada_id into new.temporada_id from partidos where id = new.partido_id;
  return new;
end $$;
create trigger a_heredar_temporada before insert or update on public.alineaciones
  for each row execute function validacion.heredar_temporada();
create trigger a_heredar_temporada before insert or update on public.eventos_partido
  for each row execute function validacion.heredar_temporada();
create trigger a_heredar_temporada before insert or update on public.estadisticas
  for each row execute function validacion.heredar_temporada();
create trigger a_heredar_temporada before insert or update on public.votos_mvp
  for each row execute function validacion.heredar_temporada();

-- Lineups
create or replace function validacion.alineaciones_validar()
returns trigger language plpgsql set search_path = public as $$
declare v_conv jsonb; v_id integer; v_ids jsonb;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.formacion not in ('4-4-2', '4-3-3', '4-2-3-1', '4-1-4-1', '4-5-1', '3-5-2', '3-4-3', '5-3-2') then
    perform validacion.fallo('Formación no válida.', 'alineacion_formacion');
  end if;
  if jsonb_typeof(new.jugadores) <> 'array' or jsonb_array_length(new.jugadores) > 11 then
    perform validacion.fallo('La alineación debe tener como máximo 11 posiciones.', 'alineacion_formato');
  end if;
  if exists (select 1 from jsonb_array_elements(new.jugadores) s
              where jsonb_typeof(s) <> 'object'
                 or (s - 'linea' - 'posicion' - 'jugador_id') <> '{}'::jsonb
                 or coalesce(s->>'linea', '') !~ '^[0-5]$'
                 or coalesce(s->>'posicion', '') !~ '^([0-9]|10)$'
                 or coalesce(jsonb_typeof(s->'jugador_id'), 'null') not in ('null', 'number')
                 or (jsonb_typeof(s->'jugador_id') = 'number' and s->>'jugador_id' !~ '^[1-9][0-9]{0,8}$')) then
    perform validacion.fallo('La alineación tiene posiciones no válidas.', 'alineacion_formato');
  end if;
  if (select count(*) <> count(distinct (s->>'linea') || ':' || (s->>'posicion')) from jsonb_array_elements(new.jugadores) s) then
    perform validacion.fallo('Hay dos jugadores en la misma posición.', 'alineacion_formato');
  end if;
  select coalesce(jsonb_agg(s->'jugador_id'), '[]') into v_ids
    from jsonb_array_elements(new.jugadores) s where jsonb_typeof(s->'jugador_id') = 'number';
  if (select count(*) <> count(distinct e::text) from jsonb_array_elements(v_ids) e) then
    perform validacion.fallo('Un jugador aparece dos veces en la alineación.', 'alineacion_duplicado');
  end if;
  if validacion.ids_jugadores_error(v_ids, 11, 'titulares') is not null then
    perform validacion.fallo(validacion.ids_jugadores_error(v_ids, 11, 'titulares'), 'alineacion_jugador');
  end if;
  select convocados into v_conv from partidos where id = new.partido_id;
  if jsonb_array_length(coalesce(v_conv, '[]')) > 0 then
    select (e::text)::integer into v_id from jsonb_array_elements(v_ids) e where not v_conv @> e limit 1;
    if v_id is not null then
      perform validacion.fallo(format('%s no está convocado para este partido.', validacion.nombre_jugador(v_id)), 'no_convocado');
    end if;
  end if;
  return new;
end $$;
create trigger validar before insert or update on public.alineaciones
  for each row execute function validacion.alineaciones_validar();

-- Timeline events: shape, minute and who can be involved
create or replace function validacion.eventos_validar()
returns trigger language plpgsql set search_path = public as $$
declare
  p record;
  v_dur integer;
  v_max integer;
  v_extra_ok integer[];
  ours boolean := new.equipo = 'propio';
  v_id integer;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  select id, fecha, hora, amistoso, convocados, temporada_id into p from partidos where id = new.partido_id;
  if p.id is null then return new; end if; -- the foreign key reports it
  new.nombre_rival := nullif(btrim(new.nombre_rival), '');

  if not validacion.ya_empezado(p.fecha, p.hora) then
    perform validacion.fallo('No se pueden registrar eventos de un partido que todavía no ha empezado.', 'evento_futuro');
  end if;

  -- Minute: league matches have no extra time; friendlies may have 2 × 15'
  v_dur := validacion.duracion(p.temporada_id);
  v_max := case when p.amistoso then v_dur + 30 else v_dur end;
  if new.minuto < 1 or new.minuto > least(v_max, 120) then
    perform validacion.fallo(format('El minuto debe estar entre 1 y %s. El tiempo añadido se indica aparte (%s+2).', least(v_max, 120), v_dur), 'evento_minuto');
  end if;
  v_extra_ok := array[v_dur / 2, (v_dur + 1) / 2, v_dur] || case when p.amistoso then array[v_dur + 15, v_dur + 30] else '{}'::integer[] end;
  if new.minuto_extra > 0 and not new.minuto = any (v_extra_ok) then
    perform validacion.fallo(format('El tiempo añadido solo existe al final de cada parte (%s+, %s+).', v_dur / 2, v_dur), 'evento_minuto');
  end if;

  -- Who must / must not be filled in (see src/lib/timeline.js)
  if ours then
    if new.tipo = 'gol_propia' then
      if new.jugador_id is not null then
        perform validacion.fallo('En un gol en propia del rival no se indica jugador nuestro como autor.', 'evento_forma');
      end if;
    elsif new.jugador_id is null then
      perform validacion.fallo(case when new.tipo = 'cambio' then 'Indica el jugador que entra.' else 'Indica el jugador.' end, 'evento_forma');
    end if;
    if new.tipo = 'cambio' and new.jugador2_id is null then
      perform validacion.fallo('Indica el jugador que sale.', 'evento_forma');
    end if;
    if new.jugador2_id is not null and new.tipo not in ('cambio', 'gol', 'gol_penalti', 'gol_propia') then
      perform validacion.fallo('Este tipo de evento no lleva segundo jugador.', 'evento_forma');
    end if;
    if new.nombre_rival is not null and new.tipo <> 'gol_propia' then
      perform validacion.fallo('Este evento es de un jugador nuestro: no lleva nombre de rival.', 'evento_forma');
    end if;
  else
    if new.jugador2_id is not null or (new.jugador_id is not null and new.tipo <> 'gol_propia') then
      perform validacion.fallo('Los eventos del rival no pueden llevar jugadores de nuestra plantilla.', 'evento_forma');
    end if;
    if new.tipo = 'gol_propia' then
      if new.jugador_id is null then
        perform validacion.fallo('Indica qué jugador nuestro marcó en propia puerta.', 'evento_forma');
      end if;
      if new.nombre_rival is not null then
        perform validacion.fallo('Un gol en propia nuestro no lleva nombre de rival.', 'evento_forma');
      end if;
    end if;
  end if;

  -- Our players must be in the call-up (when there is one)
  if jsonb_array_length(coalesce(p.convocados, '[]')) > 0 then
    select x into v_id from unnest(array[new.jugador_id, new.jugador2_id]) x
     where x is not null and not p.convocados @> to_jsonb(x) limit 1;
    if v_id is not null then
      perform validacion.fallo(format('%s no está convocado para este partido.', validacion.nombre_jugador(v_id)), 'no_convocado');
    end if;
  end if;
  return new;
end $$;
create trigger validar before insert or update on public.eventos_partido
  for each row execute function validacion.eventos_validar();

-- MVP votes (identity is enforced by RLS; this adds the sporting rules for everyone)
create or replace function validacion.votos_validar()
returns trigger language plpgsql set search_path = public as $$
declare p record;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  select id, jugado, convocados into p from partidos where id = new.partido_id;
  if p.id is null then return new; end if;
  if not p.jugado then perform validacion.fallo('Solo se vota en partidos ya jugados.', 'voto_partido'); end if;
  if new.votante_id = new.votado_id then perform validacion.fallo('No puedes votarte a ti mismo.', 'voto_propio'); end if;
  if not exists (select 1 from jugadores where id = new.votante_id and activo) then
    perform validacion.fallo('Solo pueden votar los jugadores en activo.', 'voto_votante');
  end if;
  if not (p.convocados @> to_jsonb(new.votado_id)
          or exists (select 1 from estadisticas e where e.partido_id = p.id and e.jugador_id = new.votado_id and e.minutos > 0)) then
    perform validacion.fallo(format('%s no participó en este partido.', validacion.nombre_jugador(new.votado_id)), 'voto_votado');
  end if;
  return new;
end $$;
create trigger validar before insert or update on public.votos_mvp
  for each row execute function validacion.votos_validar();

-- ── 4. Deferred cross-table checks (run at the end of each request) ─────────

-- Replays the timeline of a match in order and rejects impossible sequences
create or replace function validacion.cronologia(p_partido_id integer)
returns void language plpgsql set search_path = public as $$
declare
  e record;
  v_conocida boolean := cardinality(validacion.titulares(p_partido_id)) > 0;
  v_campo integer[] := validacion.titulares(p_partido_id);
  v_expulsado jsonb := '{}';   -- player id → time of sending-off
  v_amarillas jsonb := '{}';   -- player id → yellow cards so far
  v_t integer;
  v_pid integer;
  v_min text;
begin
  for e in select * from eventos_partido where partido_id = p_partido_id
            order by minuto, minuto_extra, created_at, id loop
    v_t := e.minuto * 100 + e.minuto_extra;
    v_min := validacion.minuto_txt(e.minuto, e.minuto_extra);
    -- nobody acts after being sent off
    foreach v_pid in array array_remove(case
        when e.equipo = 'propio' then array[e.jugador_id, e.jugador2_id]
        when e.tipo = 'gol_propia' then array[e.jugador_id] else '{}'::integer[] end, null) loop
      if v_expulsado ? v_pid::text and v_t > (v_expulsado->>v_pid::text)::integer then
        perform validacion.fallo(format('%s no puede aparecer en el %s: ya había sido expulsado.', validacion.nombre_jugador(v_pid), v_min), 'cronologia_expulsado');
      end if;
    end loop;

    if e.equipo = 'propio' and e.jugador_id is not null then
      v_pid := e.jugador_id;
      case e.tipo
        when 'amarilla' then
          if coalesce((v_amarillas->>v_pid::text)::integer, 0) >= 1 then
            perform validacion.fallo(format('%s ya tenía una amarilla: la del %s regístrala como «2ª amarilla».', validacion.nombre_jugador(v_pid), v_min), 'cronologia_amarilla');
          end if;
          v_amarillas := v_amarillas || jsonb_build_object(v_pid::text, 1);
        when 'segunda_amarilla' then
          if coalesce((v_amarillas->>v_pid::text)::integer, 0) <> 1 then
            perform validacion.fallo(format('%s no tiene una amarilla anterior al %s.', validacion.nombre_jugador(v_pid), v_min), 'cronologia_amarilla');
          end if;
          if v_expulsado ? v_pid::text then
            perform validacion.fallo(format('%s ya había sido expulsado.', validacion.nombre_jugador(v_pid)), 'cronologia_expulsado');
          end if;
          v_amarillas := v_amarillas || jsonb_build_object(v_pid::text, 2);
          v_expulsado := v_expulsado || jsonb_build_object(v_pid::text, v_t);
          v_campo := array_remove(v_campo, v_pid);
        when 'roja' then
          if v_expulsado ? v_pid::text then
            perform validacion.fallo(format('%s ya había sido expulsado.', validacion.nombre_jugador(v_pid)), 'cronologia_expulsado');
          end if;
          v_expulsado := v_expulsado || jsonb_build_object(v_pid::text, v_t);
          v_campo := array_remove(v_campo, v_pid);
        when 'cambio' then
          if v_conocida and e.jugador2_id is not null and not e.jugador2_id = any (v_campo) then
            perform validacion.fallo(format('%s no estaba en el campo en el %s para ser sustituido.', validacion.nombre_jugador(e.jugador2_id), v_min), 'cronologia_cambio');
          end if;
          if v_conocida and e.jugador_id = any (v_campo) then
            perform validacion.fallo(format('%s ya estaba en el campo en el %s.', validacion.nombre_jugador(e.jugador_id), v_min), 'cronologia_cambio');
          end if;
          v_campo := array_append(array_remove(v_campo, e.jugador2_id), e.jugador_id);
        else -- gol, gol_penalti, penalti_fallado: must be playing
          foreach v_pid in array array_remove(array[e.jugador_id, e.jugador2_id], null) loop
            if v_conocida and not v_pid = any (v_campo) then
              perform validacion.fallo(format('%s no estaba en el campo en el %s.', validacion.nombre_jugador(v_pid), v_min), 'cronologia_en_campo');
            end if;
          end loop;
      end case;
    elsif e.equipo = 'propio' and e.tipo = 'gol_propia' and e.jugador2_id is not null then
      if v_conocida and not e.jugador2_id = any (v_campo) then
        perform validacion.fallo(format('%s no estaba en el campo en el %s.', validacion.nombre_jugador(e.jugador2_id), v_min), 'cronologia_en_campo');
      end if;
    elsif e.equipo = 'rival' and e.tipo = 'gol_propia' and e.jugador_id is not null then
      if v_conocida and not e.jugador_id = any (v_campo) then
        perform validacion.fallo(format('%s no estaba en el campo en el %s.', validacion.nombre_jugador(e.jugador_id), v_min), 'cronologia_en_campo');
      end if;
    end if;
  end loop;
end $$;

create or replace function validacion.cronologia_trigger()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op <> 'DELETE' then perform validacion.cronologia(new.partido_id); end if;
  if tg_op <> 'INSERT' and old.partido_id is distinct from new.partido_id then perform validacion.cronologia(old.partido_id); end if;
  return null;
end $$;
-- Deleting an event can also break the order (e.g. removing the first yellow before a second one)
create or replace function validacion.cronologia_borrado()
returns trigger language plpgsql set search_path = public as $$
begin
  if exists (select 1 from partidos where id = old.partido_id) then perform validacion.cronologia(old.partido_id); end if;
  return null;
end $$;
create constraint trigger cronologia after insert or update on public.eventos_partido
  deferrable initially deferred for each row execute function validacion.cronologia_trigger();
create constraint trigger cronologia_borrado after delete on public.eventos_partido
  deferrable initially deferred for each row execute function validacion.cronologia_borrado();
create constraint trigger cronologia after insert or update on public.alineaciones
  deferrable initially deferred for each row execute function validacion.cronologia_trigger();

-- Per-player stats against the match, the lineup, the timeline and the score
create or replace function validacion.estadisticas_comprobar()
returns trigger language plpgsql set search_path = public as $$
declare
  s record;
  p record;
  v_nombre text;
  v_titulares integer[];
  v_eventos boolean;
  d record;
  m record;
begin
  select * into s from estadisticas where id = new.id;
  if s.id is null then return null; end if; -- deleted in the same request
  select * into p from partidos where id = s.partido_id;
  if p.id is null then return null; end if;
  v_nombre := validacion.nombre_jugador(s.jugador_id);

  if not p.jugado and (s.minutos > 0 or s.titular) then
    perform validacion.fallo('Un partido sin jugar no puede tener minutos ni titulares.', 'stats_no_jugado');
  end if;
  if s.minutos > validacion.duracion(p.temporada_id) then
    perform validacion.fallo(format('%s: los minutos superan la duración del partido (%s).', v_nombre, validacion.duracion(p.temporada_id)), 'stats_minutos');
  end if;
  if jsonb_array_length(p.convocados) > 0 and not p.convocados @> to_jsonb(s.jugador_id)
     and (s.minutos > 0 or s.titular or s.goles > 0 or s.asistencias > 0 or s.tarjetas_amarillas > 0
          or s.tarjetas_rojas > 0 or s.paradas > 0 or s.goles_encajados > 0) then
    perform validacion.fallo(format('%s no está convocado para este partido.', v_nombre), 'no_convocado');
  end if;

  v_titulares := validacion.titulares(p.id);
  if s.titular and not s.jugador_id = any (v_titulares) then
    perform validacion.fallo(format('%s figura como titular pero no está en la alineación.', v_nombre), 'stats_titular');
  end if;
  if s.minutos > 0 and not s.jugador_id = any (v_titulares)
     and not exists (select 1 from eventos_partido where partido_id = p.id and equipo = 'propio' and tipo = 'cambio' and jugador_id = s.jugador_id) then
    perform validacion.fallo(format('%s tiene minutos pero no estaba en la alineación ni entró en un cambio.', v_nombre), 'stats_minutos');
  end if;

  v_eventos := exists (select 1 from eventos_partido where partido_id = p.id);
  if v_eventos then
    -- Same derivation as statsFromEvents() in src/lib/timeline.js
    select count(*) filter (where equipo = 'propio' and tipo in ('gol', 'gol_penalti') and jugador_id = s.jugador_id) as goles,
           count(*) filter (where equipo = 'propio' and tipo in ('gol', 'gol_penalti', 'gol_propia') and jugador2_id = s.jugador_id) as asistencias,
           count(*) filter (where equipo = 'propio' and tipo in ('amarilla', 'segunda_amarilla') and jugador_id = s.jugador_id) as amarillas,
           count(*) filter (where equipo = 'propio' and tipo in ('roja', 'segunda_amarilla') and jugador_id = s.jugador_id) as rojas
      into d from eventos_partido where partido_id = p.id;
    if (s.goles, s.asistencias, s.tarjetas_amarillas, s.tarjetas_rojas) is distinct from (d.goles::int, d.asistencias::int, d.amarillas::int, d.rojas::int) then
      perform validacion.fallo(format('%s: goles, asistencias y tarjetas deben coincidir con la cronología del partido.', v_nombre), 'stats_cronologia');
    end if;
  end if;

  select * into m from validacion.marcador(p.id);
  if m.nuestros is not null and p.jugado then
    if s.goles_encajados > m.rivales then
      perform validacion.fallo(format('%s: el equipo solo encajó %s goles.', v_nombre, m.rivales), 'stats_encajados');
    end if;
    if not v_eventos then
      if (select sum(goles) from estadisticas where partido_id = p.id) > m.nuestros then
        perform validacion.fallo(format('Los jugadores suman más goles que los que marcó el equipo (%s).', m.nuestros), 'stats_goles');
      end if;
      if (select sum(asistencias) from estadisticas where partido_id = p.id) > m.nuestros then
        perform validacion.fallo(format('Las asistencias no pueden superar los goles del equipo (%s).', m.nuestros), 'stats_asistencias');
      end if;
    end if;
  end if;
  return null;
end $$;
create constraint trigger comprobar after insert or update on public.estadisticas
  deferrable initially deferred for each row execute function validacion.estadisticas_comprobar();

-- ── 5. Deleting a player removes him from call-ups and lineups ──────────────
create or replace function validacion.jugadores_limpiar()
returns trigger language plpgsql set search_path = public as $$
begin
  update partidos
     set convocados = (select coalesce(jsonb_agg(e), '[]') from jsonb_array_elements(convocados) e where e <> to_jsonb(old.id))
   where convocados @> to_jsonb(old.id);
  update alineaciones
     set jugadores = (select coalesce(jsonb_agg(case when s->'jugador_id' = to_jsonb(old.id)
                                                     then jsonb_set(s, '{jugador_id}', 'null') else s end), '[]')
                        from jsonb_array_elements(jugadores) s)
   where jugadores @> jsonb_build_array(jsonb_build_object('jugador_id', old.id));
  return old;
end $$;
create trigger limpiar_referencias after delete on public.jugadores
  for each row execute function validacion.jugadores_limpiar();

-- ── 6. Privileges ───────────────────────────────────────────────────────────
-- Trigger functions run as the calling user, who needs EXECUTE on the helpers.
-- The schema is not exposed through PostgREST, so this is not an RPC surface.
revoke all on all functions in schema validacion from public;
grant execute on all functions in schema validacion to authenticated, service_role;

-- ── 7. Validate existing data where possible ────────────────────────────────
do $$
declare c record;
begin
  for c in select conrelid::regclass as tabla, conname from pg_constraint
            where connamespace = 'public'::regnamespace and not convalidated loop
    begin
      execute format('alter table %s validate constraint %I', c.tabla, c.conname);
    exception when check_violation or foreign_key_violation or not_null_violation then
      raise warning 'Datos antiguos incumplen la regla %. Se aplica solo a cambios nuevos; revisa supabase/checks/data_integrity_preflight.sql', c.conname;
    end;
  end loop;
end $$;
