import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import { SquadStatus } from '../squads/squadManager.js';
import { fill, T } from '../texts.js';

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
  [SquadStatus.OPEN]: { color: 0x5865f2, label: T.embed.open },
  [SquadStatus.FULL]: { color: 0x57f287, label: T.embed.full },
  [SquadStatus.EXPIRED]: { color: 0x99aab5, label: T.embed.expired },
  [SquadStatus.CANCELLED]: { color: 0xed4245, label: T.embed.cancelled },
};

const READY_VIEW = { color: 0xfee75c, label: T.embed.ready };

export function buildSquadEmbed(squad) {
  const ready = squad.status === SquadStatus.OPEN && squad.minPlayers != null && squad.members.size >= squad.minPlayers;
  const view = ready ? READY_VIEW : STATUS_VIEW[squad.status];
  const ids = [...squad.members.keys()];
  const open = squad.capacity === null;
  const slots = open
    ? ids.map((id, i) => `${i + 1}. <@${id}>`)
    : Array.from({ length: squad.capacity }, (_, i) => `${i + 1}. ${ids[i] ? `<@${ids[i]}>` : T.embed.free}`);
  const missing = open ? T.embed.noLimit : String(Math.max(0, squad.capacity - squad.members.size));
  const minHint = !open && squad.minPlayers != null ? fill(T.embed.slotsMin, { min: squad.minPlayers }) : '';
  const slotsTitle = open
    ? fill(T.embed.players, { count: ids.length })
    : fill(T.embed.slots, { count: ids.length, capacity: squad.capacity }) + minHint;

  const embed = new EmbedBuilder()
    .setColor(view.color)
    .setTitle(fill(T.embed.title, { game: squad.game.toLowerCase() }))
    .addFields(
      { name: T.embed.createdBy, value: `<@${squad.creatorId}>`, inline: true },
      { name: T.embed.status, value: view.label, inline: true },
      { name: T.embed.missing, value: missing, inline: true },
      { name: slotsTitle, value: slots.join('\n') },
    )
    .setTimestamp(squad.createdAt);

  if (squad.voiceChannelId) {
    const hint = squad.status === SquadStatus.OPEN ? T.embed.voiceHint : '';
    embed.addFields({ name: T.embed.voice, value: `<#${squad.voiceChannelId}>${hint}` });
  }
  return embed;
}

export function buildSquadButtons(squad) {
  const disabled = squad.status !== SquadStatus.OPEN;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(buttonId(ButtonAction.JOIN, squad.id)).setLabel(T.buttons.join).setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId(buttonId(ButtonAction.LEAVE, squad.id)).setLabel(T.buttons.leave).setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(buttonId(ButtonAction.NOTIFY, squad.id)).setLabel(T.buttons.notify).setStyle(ButtonStyle.Primary).setDisabled(disabled),
    new ButtonBuilder().setCustomId(buttonId(ButtonAction.CANCEL, squad.id)).setLabel(T.buttons.cancel).setStyle(ButtonStyle.Danger).setDisabled(disabled),
  );
}

export function squadMessagePayload(squad) {
  return { embeds: [buildSquadEmbed(squad)], components: [buildSquadButtons(squad)] };
}
