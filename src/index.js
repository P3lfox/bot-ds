import { loadConfig, SQUAD_DEFAULTS, WA_AUTH_DIR } from './config.js';
import { SquadManager } from './squads/squadManager.js';
import { createSquadNotifier } from './squads/notifier.js';
import { createWhatsApp } from './whatsapp/client.js';
import { createDiscordBot } from './discord/client.js';

process.on('unhandledRejection', (reason) => console.error('[proceso] Promesa rechazada sin manejar:', reason));
process.on('uncaughtException', (err) => console.error('[proceso] Excepción no capturada:', err));

let config;
try {
  config = loadConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const WA_EVENT_TEXT = {
  connected: '✅ WhatsApp conectado.',
  reconnected: '✅ WhatsApp se reconectó.',
  disconnected: '⚠️ WhatsApp se desconectó. Intentando reconectar...',
  logged_out:
    '🛑 La sesión de WhatsApp se cerró desde el celular. Borrá la carpeta sesion_wa y reiniciá el bot para vincular de nuevo con un código.',
};

const whatsapp = createWhatsApp({
  phoneNumber: config.waPhoneNumber,
  groupId: config.waGroupId,
  authDir: WA_AUTH_DIR,
  onEvent: ({ type, detail }) => {
    const text = WA_EVENT_TEXT[type];
    if (text) discord.notifyAdmin(detail ? `${text} (${detail})` : text);
  },
  onGroupReply: (reply) => discord.relayWhatsAppReply(reply),
});

const manager = new SquadManager({
  expireMs: SQUAD_DEFAULTS.expireMs,
  autoNotifyMs: SQUAD_DEFAULTS.autoNotifyMs,
  cooldownMs: SQUAD_DEFAULTS.cooldownMs,
  onExpire: (squad) => discord.onSquadExpired(squad),
  onAutoNotify: (squad) => discord.onAutoNotify(squad),
});

const notifier = createSquadNotifier({ manager, whatsapp });
const discord = createDiscordBot({ config, manager, notifier, whatsapp });

function shutdown(signal) {
  console.log(`[proceso] ${signal} recibido, cerrando...`);
  whatsapp.stop();
  discord.destroy().finally(() => process.exit(0));
}
process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

whatsapp.start();
discord.login().catch((err) => {
  console.error('[discord] No se pudo iniciar sesión. Revisá DISCORD_TOKEN:', err.message ?? err);
  process.exit(1);
});
