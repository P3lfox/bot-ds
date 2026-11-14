import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { SquadStatus } from '../squads/squadManager.js';

export const ButtonAction = Object.freeze({
  JOIN: 'join',
  LEAVE: 'leave',
  NOTIFY: 'notify',
  CANCEL: 'cancel',
});

const PREFIX = 'squad';

export function buttonId(action, squadId) {
  return `${PREFIX}:${action}:${squadId}`;
}

export function parseButtonId(customId) {
  const [prefix, action, squadId] = customId.split(':');
  if (prefix !== PREFIX || !Object.values(ButtonAction).includes(action) || !squadId) return null;
  return { action, squadId };
}

const STATUS_VIEW = {
  [SquadStatus.OPEN]: { color: 0x5865f2, label: 'Abierta' },
  [SquadStatus.FULL]: { color: 0x57f287, label: 'Completa' },
  [SquadStatus.EXPIRED]: { color: 0x99aab5, label: 'Expirada' },
  [SquadStatus.CANCELLED]: { color: 0xed4245, label: 'Cancelada' },
};

const READY_VIEW = { color: 0xfee75c, label: 'Lista para jugar' };

export function buildSquadEmbed(squad) {
  const ready = squad.status === SquadStatus.OPEN && squad.minPlayers != null && squad.members.size >= squad.minPlayers;
  const view = ready ? READY_VIEW : STATUS_VIEW[squad.status];
  const ids = [...squad.members.keys()];
  const open = squad.capacity === null;
  const slots = open
    ? ids.map((id, i) => `${i + 1}. <@${id}>`)
    : Array.from({ length: squad.capacity }, (_, i) => `${i + 1}. ${ids[i] ? `<@${ids[i]}>` : '*libre*'}`);
  const missing = open ? 'Sin límite' : String(Math.max(0, squad.capacity - squad.members.size));
  const minHint = !open && squad.minPlayers != null ? ` · se juega desde ${squad.minPlayers}` : '';
  const slotsTitle = open ? `Jugadores (${ids.length})` : `Cupos (${ids.length}/${squad.capacity})${minHint}`;

  const embed = new EmbedBuilder()
    .setColor(view.color)
    .setTitle(`Squad de ${squad.game}`)
    .addFields(
      { name: 'Creada por', value: `<@${squad.creatorId}>`, inline: true },
      { name: 'Estado', value: view.label, inline: true },
      { name: 'Faltan', value: missing, inline: true },
      { name: slotsTitle, value: slots.join('\n') },
    )
    .setTimestamp(squad.createdAt);

  if (squad.voiceChannelId) {
    const hint = squad.status === SquadStatus.OPEN ? ' (quien entre queda anotado)' : '';
    embed.addFields({ name: 'Canal de voz', value: `<#${squad.voiceChannelId}>${hint}` });
  }
  return embed;
}

export function buildSquadButtons(squad) {
  const disabled = squad.status !== SquadStatus.OPEN;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(buttonId(ButtonAction.JOIN, squad.id)).setLabel('Me sumo').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(buttonId(ButtonAction.LEAVE, squad.id)).setLabel('Me bajo').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(buttonId(ButtonAction.NOTIFY, squad.id)).setLabel('Avisar por WhatsApp').setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(buttonId(ButtonAction.CANCEL, squad.id)).setLabel('Cancelar').setStyle(ButtonStyle.Danger).setDisabled(disabled),
  );
}

export function squadMessagePayload(squad) {
  return { embeds: [buildSquadEmbed(squad)], components: [buildSquadButtons(squad)] };
}
