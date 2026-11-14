import { AttachmentBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { resolveGame } from '../squads/games.js';
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

/** Edits the squad message outside of an interaction. `channels` is a client or guild channel manager. Never throws. */
export async function editSquadMessage(channels, squad) {
  if (!squad.channelId || !squad.messageId) return;
  try {
    const channel = await channels.fetch(squad.channelId);
    const message = await channel.messages.fetch(squad.messageId);
    await message.edit(squadMessagePayload(squad));
  } catch (err) {
    console.error(`[discord] No se pudo actualizar el mensaje de la squad ${squad.id}:`, err.message ?? err);
  }
}

export function createHandlers({ manager, notifier, whatsapp }) {
  /** Mentions everyone and sends the single WhatsApp "complete" notice. Returns the WhatsApp result. */
  async function announceCompletion(squad, send) {
    const ids = [...squad.members.keys()];
    await send({
      content: `¡Squad completa para **${squad.game}**! ${ids.map((id) => `<@${id}>`).join(' ')} ¡a jugar!`,
      allowedMentions: { users: ids },
    });
    return notifier.notifyCompleted(squad);
  }

  async function handleSquadCommand(interaction) {
    const typed = interaction.options.getString('juego', true).trim();
    if (!typed) return replyEphemeral(interaction, 'Tenés que indicar un juego.');
    const { name, capacity } = resolveGame(typed);

    const voiceChannel = interaction.member?.voice?.channel ?? null;
    const squad = manager.create({
      game: name,
      capacity,
      creatorId: interaction.user.id,
      creatorName: displayName(interaction),
      voiceChannelId: voiceChannel?.id ?? null,
    });

    // Everyone already in the creator's voice channel joins automatically.
    let completed = false;
    for (const member of voiceChannel?.members.values() ?? []) {
      if (completed || member.user.bot || member.id === interaction.user.id) continue;
      completed = manager.join(squad.id, member.id, member.displayName).completed;
    }

    try {
      const response = await interaction.reply({ ...squadMessagePayload(squad), withResponse: true });
      const message = response.resource?.message;
      if (message) {
        Object.assign(squad, { channelId: message.channelId, messageId: message.id, messageUrl: message.url });
      }
    } catch (err) {
      manager.discard(squad.id);
      throw err;
    }

    if (completed) {
      const result = await announceCompletion(squad, (payload) => interaction.followUp(payload));
      if (!result.ok) await replyEphemeral(interaction, `No se pudo avisar por WhatsApp que la squad se completó: ${result.message}`);
    }
  }

  async function handleJoin(interaction, squadId) {
    const { squad, completed } = manager.join(squadId, interaction.user.id, displayName(interaction));
    await interaction.update(squadMessagePayload(squad));
    if (!completed) return;

    const result = await announceCompletion(squad, (payload) => interaction.followUp(payload));
    if (!result.ok) {
      await replyEphemeral(interaction, `No se pudo avisar por WhatsApp que la squad se completó: ${result.message}`);
    }
  }

  /** Whoever enters the voice channel of an open squad joins it. Leaving the channel does not remove anyone. */
  async function handleVoiceStateUpdate(oldState, newState) {
    try {
      const channelId = newState.channelId;
      const member = newState.member;
      if (!channelId || channelId === oldState.channelId || !member || member.user.bot) return;

      const squad = manager.findOpenByVoiceChannel(channelId);
      if (!squad || squad.members.has(member.id)) return;

      const { completed } = manager.join(squad.id, member.id, member.displayName);
      await editSquadMessage(newState.guild.channels, squad);
      if (!completed) return;

      const textChannel = await newState.guild.channels.fetch(squad.channelId);
      const result = await announceCompletion(squad, (payload) => textChannel.send(payload));
      if (!result.ok) console.warn(`[squads] No se pudo avisar por WhatsApp que la squad de ${squad.game} se completó: ${result.message}`);
    } catch (err) {
      if (err instanceof SquadError) return;
      console.error('[discord] Error manejando el cambio de canal de voz:', err);
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
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return replyEphemeral(interaction, 'Necesitás el permiso "Gestionar servidor" para usar este comando.');
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

  return { handleInteraction, handleVoiceStateUpdate };
}
