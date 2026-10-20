-- =============================================================================
-- MVP voted by everyone (October 2026)
--
-- One MVP per match, voted by anyone (fans and players alike) from the moment
-- the match is marked as played until 23:59 (Spain) of the day after the match.
-- When voting closes, the most voted player is saved as the match MVP.
--
--  * Voters without an account get a Supabase anonymous session (one tap, no
--    data asked). One vote per session and match, enforced here.
--  * Clearing the app data creates a new session, so there is also a soft cap
--    of 5 votes per network (IP) and match: a family on the same Wi-Fi can
--    vote; someone resetting the app over and over cannot. The IP is stored only
--    as a salted hash and erased when voting closes.
--  * Votes are written only through votar_mvp(); individual votes are never
--    readable from the API, only totals (mvp_votacion()).
--
-- The previous players-only ballot (votos_mvp) is kept as history and its votes
-- are copied into the new table, so past results do not change.
-- =============================================================================

-- ── Votes ───────────────────────────────────────────────────────────────────
create table if not exists public.mvp_votos (
  id          bigserial primary key,
  partido_id  integer not null references public.partidos (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,  -- anonymous or real session
  votado_id   integer not null references public.jugadores (id) on delete cascade,
  red_hash    text,                                                 -- salted hash of the IP, erased at close
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.mvp_votos is 'MVP votes (anyone can vote). Written only by votar_mvp(); never readable from the API.';
create unique index if not exists mvp_votos_uno_por_sesion on public.mvp_votos (partido_id, user_id);
create index if not exists mvp_votos_por_jugador on public.mvp_votos (partido_id, votado_id);
create index if not exists mvp_votos_por_red on public.mvp_votos (partido_id, red_hash) where red_hash is not null;

alter table public.mvp_votos enable row level security;
revoke all on public.mvp_votos from anon, authenticated;
-- (no policies: only the SECURITY DEFINER functions below touch this table)

-- Private salt for the IP hashes (not readable from the API)
create table if not exists validacion.ajustes (clave text primary key, valor text not null);
revoke all on validacion.ajustes from public, anon, authenticated;
insert into validacion.ajustes (clave, valor)
values ('mvp_sal', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (clave) do nothing;

-- Votes already cast by players with an account keep counting
insert into public.mvp_votos (partido_id, user_id, votado_id, created_at)
select v.partido_id, p.user_id, v.votado_id, v.created_at
  from public.votos_mvp v
  join public.perfiles p on p.jugador_id = v.votante_id
on conflict (partido_id, user_id) do nothing;

-- ── Helpers ─────────────────────────────────────────────────────────────────
-- Voting closes at 23:59:59 (Spain) of the day after the match
create or replace function public.mvp_cierre(p_fecha date)
returns timestamptz language sql stable as $$
  select ((p_fecha + 1)::timestamp + interval '23 hours 59 minutes 59 seconds') at time zone 'Europe/Madrid'
$$;

-- Client IP as seen by the Supabase gateway (Cloudflare header first)
create or replace function validacion.cliente_ip()
returns text language plpgsql stable as $$
declare h json;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    return null;
  end;
  return nullif(btrim(coalesce(h->>'cf-connecting-ip', h->>'x-real-ip', split_part(h->>'x-forwarded-for', ',', 1))), '');
end $$;

-- Who can be voted: the call-up (or, without one, players with minutes), with
-- their match figures, in the order shown to voters: goals or assists first,
-- then minutes played.
create or replace function validacion.mvp_candidatos(p_partido_id integer)
returns table (jugador_id integer, goles integer, asistencias integer, minutos integer, dorsal integer, orden bigint)
language sql stable set search_path = public as $$
  with p as (select id, convocados from partidos where id = p_partido_id),
  ids as (
    select (e::text)::integer as id
      from p, jsonb_array_elements(p.convocados) e
     where jsonb_typeof(e) = 'number'
    union
    select s.jugador_id
      from p join estadisticas s on s.partido_id = p.id
     where jsonb_array_length(p.convocados) = 0 and s.minutos > 0
  )
  select j.id, coalesce(s.goles, 0), coalesce(s.asistencias, 0), coalesce(s.minutos, 0), j.dorsal,
         row_number() over (order by (coalesce(s.goles, 0) + coalesce(s.asistencias, 0) > 0) desc,
                                     coalesce(s.goles, 0) desc, coalesce(s.asistencias, 0) desc,
                                     coalesce(s.minutos, 0) desc, j.dorsal nulls last, j.id)
    from ids
    join jugadores j on j.id = ids.id
    left join estadisticas s on s.partido_id = p_partido_id and s.jugador_id = j.id
$$;

-- Saves the winner once voting has closed (idempotent). Ties: the player who
-- appears first in the voting order (goals/assists, then minutes).
create or replace function validacion.cerrar_mvp(p_partido_id integer)
returns void language plpgsql security definer set search_path = public as $$
declare p record; v_ganador integer;
begin
  select id, jugado, fecha, mvp_jugador_id into p from partidos where id = p_partido_id;
  if p.id is null or not p.jugado or p.fecha is null or now() <= public.mvp_cierre(p.fecha) then return; end if;
  -- erase the network hashes in any case: they are only needed while voting is open
  update mvp_votos set red_hash = null where partido_id = p.id and red_hash is not null;
  if p.mvp_jugador_id is not null then return; end if;
  select v.votado_id into v_ganador
    from (select votado_id, count(*) as votos from mvp_votos where partido_id = p.id group by votado_id) v
    left join validacion.mvp_candidatos(p.id) c on c.jugador_id = v.votado_id
   order by v.votos desc, c.orden nulls last, v.votado_id
   limit 1;
  if v_ganador is not null then
    update partidos set mvp_jugador_id = v_ganador where id = p.id;
  end if;
end $$;

-- ── Public API ──────────────────────────────────────────────────────────────
-- State of the vote for a match (anyone): open?, closing time, totals, my vote.
create or replace function public.mvp_votacion(p_partido_id integer)
returns json language plpgsql volatile security definer set search_path = public as $$
declare p record; v_uid uuid := auth.uid();
begin
  perform validacion.cerrar_mvp(p_partido_id);
  select id, jugado, fecha, mvp_jugador_id into p from partidos where id = p_partido_id;
  if p.id is null then return null; end if;
  return json_build_object(
    'partido_id', p.id,
    'abierta', p.jugado and p.fecha is not null and now() <= public.mvp_cierre(p.fecha),
    'cierra', case when p.fecha is not null then public.mvp_cierre(p.fecha) end,
    'mvp_jugador_id', p.mvp_jugador_id,
    'total', (select count(*) from mvp_votos where partido_id = p.id),
    'ranking', coalesce((select json_agg(json_build_object('jugador_id', votado_id, 'votos', votos) order by votos desc, votado_id)
                           from (select votado_id, count(*)::int as votos from mvp_votos where partido_id = p.id group by votado_id) r), '[]'::json),
    'mi_voto', case when v_uid is not null then (select votado_id from mvp_votos where partido_id = p.id and user_id = v_uid) end
  );
end $$;

-- Cast or change my vote (needs a session: anonymous or real)
create or replace function public.votar_mvp(p_partido_id integer, p_jugador_id integer)
returns json language plpgsql volatile security definer set search_path = public, extensions as $$
declare
  v_uid uuid := auth.uid();
  p record;
  v_ip text := validacion.cliente_ip();
  v_red text;
  v_existe boolean;
begin
  if v_uid is null then
    perform validacion.fallo('Abre la votación desde la app para votar.', 'mvp_sin_sesion');
  end if;
  select id, jugado, fecha into p from partidos where id = p_partido_id;
  if p.id is null then perform validacion.fallo('El partido no existe.', 'mvp_partido'); end if;
  if not p.jugado then perform validacion.fallo('La votación se abre cuando el partido se marca como jugado.', 'mvp_no_abierta'); end if;
  if p.fecha is null or now() > public.mvp_cierre(p.fecha) then
    perform validacion.fallo('La votación de este partido ya ha cerrado.', 'mvp_cerrada');
  end if;
  if not exists (select 1 from validacion.mvp_candidatos(p.id) c where c.jugador_id = p_jugador_id) then
    perform validacion.fallo('Solo se puede votar a jugadores convocados para este partido.', 'mvp_candidato');
  end if;

  if v_ip is not null then
    v_red := encode(digest(v_ip || ':' || p.id || ':' || (select valor from validacion.ajustes where clave = 'mvp_sal'), 'sha256'), 'hex');
  end if;

  select true into v_existe from mvp_votos where partido_id = p.id and user_id = v_uid;
  if coalesce(v_existe, false) then
    update mvp_votos set votado_id = p_jugador_id, updated_at = now() where partido_id = p.id and user_id = v_uid;
  else
    if v_red is not null and (select count(*) from mvp_votos where partido_id = p.id and red_hash = v_red) >= 5 then
      perform validacion.fallo('Desde esta conexión ya se han registrado muchos votos para este partido.', 'mvp_limite_red');
    end if;
    insert into mvp_votos (partido_id, user_id, votado_id, red_hash) values (p.id, v_uid, p_jugador_id, v_red);
  end if;
  return public.mvp_votacion(p.id);
end $$;

-- For the scheduled job: closes every finished vote
create or replace function public.cerrar_votaciones_mvp()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0;
begin
  for r in select p.id from partidos p
            where p.jugado and p.fecha is not null and now() > public.mvp_cierre(p.fecha)
              and (p.mvp_jugador_id is null or exists (select 1 from mvp_votos v where v.partido_id = p.id and v.red_hash is not null))
  loop
    perform validacion.cerrar_mvp(r.id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- While voting is open the MVP is not picked by hand (afterwards an admin can correct it)
create or replace function validacion.mvp_bloqueo()
returns trigger language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.mvp_jugador_id is distinct from old.mvp_jugador_id and new.mvp_jugador_id is not null
     and new.jugado and new.fecha is not null and now() <= public.mvp_cierre(new.fecha)
     and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') in ('anon', 'authenticated') then
    perform validacion.fallo(format('El MVP se decide por votación hasta el %s a las 23:59.',
                                    to_char(new.fecha + 1, 'DD/MM')), 'mvp_en_votacion');
  end if;
  return new;
end $$;
drop trigger if exists mvp_bloqueo on public.partidos;
create trigger mvp_bloqueo before update on public.partidos
  for each row execute function validacion.mvp_bloqueo();

-- ── Privileges ──────────────────────────────────────────────────────────────
revoke execute on function public.mvp_cierre(date), public.mvp_votacion(integer), public.votar_mvp(integer, integer),
                           public.cerrar_votaciones_mvp() from public, anon, authenticated;
grant execute on function public.mvp_votacion(integer) to anon, authenticated;
grant execute on function public.votar_mvp(integer, integer) to authenticated;   -- anonymous sessions are 'authenticated'
grant execute on function public.mvp_cierre(date) to authenticated;            -- used by the mvp_bloqueo trigger (runs as the caller)
revoke all on all functions in schema validacion from public;
grant execute on all functions in schema validacion to authenticated, service_role;

-- ── Scheduled jobs (Supabase › Integrations › Cron, pg_cron) ────────────────
-- Votes are also closed whenever someone opens the result (mvp_votacion), so the
-- app works without cron; the job makes sure the MVP is saved even if nobody looks,
-- and removes anonymous voters after 30 days (Supabase does not do it by itself).
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('cerrar-votaciones-mvp', '*/10 * * * *', 'select public.cerrar_votaciones_mvp()');
  perform cron.schedule('limpiar-votantes-anonimos', '30 4 * * *',
    $q$delete from auth.users where is_anonymous and created_at < now() - interval '30 days'$q$);
exception when others then
  raise notice 'pg_cron no disponible (%): actívalo en Supabase › Integrations › Cron y vuelve a ejecutar este bloque.', sqlerrm;
end $$;
