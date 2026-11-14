import dotenv from 'dotenv';

dotenv.config({ quiet: true });

export const SQUAD_DEFAULTS = Object.freeze({
  capacity: 5,
  minCapacity: 2,
  maxCapacity: 20,
  expireMs: 30 * 60_000,
  autoNotifyMs: 5 * 60_000,
  cooldownMs: 10 * 60_000,
});

export const WA_AUTH_DIR = './sesion_wa';

function read(name) {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

/**
 * Loads and validates the environment. `scope` 'register' only needs the
 * Discord application credentials.
 */
export function loadConfig({ scope = 'bot' } = {}) {
  const config = {
    discordToken: read('DISCORD_TOKEN'),
    discordClientId: read('DISCORD_CLIENT_ID'),
    discordGuildId: read('DISCORD_GUILD_ID'),
    discordAdminChannelId: read('DISCORD_ADMIN_CHANNEL_ID'),
    waPhoneNumber: read('WA_PHONE_NUMBER'),
    waGroupId: read('WA_GROUP_ID'),
  };

  const required = { DISCORD_TOKEN: config.discordToken, DISCORD_CLIENT_ID: config.discordClientId, DISCORD_GUILD_ID: config.discordGuildId };
  if (scope === 'bot') required.WA_PHONE_NUMBER = config.waPhoneNumber;

  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    throw new Error(`Faltan variables de entorno: ${missing.join(', ')}. Revisá tu archivo .env (ver .env.example).`);
  }

  if (scope === 'bot') {
    if (!/^\d{8,15}$/.test(config.waPhoneNumber)) {
      throw new Error('WA_PHONE_NUMBER debe tener solo dígitos, con código de país y sin "+" (ej: 5491112345678).');
    }
    if (config.waGroupId && !config.waGroupId.endsWith('@g.us')) {
      throw new Error('WA_GROUP_ID debe terminar en "@g.us". Usá /wa-grupos para obtenerlo.');
    }
    if (!config.discordAdminChannelId) {
      console.warn('[config] DISCORD_ADMIN_CHANNEL_ID no está configurado: los avisos de administración solo se verán en la consola.');
    }
    if (!config.waGroupId) {
      console.warn('[config] WA_GROUP_ID no está configurado: los avisos por WhatsApp fallarán hasta que lo cargues (usá /wa-grupos).');
    }
  }

  return config;
}
