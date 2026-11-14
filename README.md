# Bot de squads (Discord + WhatsApp)

Bot de Discord que arma squads para jugar con `/squad` y avisa a un grupo de WhatsApp cuando falta gente.

- Node.js 20+ (ES modules)
- [discord.js](https://discord.js.org) v14
- [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) `7.0.0-rc14` (versión fijada a propósito: la v7 trae cambios incompatibles con los ejemplos de la v6 y todavía es release candidate)
- Sin base de datos ni navegador: las squads viven en memoria y se pierden al reiniciar. Consume bastante menos de 1 GB de RAM.

## Cómo funciona

| Acción | Resultado |
| --- | --- |
| `/squad juego:<texto>` | Publica la squad. El cupo sale del juego (`valo` → Valorant, 5; `fortnite` → 4; ver abajo). El creador queda anotado. |
| Creador en un canal de voz | Quienes ya están en ese canal quedan anotados, y quien entre mientras la squad está abierta también. Salir del canal no da de baja. |
| **Me sumo / Me bajo** | Actualiza el embed. El creador no puede bajarse: usa **Cancelar**. |
| **Avisar por WhatsApp** | Manda al grupo: `Faltan X para la squad de {juego}. Están: {nombres}. Sumate en Discord: {link}`. Cooldown de 10 minutos por squad. |
| **Cancelar** | Solo el creador. Desactiva los botones. |
| Cupo completo | Menciona a todos, desactiva los botones y manda un único aviso de "squad completa" al grupo. |
| A los 5 minutos | Si todavía falta gente y no hay cooldown activo, avisa automáticamente por WhatsApp. |
| A los 30 minutos | Si no se completó, expira y se desactivan los botones. |
| `/wa-grupos` | Requiere el permiso "Gestionar servidor". Lista los grupos de WhatsApp del número, con nombre e ID. |

Juegos reconocidos (se ignoran mayúsculas, acentos y espacios): Valorant `valo` (5), League of Legends `lol` (5), Fortnite `fn` (4), Counter-Strike 2 `cs` (5), Dota 2 (5), Overwatch 2 `ow` (5), Rainbow Six Siege `r6` (5), Apex Legends (3), Rocket League `rl` (3), Warzone `wz` (4), PUBG (4), Marvel Rivals (6). Cualquier otro juego usa un cupo de 5. La lista se edita en `src/squads/games.js`.

Si WhatsApp no está conectado, el bot responde en Discord que el aviso no se pudo enviar (los avisos automáticos fallidos se informan en el canal de administración). Las desconexiones y el cierre de sesión de WhatsApp también se avisan en ese canal.

## 1. Crear la aplicación de Discord

1. Entrá a <https://discord.com/developers/applications> → **New Application**.
2. En **General Information** copiá el **Application ID** → `DISCORD_CLIENT_ID`.
3. En **Bot** → **Reset Token** y copiá el token → `DISCORD_TOKEN`. No hace falta activar ningún *Privileged Gateway Intent*: el bot solo usa el intent `Guilds`.
4. En **OAuth2 → URL Generator** marcá los scopes `bot` y `applications.commands`, y estos permisos de bot:
   - View Channels
   - Send Messages
   - Embed Links
   - Read Message History (para editar el mensaje de la squad cuando expira)
   - Attach Files (solo para `/wa-grupos` cuando la lista es muy larga)
   - View Channel también en los canales de voz, para ver quién está conectado (el intent `GuildVoiceStates` no es privilegiado y no hay que activarlo en el portal)
5. Abrí la URL generada e invitá el bot a tu servidor.
6. En Discord activá **Configuración → Avanzado → Modo desarrollador**. Clic derecho en el servidor → **Copiar ID del servidor** → `DISCORD_GUILD_ID`. Clic derecho en el canal de administración → **Copiar ID del canal** → `DISCORD_ADMIN_CHANNEL_ID`.

## 2. Configurar

```bash
npm install
cp .env.example .env   # y completá los valores
```

Contenido de `.env.example`:

```dotenv
# Discord
DISCORD_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DISCORD_ADMIN_CHANNEL_ID=

# WhatsApp
# Número del bot con código de país, sin "+" ni espacios (ej: 5491112345678)
WA_PHONE_NUMBER=
# ID del grupo (termina en @g.us). Obtenelo con /wa-grupos una vez vinculado.
WA_GROUP_ID=
```

`WA_GROUP_ID` puede quedar vacío la primera vez: lo vas a obtener en el paso 4.

## 3. Registrar los comandos y vincular WhatsApp

```bash
npm run register   # registra /squad y /wa-grupos en tu servidor (repetilo si cambian los comandos)
npm start
```

En el primer arranque no hay sesión, así que en la consola aparece:

```
==============================================
  CÓDIGO DE VINCULACIÓN DE WHATSAPP: ABCD-1234
  ...
==============================================
```

En el celular del número del bot: **WhatsApp → Dispositivos vinculados → Vincular un dispositivo → Vincular con el número de teléfono** e ingresá el código. El código vence en poco tiempo; si se vence, el bot se reconecta y muestra uno nuevo.

La sesión queda guardada en `./sesion_wa` y no hace falta volver a vincular en los próximos arranques. Si cerrás la sesión desde el celular, el bot avisa en el canal de administración y deja de reconectar: borrá `./sesion_wa` y reiniciá para vincular de nuevo.

> Usá un número dedicado al bot. WhatsApp no tiene una API oficial para esto y puede bloquear números que se comporten como spam.

## 4. Obtener el ID del grupo

1. Agregá el número del bot al grupo de WhatsApp.
2. En Discord, con un rol que tenga "Gestionar servidor", ejecutá `/wa-grupos`.
3. Copiá el ID (algo como `120363012345678901@g.us`) en `WA_GROUP_ID` y reiniciá el bot.

## 5. Desplegar

Cualquier hosting con Node.js 20+ y disco persistente sirve (VPS, Pterodactyl, Railway, etc.):

1. Subí el proyecto **sin** `node_modules`, `.env` ni `sesion_wa`.
2. Cargá las variables de entorno en el panel (o subí el `.env`).
3. Comando de instalación: `npm install --omit=dev`. Comando de inicio: `npm start`.
4. Ejecutá `npm run register` una vez (desde el panel o desde tu máquina).
5. Mirá la consola del panel para ver el código de vinculación del primer arranque.
6. Asegurate de que `sesion_wa/` esté en un disco persistente: si se borra en cada deploy, vas a tener que vincular de nuevo.

Corré una sola instancia del bot por número: dos procesos con la misma sesión se desconectan entre sí.

Variable opcional: `WA_LOG_LEVEL` (`error` por defecto; `info` o `debug` para diagnosticar la conexión de WhatsApp).

## Desarrollo

```bash
npm test
```

```
src/index.js        arranque de ambos clientes
src/config.js       variables de entorno y tiempos de las squads
src/discord/        cliente, comandos, registro, vista de la squad y handlers
src/whatsapp/       conexión de Baileys, avisarGrupo() y listarGrupos()
src/squads/         lógica de squads (crear, sumar, bajar, expirar, cooldown) y avisos
```
# bot-ds
