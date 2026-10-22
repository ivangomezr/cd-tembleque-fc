-- Visitors (anon) can only read the player columns granted one by one
-- (20261017120000_db_hardening.sql). The captaincy is public information, so
-- it joins that list; without it the app could not read it back after a reload.
grant select (capitania) on public.jugadores to anon, authenticated;
