import { say, T } from '../texts.js';

export function memberNames(squad) {
  return [...squad.members.values()].join(', ');
}

function values(squad) {
  return {
    game: squad.game.toLowerCase(),
    names: memberNames(squad),
    url: squad.messageUrl ?? '',
    missing: Math.max(0, (squad.capacity ?? 0) - squad.members.size),
  };
}

/** WhatsApp notice while people are missing (or who is playing, for open squads). */
export function buildMissingText(squad, rng = Math.random) {
  return say(squad.capacity === null ? T.waOpen : T.waMissing, values(squad), rng).trim();
}

/** WhatsApp notice when the squad is complete. */
export function buildCompletedText(squad, rng = Math.random) {
  return say(T.waCompleted, values(squad), rng);
}

export function formatDuration(ms) {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} s`;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}
