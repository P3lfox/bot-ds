import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const squadCommand = new SlashCommandBuilder()
  .setName('squad')
  .setDescription('Arma una squad para jugar (el cupo depende del juego)')
  .setContexts(InteractionContextType.Guild)
  .addStringOption((o) =>
    o.setName('juego').setDescription('¿A qué juegan? Ej: valo, lol, fortnite').setRequired(true).setMaxLength(100),
  );

export const waGroupsCommand = new SlashCommandBuilder()
  .setName('wa-grupos')
  .setDescription('Lista los grupos de WhatsApp del bot (requiere Gestionar servidor)')
  .setContexts(InteractionContextType.Guild)
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export const commands = [squadCommand, waGroupsCommand];
