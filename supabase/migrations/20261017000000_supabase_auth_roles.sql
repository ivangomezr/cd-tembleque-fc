-- =============================================================================
-- Supabase Auth + roles + strict Row Level Security
--
-- Roles
--   visitante   → no session (anon). Read-only access to public data.
--   jugador     → authenticated user linked to a row of `jugadores`. Can vote MVP.
--   admin       → manages matches, squad, stats, league, sponsors.
--   superadmin  → admin + close/open seasons + read the activity log.
--
-- Roles live in `public.perfiles`. The client can READ its own profile but can
-- never write it: there are no write policies, privileges are revoked and a
-- trigger rejects any write that carries an end-user JWT. Roles are assigned
-- from the SQL editor (`asignar_rol…`) or with `scripts/auth-admin.mjs`, which
-- uses the service-role key on a trusted machine.
-- =============================================================================

-- ── 1. Profiles ─────────────────────────────────────────────────────────────
do $$ begin
  create type public.rol_app as enum ('jugador', 'admin', 'superadmin');
exception when duplicate_object then null; end $$;

create table if not exists public.perfiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  jugador_id integer unique references public.jugadores (id) on delete set null,
  rol        public.rol_app not null default 'jugador',
  nombre     text,                                  -- display name for admins without a player row
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.perfiles is 'Auth user ↔ player link and app role. Written only from trusted contexts.';

alter table public.perfiles enable row level security;
revoke insert, update, delete, truncate on public.perfiles from anon, authenticated;

-- Defence in depth: refuse writes made with an end-user JWT even if someone
-- adds a permissive policy or grant by mistake later on.
create or replace function public.perfiles_solo_confianza()
returns trigger language plpgsql as $$
declare jwt_role text := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
begin
  if jwt_role in ('anon', 'authenticated') then
    raise exception 'Los perfiles y roles solo se pueden modificar desde un entorno de confianza'
      using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists perfiles_solo_confianza on public.perfiles;
create trigger perfiles_solo_confianza
  before insert or update on public.perfiles
  for each row execute function public.perfiles_solo_confianza();

-- ── 2. Role helpers (used by RLS policies) ──────────────────────────────────
-- SECURITY DEFINER so they can read `perfiles` without recursive RLS checks.
create or replace function public.mi_rol()
returns public.rol_app language sql stable security definer set search_path = public as $$
  select rol from public.perfiles where user_id = auth.uid()
$$;

create or replace function public.mi_jugador_id()
returns integer language sql stable security definer set search_path = public as $$
  select jugador_id from public.perfiles where user_id = auth.uid()
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol() in ('admin', 'superadmin'), false)
$$;

create or replace function public.is_superadmin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.mi_rol() = 'superadmin', false)
$$;

revoke execute on function public.mi_rol(), public.mi_jugador_id(), public.is_admin(), public.is_superadmin() from public;
grant execute on function public.mi_rol(), public.mi_jugador_id(), public.is_admin(), public.is_superadmin() to anon, authenticated;

-- Profile visibility: own profile always; admins see everyone (who is linked to whom)
drop policy if exists "perfil propio" on public.perfiles;
create policy "perfil propio" on public.perfiles
  for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "admins ven perfiles" on public.perfiles;
create policy "admins ven perfiles" on public.perfiles
  for select to authenticated using ((select public.is_admin()));

-- ── 3. Trusted role assignment (SQL editor / service role only) ─────────────
create or replace function public.asignar_rol(p_user_id uuid, p_rol public.rol_app, p_jugador_id integer default null, p_nombre text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfiles (user_id, rol, jugador_id, nombre)
  values (p_user_id, p_rol, p_jugador_id, p_nombre)
  on conflict (user_id) do update
    set rol = excluded.rol,
        jugador_id = coalesce(excluded.jugador_id, perfiles.jugador_id),
        nombre = coalesce(excluded.nombre, perfiles.nombre);
end $$;

create or replace function public.asignar_rol_por_email(p_email text, p_rol public.rol_app, p_jugador_id integer default null)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v_id uuid;
begin
  select id into v_id from auth.users where lower(email) = lower(p_email);
  if v_id is null then
    raise exception 'No existe ningún usuario con email %', p_email;
  end if;
  perform public.asignar_rol(v_id, p_rol, p_jugador_id);
end $$;

revoke execute on function public.asignar_rol(uuid, public.rol_app, integer, text) from public, anon, authenticated;
revoke execute on function public.asignar_rol_por_email(text, public.rol_app, integer) from public, anon, authenticated;

-- ── 4. Retire the old PIN oracle ────────────────────────────────────────────
-- `validar_clave` allowed unlimited, unauthenticated PIN guessing. Login now goes
-- through Supabase Auth (rate limited). The hashes in `claves_jugadores` stay so
-- `scripts/auth-admin.mjs migrate-pins` can import them; drop the table afterwards
-- with the follow-up migration.
drop function if exists public.validar_clave(integer, text);
drop function if exists public.asignar_clave_jugador(integer, text);

-- ── 5. Replace the permissive policies ──────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['temporadas', 'jugadores', 'equipos_liga', 'partidos_liga', 'partidos',
                           'alineaciones', 'eventos_partido', 'estadisticas', 'votos_mvp',
                           'patrocinadores', 'activity_log', 'push_subscriptions']
  loop
    execute format('drop policy if exists "public read" on public.%I', t);
    execute format('drop policy if exists "anon write" on public.%I', t);
  end loop;
end $$;

-- Public, read-only data (visitors included)
do $$
declare t text;
begin
  foreach t in array array['temporadas', 'jugadores', 'equipos_liga', 'partidos_liga', 'partidos',
                           'alineaciones', 'eventos_partido', 'estadisticas', 'votos_mvp', 'patrocinadores']
  loop
    execute format('create policy "lectura publica" on public.%I for select to anon, authenticated using (true)', t);
  end loop;
end $$;

-- Admin-managed data
do $$
declare t text;
begin
  foreach t in array array['jugadores', 'equipos_liga', 'partidos_liga', 'partidos',
                           'alineaciones', 'eventos_partido', 'estadisticas', 'patrocinadores']
  loop
    execute format('create policy "admin inserta" on public.%I for insert to authenticated with check ((select public.is_admin()))', t);
    execute format('create policy "admin actualiza" on public.%I for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))', t);
    execute format('create policy "admin borra" on public.%I for delete to authenticated using ((select public.is_admin()))', t);
  end loop;
end $$;

-- Seasons: admins may edit settings (zones, match length) of a season;
-- only superadmins create seasons, delete them or change which one is active.
create policy "superadmin crea temporada" on public.temporadas
  for insert to authenticated with check ((select public.is_superadmin()));
create policy "admin actualiza temporada" on public.temporadas
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "superadmin borra temporada" on public.temporadas
  for delete to authenticated using ((select public.is_superadmin()));

create or replace function public.temporadas_proteger()
returns trigger language plpgsql as $$
begin
  if (new.activa is distinct from old.activa or new.nombre is distinct from old.nombre or new."año" is distinct from old."año")
     and coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') in ('anon', 'authenticated')
     and not public.is_superadmin() then
    raise exception 'Solo un superadministrador puede abrir, cerrar o renombrar temporadas' using errcode = '42501';
  end if;
  return new;
end $$;
drop trigger if exists temporadas_proteger on public.temporadas;
create trigger temporadas_proteger before update on public.temporadas
  for each row execute function public.temporadas_proteger();

-- MVP votes: a player votes only as himself, for someone else, in a played match
create policy "jugador vota" on public.votos_mvp
  for insert to authenticated
  with check (
    votante_id = (select public.mi_jugador_id())
    and votado_id <> votante_id
    and exists (select 1 from public.partidos p where p.id = partido_id and p.jugado)
  );
create policy "jugador cambia su voto" on public.votos_mvp
  for update to authenticated
  using (votante_id = (select public.mi_jugador_id()))
  with check (votante_id = (select public.mi_jugador_id()) and votado_id <> votante_id);
create policy "jugador retira su voto" on public.votos_mvp
  for delete to authenticated using (votante_id = (select public.mi_jugador_id()));

-- Activity log: written by admins, read by superadmins. The actor is filled in
-- on the server from the JWT, so it cannot be spoofed by the client.
alter table public.activity_log add column if not exists user_id uuid references auth.users (id) on delete set null;

create or replace function public.activity_log_actor()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if auth.uid() is not null then
    select pf.jugador_id, coalesce(j.nombre, pf.nombre) as nombre
      into p
      from public.perfiles pf left join public.jugadores j on j.id = pf.jugador_id
     where pf.user_id = auth.uid();
    new.user_id := auth.uid();
    new.jugador_id := p.jugador_id;
    new.jugador_nombre := coalesce(p.nombre, 'Usuario');
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists activity_log_actor on public.activity_log;
create trigger activity_log_actor before insert on public.activity_log
  for each row execute function public.activity_log_actor();

create policy "admin registra actividad" on public.activity_log
  for insert to authenticated with check ((select public.is_admin()));
create policy "superadmin lee actividad" on public.activity_log
  for select to authenticated using ((select public.is_superadmin()));

-- Push subscriptions: no client access. Re-enable through an Edge Function
-- (service role) if web push is added back.
-- (RLS stays enabled with no policies → anon/authenticated get nothing.)

-- Password hashes table: never readable by clients.
revoke all on public.claves_jugadores from anon, authenticated;
