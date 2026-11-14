import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { SQUAD_DEFAULTS } from '../config.js';

export const squadCommand = new SlashCommandBuilder()
  .setName('squad')
  .setDescription('Arma una squad para jugar')
  .setContexts(InteractionContextType.Guild)
  .addStringOption((o) => o.setName('juego').setDescription('¿A qué juegan?').setRequired(true).setMaxLength(100))
  .addIntegerOption((o) =>
    o
      .setName('cupo')
      .setDescription(`Cantidad de jugadores (por defecto ${SQUAD_DEFAULTS.capacity})`)
      .setMinValue(SQUAD_DEFAULTS.minCapacity)
      .setMaxValue(SQUAD_DEFAULTS.maxCapacity),
  );

export const waGroupsCommand = new SlashCommandBuilder()
  .setName('wa-grupos')
  .setDescription('Lista los grupos de WhatsApp del bot (requiere Gestionar servidor)')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const commands = [squadCommand, waGroupsCommand];
