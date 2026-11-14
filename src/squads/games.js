import { SQUAD_DEFAULTS } from '../config.js';

/** Known games with their usual squad size. Aliases are matched after normalize(). */
const GAMES = [
  { name: 'Valorant', capacity: 5, aliases: ['valorant', 'valo', 'val'] },
  { name: 'League of Legends', capacity: 5, aliases: ['leagueoflegends', 'lol', 'league'] },
  { name: 'Fortnite', capacity: 4, aliases: ['fortnite', 'fn', 'fort'] },
  { name: 'Counter-Strike 2', capacity: 5, aliases: ['counterstrike2', 'counterstrike', 'cs2', 'cs', 'csgo', 'counter'] },
  { name: 'Dota 2', capacity: 5, aliases: ['dota2', 'dota'] },
  { name: 'Overwatch 2', capacity: 5, aliases: ['overwatch2', 'overwatch', 'ow', 'ow2'] },
  { name: 'Rainbow Six Siege', capacity: 5, aliases: ['rainbowsixsiege', 'rainbowsix', 'r6', 'r6s', 'siege'] },
  { name: 'Apex Legends', capacity: 3, aliases: ['apexlegends', 'apex'] },
  { name: 'Rocket League', capacity: 3, aliases: ['rocketleague', 'rocket', 'rl'] },
  { name: 'Call of Duty: Warzone', capacity: 4, aliases: ['callofdutywarzone', 'warzone', 'wz'] },
  { name: 'PUBG', capacity: 4, aliases: ['pubg', 'battlegrounds'] },
  { name: 'Marvel Rivals', capacity: 6, aliases: ['marvelrivals', 'rivals'] },
];

export function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const BY_ALIAS = new Map(GAMES.flatMap((game) => game.aliases.map((alias) => [alias, game])));

/** Returns { name, capacity, known } for the text the user typed. */
export function resolveGame(input) {
  const typed = input.trim();
  const game = BY_ALIAS.get(normalize(typed));
  if (game) return { name: game.name, capacity: game.capacity, known: true };
  return { name: typed, capacity: SQUAD_DEFAULTS.capacity, known: false };
}
