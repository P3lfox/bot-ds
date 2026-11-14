import { Client, Events, GatewayIntentBits } from 'discord.js';
import { createHandlers, editSquadMessage } from './handlers.js';
import { createReplyRelay } from './relay.js';

export function createDiscordBot({ config, manager, notifier, whatsapp }) {
  // GuildVoiceStates is not privileged: it only needs to be declared here, not in the developer portal.
  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });
  const { handleInteraction, handleVoiceStateUpdate } = createHandlers({ manager, notifier, whatsapp });
  const pendingAdminMessages = [];

  client.once(Events.ClientReady, (c) => {
    console.log(`[discord] Conectado como ${c.user.tag}.`);
    for (const text of pendingAdminMessages.splice(0)) notifyAdmin(text);
  });
  client.on(Events.InteractionCreate, (interaction) => {
    handleInteraction(interaction);
  });
  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    handleVoiceStateUpdate(oldState, newState);
  });
  client.on(Events.Error, (err) => console.error('[discord] Error del cliente:', err));
  client.on(Events.Warn, (msg) => console.warn('[discord]', msg));

  async function notifyAdmin(text) {
    console.log(`[admin] ${text}`);
    if (!config.discordAdminChannelId) return;
    if (!client.isReady()) {
      pendingAdminMessages.push(text);
      return;
    }
    try {
      const channel = await client.channels.fetch(config.discordAdminChannelId);
      if (!channel?.isSendable()) throw new Error('el canal no existe o el bot no puede escribir ahí');
      await channel.send({ content: text, allowedMentions: { parse: [] } });
    } catch (err) {
      console.error('[discord] No se pudo avisar en el canal de administración:', err.message ?? err);
    }
  }

  async function onAutoNotify(squad) {
    const result = await notifier.notifyMissing(squad);
    if (!result.ok && result.reason !== 'cooldown' && result.reason !== 'in_progress') {
      await notifyAdmin(`No se pudo enviar el aviso automático por WhatsApp de la squad de ${squad.game}: ${result.message}`);
    }
  }

  /** Posts a WhatsApp reply to one of our notices as a reply to the squad's Discord message. */
  const relayWhatsAppReply = createReplyRelay({
    findNotice: (id) => notifier.findNotice(id),
    fetchChannel: (id) => (client.isReady() ? client.channels.fetch(id) : null),
  });

  return {
    relayWhatsAppReply,
    login: () => client.login(config.discordToken),
    destroy: () => client.destroy(),
    notifyAdmin,
    onSquadExpired: (squad) => editSquadMessage(client.channels, squad),
    onAutoNotify,
  };
}
