#!/usr/bin/env node
/**
 * Trusted user & role management for CD Tembleque FC.
 *
 * Runs ONLY on a trusted machine with the Supabase service-role key. Never put
 * that key in Vercel, in a VITE_ variable or in git.
 *
 * Setup (once):  copy scripts/.env.admin.example to scripts/.env.admin and fill it in.
 *
 * Usage:
 *   node scripts/auth-admin.mjs list
 *   node scripts/auth-admin.mjs player <jugadorId> [--pin 12345678 | --generate]
 *   node scripts/auth-admin.mjs players --generate            # every player without an account
 *   node scripts/auth-admin.mjs user <email> --role admin|superadmin|jugador [--jugador <id>] [--password X | --generate]
 *   node scripts/auth-admin.mjs role <email | jugador:<id>> <jugador|admin|superadmin>
 *   node scripts/auth-admin.mjs disable <email | jugador:<id>>  # bans the account and removes its role
 *   node scripts/auth-admin.mjs migrate-pins                  # import the old bcrypt PINs (claves_jugadores)
 */
import { createClient } from '@supabase/supabase-js'
import { randomInt } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

// ── Config ─────────────────────────────────────────────────────────────────
function loadEnvFile(path) {
  if (!existsSync(path)) return
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line)
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
    }
  }
}
loadEnvFile(join(here, '.env.admin'))

const URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
export const PLAYER_DOMAIN = process.env.PLAYER_LOGIN_DOMAIN || 'jugadores.cdtembleque.app'
const MIN_PIN = 6 // Supabase Auth minimum password length (default)
const ROLES = ['jugador', 'admin', 'superadmin']

export const playerEmail = (id) => `jugador-${Number(id)}@${PLAYER_DOMAIN}`
export const generatePin = (len = 8) => Array.from({ length: len }, () => randomInt(0, 10)).join('')

function die(msg) { console.error(`✗ ${msg}`); process.exit(1) }
function arg(args, name) {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}

function client() {
  if (!URL || !SERVICE_KEY) die('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (scripts/.env.admin)')
  return createClient(URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

// ── Helpers ────────────────────────────────────────────────────────────────
async function findUserByEmail(sb, email) {
  const target = email.toLowerCase()
  for (let page = 1; page < 100; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email?.toLowerCase() === target)
    if (hit) return hit
    if (data.users.length < 200) return null
  }
  return null
}

async function upsertUser(sb, { email, password, passwordHash, metadata }) {
  const existing = await findUserByEmail(sb, email)
  const attrs = {
    email,
    email_confirm: true, // no confirmation email is sent
    ...(password ? { password } : {}),
    ...(passwordHash ? { password_hash: passwordHash } : {}),
    app_metadata: { provisioned_by: 'auth-admin' }, // app_metadata is NOT editable by the user
    ...(metadata ? { user_metadata: metadata } : {}),
  }
  if (existing) {
    const { data, error } = await sb.auth.admin.updateUserById(existing.id, attrs)
    if (error) throw error
    return { user: data.user, created: false }
  }
  const { data, error } = await sb.auth.admin.createUser(attrs)
  if (error) throw error
  return { user: data.user, created: true }
}

async function setProfile(sb, userId, { rol, jugador_id, nombre }) {
  if (!ROLES.includes(rol)) die(`Rol no válido: ${rol}`)
  const row = { user_id: userId, rol, ...(jugador_id !== undefined ? { jugador_id } : {}), ...(nombre ? { nombre } : {}) }
  const { error } = await sb.from('perfiles').upsert(row, { onConflict: 'user_id' })
  if (error) throw error
}

async function resolveTarget(sb, target) {
  const m = /^jugador:(\d+)$/.exec(target || '')
  const email = m ? playerEmail(m[1]) : target
  if (!email) die('Indica un email o jugador:<id>')
  const user = await findUserByEmail(sb, email)
  if (!user) die(`No existe la cuenta ${email}`)
  return user
}

async function getJugador(sb, id) {
  const { data, error } = await sb.from('jugadores').select('id, nombre, dorsal').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) die(`No existe el jugador ${id}`)
  return data
}

async function currentRole(sb, userId) {
  const { data } = await sb.from('perfiles').select('rol').eq('user_id', userId).maybeSingle()
  return data?.rol
}

// ── Commands ───────────────────────────────────────────────────────────────
async function cmdPlayer(sb, id, args) {
  const j = await getJugador(sb, Number(id))
  let pin = arg(args, 'pin')
  if (args.includes('--generate') || !pin) pin = generatePin()
  if (String(pin).length < MIN_PIN) die(`El PIN debe tener al menos ${MIN_PIN} caracteres`)
  const { user, created } = await upsertUser(sb, { email: playerEmail(j.id), password: String(pin), metadata: { jugador_id: j.id } })
  // Never downgrade an admin who is also a player
  const rol = (await currentRole(sb, user.id)) || 'jugador'
  await setProfile(sb, user.id, { rol, jugador_id: j.id })
  console.log(`✓ ${created ? 'Creada' : 'Actualizada'} cuenta de ${j.nombre} (#${j.dorsal ?? '-'}) · rol ${rol} · PIN: ${pin}`)
}

async function cmdPlayers(sb) {
  const { data: jugadores, error } = await sb.from('jugadores').select('id, nombre').order('id')
  if (error) throw error
  const { data: perfiles } = await sb.from('perfiles').select('jugador_id')
  const linked = new Set((perfiles || []).map((p) => p.jugador_id))
  const pending = jugadores.filter((j) => !linked.has(j.id))
  if (!pending.length) return console.log('Todos los jugadores tienen ya cuenta.')
  console.log('Comparte cada PIN en privado con su jugador:\n')
  for (const j of pending) await cmdPlayer(sb, j.id, ['--generate'])
}

async function cmdUser(sb, email, args) {
  if (!email?.includes('@')) die('Email no válido')
  const rol = arg(args, 'role') || 'admin'
  const jugadorId = arg(args, 'jugador') ? Number(arg(args, 'jugador')) : undefined
  if (jugadorId) await getJugador(sb, jugadorId)
  let password = arg(args, 'password')
  if (args.includes('--generate')) password = generatePin(12) + 'Aa!'
  if (password && password.length < 8) die('La contraseña de administración debe tener al menos 8 caracteres')
  const { user, created } = await upsertUser(sb, { email, password })
  if (created && !password) console.warn('! Cuenta creada sin contraseña: envíale un enlace de recuperación desde el panel de Supabase')
  await setProfile(sb, user.id, { rol, jugador_id: jugadorId })
  console.log(`✓ ${created ? 'Creado' : 'Actualizado'} ${email} · rol ${rol}${jugadorId ? ` · jugador ${jugadorId}` : ''}${password && args.includes('--generate') ? ` · contraseña: ${password}` : ''}`)
}

async function cmdRole(sb, target, rol) {
  if (!ROLES.includes(rol)) die(`Rol no válido. Usa: ${ROLES.join(', ')}`)
  const user = await resolveTarget(sb, target)
  await setProfile(sb, user.id, { rol })
  console.log(`✓ ${user.email} ahora es ${rol}. El cambio se aplica en su próxima recarga o renovación de sesión.`)
}

async function cmdDisable(sb, target) {
  const user = await resolveTarget(sb, target)
  const { error } = await sb.auth.admin.updateUserById(user.id, { ban_duration: '876000h' })
  if (error) throw error
  await sb.from('perfiles').delete().eq('user_id', user.id)
  console.log(`✓ ${user.email} desactivado: no podrá iniciar sesión ni renovar su sesión, y ha perdido su rol.`)
}

async function cmdList(sb) {
  const { data, error } = await sb.from('perfiles').select('user_id, rol, jugador_id, nombre, jugadores(nombre, dorsal)').order('rol')
  if (error) throw error
  const emails = {}
  for (let page = 1; page < 100; page++) {
    const { data: d } = await sb.auth.admin.listUsers({ page, perPage: 200 })
    d.users.forEach((u) => { emails[u.id] = u.email })
    if (d.users.length < 200) break
  }
  console.table(data.map((p) => ({
    rol: p.rol, email: emails[p.user_id] || '?', jugador: p.jugadores ? `${p.jugadores.nombre} (#${p.jugadores.dorsal ?? '-'})` : p.nombre || '',
  })))
}

/**
 * Imports the old PINs. `claves_jugadores.clave_hash` holds bcrypt hashes made by
 * pgcrypto (`crypt(pin, gen_salt('bf'))`). Supabase Auth also stores bcrypt, so the
 * hash is imported as-is and every player keeps the PIN they already know.
 */
async function cmdMigratePins(sb) {
  const { data: claves, error } = await sb.from('claves_jugadores').select('jugador_id, clave_hash')
  if (error) die(`No se pudo leer claves_jugadores: ${error.message}`)
  if (!claves.length) return console.log('No hay PINs antiguos que migrar.')
  let ok = 0
  for (const c of claves) {
    try {
      const { user } = await upsertUser(sb, { email: playerEmail(c.jugador_id), passwordHash: c.clave_hash, metadata: { jugador_id: c.jugador_id } })
      const rol = (await currentRole(sb, user.id)) || 'jugador'
      await setProfile(sb, user.id, { rol, jugador_id: c.jugador_id })
      ok++
      console.log(`✓ jugador ${c.jugador_id}: cuenta creada con su PIN de siempre`)
    } catch (e) {
      console.log(`✗ jugador ${c.jugador_id}: ${e.message} → asígnale uno nuevo con: node scripts/auth-admin.mjs player ${c.jugador_id} --generate`)
    }
  }
  console.log(`\n${ok}/${claves.length} migrados. Cuando todos funcionen, ejecuta supabase/cleanup/drop_claves_jugadores.sql`)
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main(argv) {
  const [cmd, a1, a2, ...rest] = argv
  const args = [a1, a2, ...rest].filter((x) => x !== undefined)
  const known = ['list', 'player', 'players', 'user', 'role', 'disable', 'migrate-pins']
  if (!known.includes(cmd)) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(2, 18).join('\n').replace(/^ \*/gm, ''))
    return
  }
  const sb = client()
  switch (cmd) {
    case 'list': return cmdList(sb)
    case 'player': return cmdPlayer(sb, a1, args.slice(1))
    case 'players': return cmdPlayers(sb)
    case 'user': return cmdUser(sb, a1, args.slice(1))
    case 'role': return cmdRole(sb, a1, a2)
    case 'disable': return cmdDisable(sb, a1)
    case 'migrate-pins': return cmdMigratePins(sb)
  }
}

// Run only when executed directly (not when imported by the tests)
if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/auth-admin.mjs')) {
  main(process.argv.slice(2)).catch((e) => die(e.message || String(e)))
}
