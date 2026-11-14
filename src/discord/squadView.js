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

export function buildSquadEmbed(squad) {
  const view = STATUS_VIEW[squad.status];
  const missing = Math.max(0, squad.capacity - squad.members.size);
  const list = [...squad.members.keys()].map((id, i) => `${i + 1}. <@${id}>`).join('\n') || '—';

  return new EmbedBuilder()
    .setColor(view.color)
    .setTitle(`Squad de ${squad.game}`)
    .addFields(
      { name: 'Creada por', value: `<@${squad.creatorId}>`, inline: true },
      { name: 'Estado', value: view.label, inline: true },
      { name: 'Faltan', value: String(missing), inline: true },
      { name: `Anotados (${squad.members.size}/${squad.capacity})`, value: list },
    )
    .setTimestamp(squad.createdAt);
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
