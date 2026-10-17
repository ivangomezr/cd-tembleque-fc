-- =============================================================================
-- Database hardening (audit 2026-10-17)
--
-- Builds on 20261017000000_supabase_auth_roles.sql. Does not rewrite history:
-- every change here is additive or a privilege/policy replacement.
--
--  1. Least-privilege GRANTs: Supabase grants ALL on every new table/function to
--     anon & authenticated. We revoke everything and grant back only what each
--     API role needs. RLS still decides row by row.
--  2. Future objects are no longer exposed automatically.
--  3. Private player data (injury/sanction details) moves to `jugadores_privado`,
--     readable only by club members.
--  4. MVP voting is a secret ballot: the public sees only totals (mvp_ranking),
--     players see their own vote, admins see all. Stricter vote rules.
--  5. RPC surface reduced to the functions the app needs.
-- =============================================================================

-- ── 1. Table privileges ─────────────────────────────────────────────────────
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Public club data: read for everyone
grant select on public.temporadas, public.equipos_liga, public.partidos_liga, public.partidos,
                public.alineaciones, public.eventos_partido, public.estadisticas, public.patrocinadores
  to anon, authenticated;

-- Players: public columns only (estado_desc is private, see section 3)
grant select (id, nombre, posicion, dorsal, foto_url, estado, activo, created_at)
  on public.jugadores to anon, authenticated;

-- Writes: only authenticated callers; RLS restricts them to admins/superadmins
grant insert, update, delete on public.temporadas, public.jugadores, public.equipos_liga,
                                public.partidos_liga, public.partidos, public.alineaciones,
                                public.eventos_partido, public.estadisticas, public.patrocinadores
  to authenticated;
-- Logged-in users may read the whole row (the legacy estado_desc column is kept
-- empty by §3, so nothing private is there); visitors only get the public columns.
grant select on public.jugadores to authenticated;

-- Votes: authenticated only (RLS: own vote / admins)
grant select, insert, update, delete on public.votos_mvp to authenticated;

-- Profiles: read own (RLS); never writable from the API
grant select on public.perfiles to authenticated;

-- Activity log: admins insert, superadmins read (RLS); nobody updates/deletes
grant select, insert on public.activity_log to authenticated;

-- push_subscriptions, claves_jugadores: no API access at all (service role only)

-- Serial columns used by authenticated inserts
grant usage, select on all sequences in schema public to authenticated;

-- ── 2. Stop exposing future objects automatically ───────────────────────────
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ── 3. Private player data ──────────────────────────────────────────────────
create table if not exists public.jugadores_privado (
  jugador_id  integer primary key references public.jugadores (id) on delete cascade,
  estado_desc text,                       -- e.g. injury details: members only
  updated_at  timestamptz not null default now()
);
comment on table public.jugadores_privado is 'Player details visible only to club members (jugador/admin/superadmin).';
alter table public.jugadores_privado enable row level security;

insert into public.jugadores_privado (jugador_id, estado_desc)
select id, estado_desc from public.jugadores where estado_desc is not null
on conflict (jugador_id) do nothing;
-- Data now lives in jugadores_privado; keep the old column (no destructive schema change) but empty it.
update public.jugadores set estado_desc = null where estado_desc is not null;

create policy "miembros leen datos privados" on public.jugadores_privado
  for select to authenticated using ((select public.mi_rol()) is not null);
create policy "admin escribe datos privados" on public.jugadores_privado
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.jugadores_privado to authenticated;

-- Keep the legacy column empty even if an old client writes to it: the value is
-- moved to jugadores_privado (as the caller, so RLS still requires an admin).
create or replace function public.jugadores_mover_privado()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    if new.estado_desc is not null then
      insert into public.jugadores_privado (jugador_id, estado_desc, updated_at)
      values (new.id, new.estado_desc, now())
      on conflict (jugador_id) do update set estado_desc = excluded.estado_desc, updated_at = now();
      new.estado_desc := null;
    end if;
    return new;
  end if;
  -- AFTER INSERT: the row exists now, so the FK is satisfied
  if new.estado_desc is not null then
    update public.jugadores set estado_desc = new.estado_desc where id = new.id; -- fires the UPDATE branch
  end if;
  return null;
end $$;
drop trigger if exists jugadores_mover_privado_upd on public.jugadores;
create trigger jugadores_mover_privado_upd before update on public.jugadores
  for each row execute function public.jugadores_mover_privado();
drop trigger if exists jugadores_mover_privado_ins on public.jugadores;
create trigger jugadores_mover_privado_ins after insert on public.jugadores
  for each row execute function public.jugadores_mover_privado();

-- ── 4. MVP votes: secret ballot + stricter rules ────────────────────────────
drop policy if exists "lectura publica" on public.votos_mvp;
drop policy if exists "jugador vota" on public.votos_mvp;
drop policy if exists "jugador cambia su voto" on public.votos_mvp;
drop policy if exists "jugador retira su voto" on public.votos_mvp;

-- A vote is valid when the match is played, you vote as yourself, not for yourself,
-- and the player you vote for took part (called up or played minutes).
create or replace function public.voto_valido(p_partido_id integer, p_votante_id integer, p_votado_id integer)
returns boolean language sql stable security definer set search_path = public as $$
  select p_votante_id is not null
     and p_votante_id = public.mi_jugador_id()
     and p_votado_id <> p_votante_id
     and exists (
       select 1 from public.partidos p
        where p.id = p_partido_id and p.jugado
          and (p.convocados @> to_jsonb(p_votado_id)
               or exists (select 1 from public.estadisticas e
                           where e.partido_id = p.id and e.jugador_id = p_votado_id and e.minutos > 0))
     )
$$;

create policy "ver mi voto o todos si admin" on public.votos_mvp
  for select to authenticated
  using (votante_id = (select public.mi_jugador_id()) or (select public.is_admin()));
create policy "votar" on public.votos_mvp
  for insert to authenticated
  with check (public.voto_valido(partido_id, votante_id, votado_id));
create policy "cambiar mi voto" on public.votos_mvp
  for update to authenticated
  using (votante_id = (select public.mi_jugador_id()))
  with check (public.voto_valido(partido_id, votante_id, votado_id));
create policy "retirar mi voto" on public.votos_mvp
  for delete to authenticated using (votante_id = (select public.mi_jugador_id()));

-- Public totals without revealing who voted for whom
create or replace function public.mvp_ranking(p_partido_id integer)
returns table (votado_id integer, votos integer)
language sql stable security definer set search_path = public as $$
  select v.votado_id, count(*)::int
    from public.votos_mvp v
   where v.partido_id = p_partido_id
   group by v.votado_id
   order by 2 desc, 1
$$;

-- ── 5. RPC surface ──────────────────────────────────────────────────────────
revoke execute on all functions in schema public from public, anon, authenticated;
-- Needed by RLS policies evaluated for authenticated users
grant execute on function public.mi_rol(), public.mi_jugador_id(), public.is_admin(),
                          public.is_superadmin(), public.voto_valido(integer, integer, integer)
  to authenticated;
-- Public read-only RPC
grant execute on function public.mvp_ranking(integer) to anon, authenticated;
-- asignar_rol / asignar_rol_por_email: service role / SQL editor only (no grant).
-- Trigger functions do not need EXECUTE to fire.

-- ── 6. Safety net: every table in public must have RLS ──────────────────────
do $$
declare r record;
begin
  for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', r.relname);
    raise notice 'RLS enabled on public.%', r.relname;
  end loop;
end $$;
