-- MVP candidates chosen by a superadmin.
--
-- Before a match is marked as played, a superadmin picks 5 players from the
-- call-up (all of them when fewer than 5 are called up). Only those can be voted.
--   · partidos.mvp_finalistas: JSON array of player ids; null = not chosen.
--   · Required to mark a match as played while its vote would still be open
--     (old matches entered later are not affected).
--   · Only a superadmin can set or change them, and only before the first vote.
--   · Every candidate must be in the call-up.
-- Matches without candidates (before this change) keep voting among the call-up.

alter table public.partidos add column if not exists mvp_finalistas jsonb;
comment on column public.partidos.mvp_finalistas is
  'Players that can be voted as MVP (chosen by a superadmin before marking the match as played). Null: the whole call-up.';

-- ── Who can be voted ────────────────────────────────────────────────────────
-- The candidates, or (matches without them) the call-up, or players with minutes.
create or replace function validacion.mvp_candidatos(p_partido_id integer)
returns table (jugador_id integer, goles integer, asistencias integer, minutos integer, dorsal integer, orden bigint)
language sql stable set search_path = public as $$
  with p as (select id, convocados, mvp_finalistas from partidos where id = p_partido_id),
  ids as (
    select (e::text)::integer as id
      from p, jsonb_array_elements(p.mvp_finalistas) e
     where jsonb_typeof(p.mvp_finalistas) = 'array' and jsonb_typeof(e) = 'number'
    union
    select (e::text)::integer
      from p, jsonb_array_elements(p.convocados) e
     where p.mvp_finalistas is null and jsonb_typeof(e) = 'number'
    union
    select s.jugador_id
      from p join estadisticas s on s.partido_id = p.id
     where p.mvp_finalistas is null and jsonb_array_length(p.convocados) = 0 and s.minutos > 0
  )
  select j.id, coalesce(s.goles, 0), coalesce(s.asistencias, 0), coalesce(s.minutos, 0), j.dorsal,
         row_number() over (order by (coalesce(s.goles, 0) + coalesce(s.asistencias, 0) > 0) desc,
                                     coalesce(s.goles, 0) desc, coalesce(s.asistencias, 0) desc,
                                     coalesce(s.minutos, 0) desc, j.dorsal nulls last, j.id)
    from ids
    join jugadores j on j.id = ids.id
    left join estadisticas s on s.partido_id = p_partido_id and s.jugador_id = j.id
$$;

-- ── Rules ───────────────────────────────────────────────────────────────────
-- Has anyone voted? (the votes table is closed to API users, so this runs as owner)
create or replace function validacion.mvp_hay_votos(p_partido_id integer)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from mvp_votos where partido_id = p_partido_id)
$$;

create or replace function validacion.mvp_finalistas_validar()
returns trigger language plpgsql set search_path = public as $$
declare
  ins boolean := tg_op = 'INSERT';
  api boolean := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') in ('anon', 'authenticated');
  cambia boolean;
  v_err text;
  v_id integer;
  v_n integer;
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if jsonb_typeof(new.mvp_finalistas) = 'array' and jsonb_array_length(new.mvp_finalistas) = 0 then
    new.mvp_finalistas := null;
  end if;
  cambia := case when ins then new.mvp_finalistas is not null else new.mvp_finalistas is distinct from old.mvp_finalistas end;
  -- a malformed call-up is reported by the main validation trigger
  v_n := case when jsonb_typeof(new.convocados) = 'array' then least(5, jsonb_array_length(new.convocados)) else 0 end;

  if cambia then
    if api and not coalesce(public.is_superadmin(), false) then
      perform validacion.fallo('Solo un superadmin puede elegir los candidatos al MVP.', 'mvp_finalistas_rol');
    end if;
    if not ins and validacion.mvp_hay_votos(new.id) then
      perform validacion.fallo('Ya hay votos en este partido: los candidatos al MVP no se pueden cambiar.', 'mvp_finalistas_votos');
    end if;
    if new.mvp_finalistas is not null then
      v_err := validacion.ids_jugadores_error(new.mvp_finalistas, 5, 'candidatos al MVP');
      if v_err is not null then perform validacion.fallo(v_err, 'mvp_finalistas'); end if;
      if jsonb_array_length(new.mvp_finalistas) <> v_n then
        perform validacion.fallo(format('Elige %s candidatos al MVP (has elegido %s).', v_n, jsonb_array_length(new.mvp_finalistas)), 'mvp_finalistas_numero');
      end if;
    end if;
  end if;

  -- every candidate stays in the call-up
  if new.mvp_finalistas is not null and (cambia or new.convocados is distinct from old.convocados) then
    select (e::text)::integer into v_id from jsonb_array_elements(new.mvp_finalistas) e
     where not coalesce(new.convocados, '[]') @> jsonb_build_array(e) limit 1;
    if v_id is not null then
      perform validacion.fallo(format('%s es candidato al MVP y tiene que estar convocado.', validacion.nombre_jugador(v_id)), 'mvp_finalistas_convocados');
    end if;
  end if;

  -- marking as played while the vote would be open needs the candidates
  if api and new.jugado and (ins or not old.jugado) and new.fecha is not null and now() <= public.mvp_cierre(new.fecha) then
    if v_n = 0 then
      perform validacion.fallo('Antes de marcar el partido como jugado, haz la convocatoria y elige los candidatos al MVP.', 'mvp_finalistas_requeridos');
    end if;
    if new.mvp_finalistas is null or jsonb_array_length(new.mvp_finalistas) <> v_n then
      perform validacion.fallo(format('Elige los %s candidatos al MVP antes de marcar el partido como jugado.', v_n), 'mvp_finalistas_requeridos');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists mvp_finalistas on public.partidos;
create trigger mvp_finalistas before insert or update on public.partidos
  for each row execute function validacion.mvp_finalistas_validar();

-- Deleting a player removes him from the candidates too
create or replace function validacion.mvp_finalistas_limpiar()
returns trigger language plpgsql set search_path = public as $$
begin
  update partidos
     set mvp_finalistas = (select nullif(coalesce(jsonb_agg(e), '[]'), '[]')
                             from jsonb_array_elements(mvp_finalistas) e where e <> to_jsonb(old.id))
   where mvp_finalistas @> to_jsonb(old.id);
  return old;
end $$;
drop trigger if exists limpiar_finalistas on public.jugadores;
create trigger limpiar_finalistas after delete on public.jugadores
  for each row execute function validacion.mvp_finalistas_limpiar();

-- ── Privileges (the triggers run as the caller) ─────────────────────────────
revoke all on all functions in schema validacion from public;
grant execute on all functions in schema validacion to authenticated, service_role;
