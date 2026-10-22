-- Captains.
--   · jugadores.capitania: 1 = primer capitán, 2 = segundo capitán, null = none.
--     Set by an admin when editing the player.
--   · partidos.capitan_id: who wore the armband in that match. Any player of the
--     starting XI (not only the captains: they may be injured or absent).
--     If he leaves the starting XI, the match is left without captain.

alter table public.jugadores add column if not exists capitania smallint;
alter table public.jugadores drop constraint if exists jugadores_capitania_valida;
alter table public.jugadores add constraint jugadores_capitania_valida check (capitania in (1, 2));
comment on column public.jugadores.capitania is '1 = primer capitán, 2 = segundo capitán, null = no es capitán.';

alter table public.partidos add column if not exists capitan_id integer references public.jugadores (id) on delete set null;
comment on column public.partidos.capitan_id is 'Captain of the match (armband): a player of the starting XI.';

-- The match captain has to be in the starting XI
create or replace function validacion.capitan_validar()
returns trigger language plpgsql set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return new; end if;
  if new.capitan_id is not null and (tg_op = 'INSERT' or new.capitan_id is distinct from old.capitan_id) then
    if not (new.capitan_id = any (validacion.titulares(new.id))) then
      perform validacion.fallo(format('%s no está en el once inicial: el capitán tiene que ser titular.',
                                      validacion.nombre_jugador(new.capitan_id)), 'capitan_titular');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists capitan on public.partidos;
create trigger capitan before insert or update on public.partidos
  for each row execute function validacion.capitan_validar();

-- A captain who leaves the starting XI loses the armband
create or replace function validacion.capitan_alineacion()
returns trigger language plpgsql set search_path = public as $$
begin
  update partidos set capitan_id = null
   where id = new.partido_id and capitan_id is not null
     and not (capitan_id = any (validacion.titulares(new.partido_id)));
  return new;
end $$;
drop trigger if exists capitan_fuera on public.alineaciones;
create trigger capitan_fuera after insert or update on public.alineaciones
  for each row execute function validacion.capitan_alineacion();

revoke all on all functions in schema validacion from public;
grant execute on all functions in schema validacion to authenticated, service_role;

-- Current captains (2026/27): Pedro and Fran first, Ivi and Dani López second.
-- Only set when exactly one active player matches the name and he has no
-- captaincy yet; otherwise set them in Admin › Plantilla › Editar.
do $$
declare
  c record;
  ids integer[];
begin
  for c in select * from (values ('Pedro', 1), ('Fran', 1), ('Ivi', 2), ('Dani López', 2)) as v(nombre, rango) loop
    -- exact name first; otherwise the name followed by surnames ("Pedro Sánchez")
    select array_agg(id) into ids from public.jugadores where activo and lower(btrim(nombre)) = lower(c.nombre);
    if coalesce(array_length(ids, 1), 0) <> 1 then
      select array_agg(id) into ids from public.jugadores where activo and lower(btrim(nombre)) like lower(c.nombre) || ' %';
    end if;
    if coalesce(array_length(ids, 1), 0) = 1 then
      update public.jugadores set capitania = c.rango where id = ids[1] and capitania is null;
    else
      raise notice 'Capitán «%»: % jugadores coinciden con ese nombre. Márcalo en Admin › Plantilla.', c.nombre, coalesce(array_length(ids, 1), 0);
    end if;
  end loop;
end $$;
