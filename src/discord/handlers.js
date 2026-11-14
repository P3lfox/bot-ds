import { AttachmentBuilder, MessageFlags, PermissionFlagsBits } from 'discord.js';
import { resolveGame } from '../squads/games.js';
import { casual, fill, say, T } from '../texts.js';
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
      content: say(T.completed, { game: squad.game.toLowerCase(), mentions: ids.map((id) => `<@${id}>`).join(' ') }),
      allowedMentions: { users: ids },
    });
    return notifier.notifyCompleted(squad);
  }

  /** Announces "ready" (minPlayers reached) or "complete" after joins. `warn` reports a failed WhatsApp notice. */
  async function announceJoinOutcome(squad, { completed, ready }, send, warn) {
    if (ready) {
      const ids = [...squad.members.keys()];
      const left = squad.capacity - ids.length;
      await send({
        content: say(T.ready, {
          count: ids.length,
          game: squad.game.toLowerCase(),
          mentions: ids.map((id) => `<@${id}>`).join(' '),
          left: left === 1 ? T.readyLeftOne : fill(T.readyLeftMany, { left }),
        }),
        allowedMentions: { users: ids },
      });
    }
    if (completed) {
      const result = await announceCompletion(squad, send);
      if (!result.ok) await warn(fill(T.completedNotifyFail, { reason: result.message }));
    }
  }

  async function handleSquadCommand(interaction) {
    const typed = interaction.options.getString('juego', true).trim();
    if (!typed) return replyEphemeral(interaction, T.noGame);
    const { name, capacity, minPlayers } = resolveGame(typed);

    const voiceChannel = interaction.member?.voice?.channel ?? null;
    const squad = manager.create({
      game: name,
      capacity,
      creatorId: interaction.user.id,
      creatorName: displayName(interaction),
      voiceChannelId: voiceChannel?.id ?? null,
      minPlayers,
    });

    // Everyone already in the creator's voice channel joins automatically.
    const outcome = { completed: false, ready: false };
    for (const member of voiceChannel?.members.values() ?? []) {
      if (outcome.completed || member.user.bot || member.id === interaction.user.id) continue;
      const result = manager.join(squad.id, member.id, member.displayName);
      outcome.completed = result.completed;
      outcome.ready ||= result.ready;
    }
    if (outcome.completed) outcome.ready = false;

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

    await announceJoinOutcome(squad, outcome, (payload) => interaction.followUp(payload), (text) => replyEphemeral(interaction, text));
  }

  async function handleJoin(interaction, squadId) {
    const outcome = manager.join(squadId, interaction.user.id, displayName(interaction));
    await interaction.update(squadMessagePayload(outcome.squad));
    await announceJoinOutcome(outcome.squad, outcome, (payload) => interaction.followUp(payload), (text) => replyEphemeral(interaction, text));
  }

  /** Whoever enters the voice channel of an open squad joins it. Leaving the channel does not remove anyone. */
  async function handleVoiceStateUpdate(oldState, newState) {
    try {
      const channelId = newState.channelId;
      const member = newState.member;
      if (!channelId || channelId === oldState.channelId || !member || member.user.bot) return;

      const squad = manager.findOpenByVoiceChannel(channelId);
      if (!squad || squad.members.has(member.id)) return;

      const outcome = manager.join(squad.id, member.id, member.displayName);
      await editSquadMessage(newState.guild.channels, squad);
      if (!outcome.completed && !outcome.ready) return;

      const textChannel = await newState.guild.channels.fetch(squad.channelId);
      await announceJoinOutcome(squad, outcome, (payload) => textChannel.send(payload), (text) => console.warn(`[squads] ${squad.game}: ${text}`));
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
    if (!squad) throw new SquadError('NOT_FOUND', T.errors.notFound);

    const remaining = manager.cooldownRemaining(squad);
    if (remaining > 0) {
      return replyEphemeral(interaction, say(T.cooldown, { time: formatDuration(remaining) }));
    }

    await interaction.deferReply({ flags: EPHEMERAL });
    const result = await notifier.notifyMissing(squad);
    if (result.ok) return replyEphemeral(interaction, say(T.notifyOk));
    if (result.reason === 'cooldown') {
      return replyEphemeral(interaction, say(T.cooldown, { time: formatDuration(result.remainingMs) }));
    }
    return replyEphemeral(interaction, fill(T.notifyFail, { reason: result.message }));
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
      if (err instanceof SquadError) return replyEphemeral(interaction, casual(err.message));
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
      if (interaction.isRepliable()) await replyEphemeral(interaction, say(T.unexpected));
    }
  }

  return { handleInteraction, handleVoiceStateUpdate };
}
