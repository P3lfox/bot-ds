import { Client, Events, GatewayIntentBits } from 'discord.js';
import { createHandlers } from './handlers.js';
import { squadMessagePayload } from './squadView.js';

export function createDiscordBot({ config, manager, notifier, whatsapp }) {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const { handleInteraction } = createHandlers({ manager, notifier, whatsapp });
  const pendingAdminMessages = [];

  client.once(Events.ClientReady, (c) => {
    console.log(`[discord] Conectado como ${c.user.tag}.`);
    for (const text of pendingAdminMessages.splice(0)) notifyAdmin(text);
  });
  client.on(Events.InteractionCreate, (interaction) => {
    handleInteraction(interaction);
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

  /** Edits the squad message outside of an interaction (expiry, auto notices). */
  async function refreshSquadMessage(squad) {
    if (!squad.channelId || !squad.messageId) return;
    try {
      const channel = await client.channels.fetch(squad.channelId);
      const message = await channel.messages.fetch(squad.messageId);
      await message.edit(squadMessagePayload(squad));
    } catch (err) {
      console.error(`[discord] No se pudo actualizar el mensaje de la squad ${squad.id}:`, err.message ?? err);
    }
  }

  async function onAutoNotify(squad) {
    const result = await notifier.notifyMissing(squad);
    if (!result.ok && result.reason !== 'cooldown' && result.reason !== 'in_progress') {
      await notifyAdmin(`No se pudo enviar el aviso automático por WhatsApp de la squad de ${squad.game}: ${result.message}`);
    }
  }

  return {
    login: () => client.login(config.discordToken),
    destroy: () => client.destroy(),
    notifyAdmin,
    onSquadExpired: refreshSquadMessage,
    onAutoNotify,
  };
}
