-- Kit worn by CD Tembleque in each match ('local' = blue, 'visitante' = pink)
alter table public.partidos
  add column if not exists equipacion text not null default 'local'
  check (equipacion in ('local', 'visitante'));
