import { AttachmentBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { SQUAD_DEFAULTS } from '../config.js';
import { SquadError } from '../squads/squadManager.js';
import { formatDuration } from '../squads/messages.js';
import { WhatsAppUnavailableError } from '../whatsapp/errors.js';
import { ButtonAction, parseButtonId, squadMessagePayload } from './squadView.js';

const EPHEMERAL = MessageFlags.Ephemeral;

function displayName(interaction) {
  return interaction.member?.displayName ?? interaction.user.globalName ?? interaction.user.username;
}

/** Replies ephemerally whatever the interaction state is. Never throws. */
export async function replyEphemeral(interaction, content) {
  try {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply({ content });
    } else if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content, flags: EPHEMERAL });
    } else {
      await interaction.reply({ content, flags: EPHEMERAL });
    }
  } catch (err) {
    console.error('[discord] No se pudo responder la interacción:', err.message ?? err);
  }
}

export function createHandlers({ manager, notifier, whatsapp }) {
  async function handleSquadCommand(interaction) {
    const game = interaction.options.getString('juego', true).trim();
    const capacity = interaction.options.getInteger('cupo') ?? SQUAD_DEFAULTS.capacity;
    if (!game) return replyEphemeral(interaction, 'Tenés que indicar un juego.');

    const squad = manager.create({ game, capacity, creatorId: interaction.user.id, creatorName: displayName(interaction) });
    try {
      const response = await interaction.reply({ ...squadMessagePayload(squad), withResponse: true });
      const message = response.resource?.message;
      if (message) {
        manager.attachMessage(squad.id, { channelId: message.channelId, messageId: message.id, url: message.url });
      }
    } catch (err) {
      manager.discard(squad.id);
      throw err;
    }
  }

  async function handleJoin(interaction, squadId) {
    const { squad, completed } = manager.join(squadId, interaction.user.id, displayName(interaction));
    await interaction.update(squadMessagePayload(squad));
    if (!completed) return;

    const ids = [...squad.members.keys()];
    await interaction.followUp({
      content: `¡Squad completa para **${squad.game}**! ${ids.map((id) => `<@${id}>`).join(' ')} ¡a jugar!`,
      allowedMentions: { users: ids },
    });
    const result = await notifier.notifyCompleted(squad);
    if (!result.ok) {
      await replyEphemeral(interaction, `No se pudo avisar por WhatsApp que la squad se completó: ${result.message}`);
    }
  }

  async function handleLeave(interaction, squadId) {
    const squad = manager.leave(squadId, interaction.user.id);
    await interaction.update(squadMessagePayload(squad));
  }

  async function handleCancel(interaction, squadId) {
    const squad = manager.cancel(squadId, interaction.user.id);
    await interaction.update(squadMessagePayload(squad));
  }

  async function handleNotify(interaction, squadId) {
    const squad = manager.get(squadId);
    if (!squad) throw new SquadError('NOT_FOUND', 'Esta squad ya no está activa.');

    const remaining = manager.cooldownRemaining(squad);
    if (remaining > 0) {
      return replyEphemeral(interaction, `Ya se avisó hace poco. Podés volver a avisar en ${formatDuration(remaining)}.`);
    }

    await interaction.deferReply({ flags: EPHEMERAL });
    const result = await notifier.notifyMissing(squad);
    if (result.ok) return replyEphemeral(interaction, 'Listo, avisé al grupo de WhatsApp.');
    if (result.reason === 'cooldown') {
      return replyEphemeral(interaction, `Ya se avisó hace poco. Podés volver a avisar en ${formatDuration(result.remainingMs)}.`);
    }
    return replyEphemeral(interaction, `No se pudo enviar el aviso por WhatsApp: ${result.message}`);
  }

  const buttonHandlers = {
    [ButtonAction.JOIN]: handleJoin,
    [ButtonAction.LEAVE]: handleLeave,
    [ButtonAction.CANCEL]: handleCancel,
    [ButtonAction.NOTIFY]: handleNotify,
  };

  async function handleButton(interaction) {
    const parsed = parseButtonId(interaction.customId);
    if (!parsed) return;
    try {
      await buttonHandlers[parsed.action](interaction, parsed.squadId);
    } catch (err) {
      if (err instanceof SquadError) return replyEphemeral(interaction, err.message);
      throw err;
    }
  }

  async function handleWaGroups(interaction) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return replyEphemeral(interaction, 'Este comando es solo para administradores.');
    }
    await interaction.deferReply({ flags: EPHEMERAL });
    let groups;
    try {
      groups = await whatsapp.listarGrupos();
    } catch (err) {
      if (err instanceof WhatsAppUnavailableError) return replyEphemeral(interaction, `No se pudieron listar los grupos: ${err.message}`);
      throw err;
    }
    if (groups.length === 0) return replyEphemeral(interaction, 'El número del bot no está en ningún grupo de WhatsApp.');

    const lines = groups.map((g) => `• **${g.name}** — \`${g.id}\``);
    const content = `Grupos de WhatsApp (${groups.length}). Copiá el ID en WA_GROUP_ID del .env:\n${lines.join('\n')}`;
    if (content.length <= 2000) return interaction.editReply({ content });

    const file = new AttachmentBuilder(Buffer.from(groups.map((g) => `${g.name}\t${g.id}`).join('\n'), 'utf8'), { name: 'grupos-whatsapp.txt' });
    return interaction.editReply({ content: `Grupos de WhatsApp (${groups.length}). La lista es larga, va como archivo:`, files: [file] });
  }

  const commandHandlers = { squad: handleSquadCommand, 'wa-grupos': handleWaGroups };

  /** Routes any interaction; errors are logged and reported to the user, never rethrown. */
  async function handleInteraction(interaction) {
    try {
      if (interaction.isChatInputCommand()) {
        const handler = commandHandlers[interaction.commandName];
        if (handler) await handler(interaction);
      } else if (interaction.isButton()) {
        await handleButton(interaction);
      }
    } catch (err) {
      console.error('[discord] Error manejando la interacción:', err);
      if (interaction.isRepliable()) await replyEphemeral(interaction, 'Ocurrió un error inesperado. Probá de nuevo en un rato.');
    }
  }

  return { handleInteraction };
}
