# MVP del partido (votación de la afición)

## Cómo funciona

- Cuando un partido se marca como **jugado**, se abre la votación del MVP. Puede votar cualquiera, sin registrarse.
- **Cerrar el partido:** los partidos cuya votación se abriría se marcan como jugados desde su página, en el panel «Cerrar el partido» (solo admins), no desde el formulario de Admin › Partidos. El botón «Confirmar partido jugado» solo se activa cuando el partido ha empezado, hay convocatoria, el once titular está completo (11), la línea de tiempo está revisada y están los candidatos al MVP. El resultado sale de los goles de la línea de tiempo. Al confirmar se publica el resultado, se calculan las estadísticas, se abre la votación y se envía la notificación a la afición. Hasta entonces, la alineación y la línea de tiempo solo las ve el club; el público solo ve la información del partido y la convocatoria.
- La votación **cierra a las 23:59 (hora de Madrid) del día siguiente a la fecha del partido**. Ejemplo: partido el sábado → cierra el domingo a las 23:59.
- Mientras está abierta, la pantalla de inicio muestra el resultado en grande con el botón «Vota al MVP del partido». Al cerrar, inicio enseña la tarjeta del MVP hasta el siguiente partido.
- **Candidatos:** solo se puede votar a **5 jugadores elegidos por un superadmin** de entre los convocados (si hay menos de 5 convocados, entran todos). Se eligen en el panel **«Cerrar el partido»** de la página del partido (ver abajo). Orden en pantalla: primero quienes tienen goles o asistencias, después por minutos jugados y luego por dorsal.
  - Sin convocatoria y sin candidatos no se puede marcar el partido como jugado (mientras su votación estaría abierta; los partidos antiguos que se metan tarde no lo necesitan).
  - Solo un superadmin elige o cambia los candidatos, y solo mientras nadie haya votado. Si ya están elegidos, un admin sí puede marcar el partido como jugado.
  - Un candidato no se puede quitar de la convocatoria.
  - Partidos anteriores a este cambio (sin candidatos): se vota entre todos los convocados.
- Cada persona tiene **un voto** y puede **cambiarlo** hasta el cierre.
- Al cerrar, el MVP se guarda solo en `partidos.mvp_jugador_id`: gana el más votado. **Empate:** gana quien va antes en el orden anterior (goles/asistencias, minutos, dorsal).
- Mientras la votación está abierta, nadie (ni un admin) puede poner el MVP a mano. Después del cierre, un admin puede corregirlo desde el panel de estadísticas; se le pide confirmación.
- Los votos antiguos de jugadores (`votos_mvp`) se copian a la nueva tabla al aplicar la migración. La tabla antigua no se borra.
- Admins y superadmins ven un botón 📲 en la tarjeta del ganador que crea una imagen de 1080×1350 para Instagram (o la descarga si el móvil no permite compartir).

## Cómo se evita votar varias veces

1. **Sesión anónima de Supabase.** La primera vez que alguien vota, la app crea un usuario anónimo (`signInAnonymously`) que se guarda en ese navegador. Hay un índice único por partido y usuario, así que ese navegador solo cuenta una vez.
2. **Límite por conexión.** Desde una misma IP se aceptan como máximo 5 votos nuevos por partido; los votos de un bar o una casa con wifi compartido siguen contando. No se guarda la IP, solo un hash con sal, y se borra al cerrar la votación.
3. **Límite de Supabase.** Supabase solo permite 30 inicios de sesión anónimos por hora y por IP.

Limitaciones: alguien con varios dispositivos o datos móviles puede votar más de una vez. Para un club de este tamaño es suficiente. Si hiciera falta, se puede activar Cloudflare Turnstile (CAPTCHA) en Supabase, pero se aplica a **todos** los inicios de sesión, también a los de admins.

Las sesiones anónimas no dan ningún permiso extra: `applySession` las trata como visitante, y las RLS existentes solo dan acceso de equipo o admin a perfiles reales.

## Puesta en marcha en Supabase

1. **Authentication → Sign In / Providers**: activa **«Allow anonymous sign-ins»** y también **«Allow new users to sign up»** (Supabase cuenta cada votante anónimo como un registro nuevo). Deja **«Confirm email»** activado. Sin esto, votar muestra «La votación no está disponible ahora mismo».
2. Ejecuta las migraciones `supabase/migrations/20261020000000_mvp_votacion_abierta.sql` y `20261022000000_mvp_finalistas.sql`, en ese orden (SQL Editor o `supabase db push`).
3. *(Opcional)* **Integrations → Cron** (pg_cron). Si está activo antes de la migración, se programan dos tareas:
   - `cerrar-votaciones-mvp` (cada 10 min): guarda el MVP aunque nadie abra la app.
   - `limpiar-votantes-anonimos` (diaria): borra los usuarios anónimos de más de 30 días. Sus votos se mantienen.

   Si lo activas después, vuelve a ejecutar el bloque `DO $$ … $$` del final de la migración. Sin cron también funciona: el MVP se guarda la primera vez que alguien abre la app tras el cierre.

## Plan gratuito

Cada votante anónimo cuenta como usuario activo mensual (MAU). El plan gratuito incluye 50.000 MAU, y cada voto ocupa unos pocos cientos de bytes en la base de datos.
