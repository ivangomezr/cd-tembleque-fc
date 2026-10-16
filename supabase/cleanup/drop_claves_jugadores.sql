-- Run ONLY after `node scripts/auth-admin.mjs migrate-pins` has created the
-- Supabase Auth accounts for every player (check with `... list`).
-- Removes the legacy PIN hashes, which are no longer used by the app.
drop table if exists public.claves_jugadores;
