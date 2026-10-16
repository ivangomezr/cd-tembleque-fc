-- =============================================================================
-- CD Tembleque FC — initial schema
-- Run with `supabase db push` (CLI) or paste into Supabase › SQL Editor.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── Seasons ──────────────────────────────────────────────────────────────────
create table public.temporadas (
  id              serial primary key,
  nombre          text    not null,
  "año"           integer not null,
  activa          boolean not null default true,
  zona_ascenso    integer not null default 1,   -- direct promotion spots
  zona_promocion  integer not null default 0,   -- promotion play-off spots
  zona_descenso   integer not null default 0,   -- relegation spots
  duracion_partido integer not null default 90, -- minutes, used for minutes played
  created_at      timestamptz not null default now()
);
-- Only one active season at a time
create unique index temporadas_una_activa on public.temporadas (activa) where activa;

-- ── Players (global, not per season) ─────────────────────────────────────────
create table public.jugadores (
  id          serial primary key,
  nombre      text not null,
  posicion    text check (posicion in ('Portero', 'Defensa', 'Centrocampista', 'Delantero')),
  dorsal      integer,
  foto_url    text,
  estado      text not null default 'disponible',
  estado_desc text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── League teams of a season (our club included, es_propio = true) ───────────
create table public.equipos_liga (
  id             serial primary key,
  temporada_id   integer not null references public.temporadas (id) on delete cascade,
  nombre         text not null,
  nombre_corto   text,
  escudo_url     text,
  es_propio      boolean not null default false,
  sancion_puntos integer not null default 0,
  created_at     timestamptz not null default now(),
  unique (temporada_id, nombre)
);

-- ── League fixtures between OTHER teams (ours live in `partidos`) ────────────
create table public.partidos_liga (
  id              serial primary key,
  temporada_id    integer not null references public.temporadas (id) on delete cascade,
  jornada         integer not null check (jornada > 0),
  fecha           date,
  local_id        integer not null references public.equipos_liga (id) on delete cascade,
  visitante_id    integer not null references public.equipos_liga (id) on delete cascade,
  goles_local     integer not null default 0 check (goles_local >= 0),
  goles_visitante integer not null default 0 check (goles_visitante >= 0),
  jugado          boolean not null default false,
  created_at      timestamptz not null default now(),
  check (local_id <> visitante_id)
);
create index partidos_liga_temporada_jornada on public.partidos_liga (temporada_id, jornada);

-- ── Our matches ──────────────────────────────────────────────────────────────
create table public.partidos (
  id               serial primary key,
  temporada_id     integer references public.temporadas (id),
  jornada          integer not null default 0,     -- 0 for friendlies
  fecha            date    not null,
  hora             text,
  local            text    not null,
  visitante        text    not null,
  campo            text,
  goles_local      integer not null default 0,
  goles_visitante  integer not null default 0,
  jugado           boolean not null default false,
  amistoso         boolean not null default false,
  escudo_rival_url text,
  convocados       jsonb   not null default '[]'::jsonb,
  mvp_jugador_id   integer references public.jugadores (id) on delete set null,
  created_at       timestamptz not null default now()
);
create index partidos_temporada on public.partidos (temporada_id);

-- ── Starting XI per match ────────────────────────────────────────────────────
create table public.alineaciones (
  id           serial primary key,
  partido_id   integer not null unique references public.partidos (id) on delete cascade,
  temporada_id integer references public.temporadas (id),
  formacion    text  not null default '4-4-2',
  jugadores    jsonb not null default '[]'::jsonb, -- [{ linea, posicion, jugador_id }]
  created_at   timestamptz not null default now()
);

-- ── Match timeline ───────────────────────────────────────────────────────────
create table public.eventos_partido (
  id           serial primary key,
  partido_id   integer not null references public.partidos (id) on delete cascade,
  temporada_id integer references public.temporadas (id),
  minuto       integer not null check (minuto between 0 and 130),
  minuto_extra integer not null default 0 check (minuto_extra between 0 and 20),
  tipo         text not null check (tipo in ('gol', 'gol_penalti', 'gol_propia', 'penalti_fallado',
                                             'amarilla', 'segunda_amarilla', 'roja', 'cambio')),
  equipo       text not null check (equipo in ('propio', 'rival')),
  jugador_id   integer references public.jugadores (id) on delete set null, -- scorer / booked / player ON
  jugador2_id  integer references public.jugadores (id) on delete set null, -- assist / player OFF
  nombre_rival text,
  created_at   timestamptz not null default now()
);
create index eventos_partido_partido on public.eventos_partido (partido_id, minuto, minuto_extra);

-- ── Per-player stats per match (minutes are computed by the app) ─────────────
create table public.estadisticas (
  id                 serial primary key,
  jugador_id         integer not null references public.jugadores (id) on delete cascade,
  partido_id         integer not null references public.partidos (id) on delete cascade,
  temporada_id       integer references public.temporadas (id),
  minutos            integer not null default 0 check (minutos >= 0),
  titular            boolean not null default false,
  goles              integer not null default 0,
  asistencias        integer not null default 0,
  tarjetas_amarillas integer not null default 0,
  tarjetas_rojas     integer not null default 0,
  paradas            integer not null default 0,
  goles_encajados    integer not null default 0,
  created_at         timestamptz not null default now(),
  unique (jugador_id, partido_id)
);
create index estadisticas_temporada on public.estadisticas (temporada_id);

-- ── MVP votes ────────────────────────────────────────────────────────────────
create table public.votos_mvp (
  id           serial primary key,
  partido_id   integer not null references public.partidos (id) on delete cascade,
  votante_id   integer not null references public.jugadores (id) on delete cascade,
  votado_id    integer not null references public.jugadores (id) on delete cascade,
  temporada_id integer references public.temporadas (id),
  created_at   timestamptz not null default now(),
  unique (partido_id, votante_id),
  check (votante_id <> votado_id)
);

-- ── Sponsors, activity log, push subscriptions ───────────────────────────────
create table public.patrocinadores (
  id         serial primary key,
  nombre     text,
  imagen_url text,
  created_at timestamptz not null default now()
);

create table public.activity_log (
  id             serial primary key,
  jugador_id     integer references public.jugadores (id) on delete set null,
  jugador_nombre text,
  accion         text not null,
  entidad        text not null,
  detalle        text,
  temporada_id   integer references public.temporadas (id),
  created_at     timestamptz not null default now()
);

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  updated_at timestamptz not null default now()
);

-- ── Player passwords ─────────────────────────────────────────────────────────
-- Kept in their own table with RLS on and NO policies: the public API cannot read
-- it at all. Only the SECURITY DEFINER functions below touch it.
create table public.claves_jugadores (
  jugador_id integer primary key references public.jugadores (id) on delete cascade,
  clave_hash text not null
);
alter table public.claves_jugadores enable row level security;

create or replace function public.asignar_clave_jugador(p_jugador_id integer, p_clave text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into claves_jugadores (jugador_id, clave_hash)
  values (p_jugador_id, crypt(p_clave, gen_salt('bf')))
  on conflict (jugador_id) do update set clave_hash = excluded.clave_hash;
end $$;

create or replace function public.validar_clave(p_jugador_id integer, p_clave text)
returns boolean language plpgsql security definer set search_path = public, extensions as $$
declare v_hash text;
begin
  select clave_hash into v_hash from claves_jugadores where jugador_id = p_jugador_id;
  return v_hash is not null and v_hash = crypt(p_clave, v_hash);
end $$;

-- Only the SQL editor / service role may set passwords
revoke execute on function public.asignar_clave_jugador(integer, text) from public, anon, authenticated;
grant execute on function public.validar_clave(integer, text) to anon, authenticated;

-- ── Row Level Security ───────────────────────────────────────────────────────
-- Same model as the original app: anyone can read, the anon key can write.
-- ⚠️ This is NOT secure for writes — see README › Security for the Supabase Auth
-- upgrade path (policies restricted to `authenticated`).
do $$
declare t text;
begin
  foreach t in array array['temporadas', 'jugadores', 'equipos_liga', 'partidos_liga', 'partidos',
                           'alineaciones', 'eventos_partido', 'estadisticas', 'votos_mvp',
                           'patrocinadores', 'activity_log', 'push_subscriptions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "public read" on public.%I for select using (true)', t);
    execute format('create policy "anon write" on public.%I for all using (true) with check (true)', t);
  end loop;
end $$;
