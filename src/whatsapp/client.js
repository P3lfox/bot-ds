import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { WhatsAppUnavailableError } from './errors.js';
import { routeGroupReplies } from './replies.js';

const MAX_BACKOFF_MS = 60_000;

/**
 * WhatsApp connection (Baileys v7) with pairing-code login, persistent session
 * and automatic reconnection, except when the session was closed from the phone.
 *
 * `onEvent` receives { type: 'connected' | 'reconnected' | 'disconnected' | 'logged_out', detail? }.
 * `onGroupReply` receives { quotedId, text, senderName } for replies quoting a message in the group.
 */
export function createWhatsApp({ phoneNumber, groupId, authDir, onEvent = () => {}, onGroupReply = () => {}, logger = console }) {
  const baileysLogger = pino({ level: process.env.WA_LOG_LEVEL ?? 'error' });
  const groupCache = new Map();

  let sock = null;
  let connected = false;
  let everConnected = false;
  let alertedDown = false;
  let attempts = 0;
  let reconnectTimer = null;
  let stopped = false;

  function emit(type, detail) {
    try {
      onEvent({ type, detail });
    } catch (err) {
      logger.error('[whatsapp] Error en el manejador de eventos:', err);
    }
  }

  function scheduleReconnect(immediate) {
    if (stopped) return;
    const delay = immediate ? 0 : Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempts);
    attempts += 1;
    logger.log(`[whatsapp] Reconectando en ${Math.round(delay / 1000)} s...`);
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      connect().catch((err) => {
        logger.error('[whatsapp] Error al reconectar:', err);
        scheduleReconnect(false);
      });
    }, delay);
  }

  async function connect() {
    if (stopped) return;
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    // Returns the bundled default version if GitHub is unreachable.
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      version,
      auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, baileysLogger) },
      logger: baileysLogger,
      browser: Browsers.ubuntu('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
      cachedGroupMetadata: async (jid) => groupCache.get(jid),
      getMessage: async () => undefined,
    });
    sock = socket;
    let pairingRequested = false;

    socket.ev.on('creds.update', saveCreds);

    socket.ev.on('groups.update', (updates) => {
      for (const update of updates) groupCache.delete(update.id);
    });
    socket.ev.on('group-participants.update', ({ id }) => groupCache.delete(id));

    socket.ev.on('messages.upsert', (event) => {
      // Ignore events buffered by a replaced socket so a reply is not relayed twice.
      if (socket !== sock) return;
      routeGroupReplies(event, groupId, onGroupReply, logger);
    });

    socket.ev.on('connection.update', async (update) => {
      if (socket !== sock) return;
      const { connection, lastDisconnect, qr } = update;

      // The 'qr' event means the socket is ready to pair; we use a pairing code instead.
      if (qr && !socket.authState.creds.registered && !pairingRequested) {
        pairingRequested = true;
        try {
          const code = await socket.requestPairingCode(phoneNumber);
          const pretty = code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
          logger.log('\n==============================================');
          logger.log(`  CÓDIGO DE VINCULACIÓN DE WHATSAPP: ${pretty}`);
          logger.log('  En el celular: WhatsApp > Dispositivos vinculados >');
          logger.log('  Vincular un dispositivo > Vincular con el número de teléfono.');
          logger.log('==============================================\n');
        } catch (err) {
          logger.error('[whatsapp] No se pudo pedir el código de vinculación:', err);
        }
      }

      if (connection === 'open') {
        connected = true;
        attempts = 0;
        logger.log('[whatsapp] Conectado.');
        if (alertedDown) emit('reconnected');
        else if (!everConnected) emit('connected');
        everConnected = true;
        alertedDown = false;
      }

      if (connection === 'close') {
        connected = false;
        groupCache.clear();
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const reason = lastDisconnect?.error?.message ?? 'desconocido';

        if (statusCode === DisconnectReason.loggedOut) {
          logger.error('[whatsapp] La sesión fue cerrada desde el celular. No se reconecta.');
          emit('logged_out');
          return;
        }

        logger.warn(`[whatsapp] Conexión cerrada (código ${statusCode ?? 'n/d'}: ${reason}).`);
        // 515 happens right after pairing and is part of the normal flow.
        const isRestart = statusCode === DisconnectReason.restartRequired;
        if (!isRestart && everConnected && !alertedDown) {
          alertedDown = true;
          emit('disconnected', `código ${statusCode ?? 'n/d'}: ${reason}`);
        }
        scheduleReconnect(isRestart);
      }
    });
  }

  async function avisarGrupo(text) {
    if (!groupId) throw new WhatsAppUnavailableError('WA_GROUP_ID no está configurado.');
    if (!connected || !sock) throw new WhatsAppUnavailableError('WhatsApp no está conectado.');
    if (!groupCache.has(groupId)) {
      groupCache.set(groupId, await sock.groupMetadata(groupId));
    }
    const sent = await sock.sendMessage(groupId, { text });
    return { id: sent?.key?.id ?? null };
  }

  async function listarGrupos() {
    if (!connected || !sock) throw new WhatsAppUnavailableError('WhatsApp no está conectado.');
    const groups = await sock.groupFetchAllParticipating();
    return Object.values(groups)
      .map((g) => {
        groupCache.set(g.id, g);
        return { id: g.id, name: g.subject || '(sin nombre)' };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  function start() {
    connect().catch((err) => {
      logger.error('[whatsapp] Error al iniciar:', err);
      scheduleReconnect(false);
    });
  }

  function stop() {
    stopped = true;
    clearTimeout(reconnectTimer);
    try {
      sock?.end(undefined);
    } catch {
      // ignore errors while shutting down
    }
  }

  return { start, stop, avisarGrupo, listarGrupos, isConnected: () => connected };
}
