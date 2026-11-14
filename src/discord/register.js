import { REST, Routes } from 'discord.js';
import { loadConfig } from '../config.js';
import { commands } from './commands.js';

try {
  const config = loadConfig({ scope: 'register' });
  const rest = new REST().setToken(config.discordToken);
  const body = commands.map((c) => c.toJSON());
  const data = await rest.put(Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId), { body });
  console.log(`Se registraron ${data.length} comandos en el servidor ${config.discordGuildId}: ${data.map((c) => '/' + c.name).join(', ')}`);
} catch (err) {
  console.error('No se pudieron registrar los comandos:', err.message ?? err);
  process.exitCode = 1;
}
