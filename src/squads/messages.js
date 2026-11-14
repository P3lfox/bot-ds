export function memberNames(squad) {
  return [...squad.members.values()].join(', ');
}

export function buildMissingText(squad) {
  const missing = Math.max(0, squad.capacity - squad.members.size);
  return `Faltan ${missing} para la squad de ${squad.game}. Están: ${memberNames(squad)}. Sumate en Discord: ${squad.messageUrl ?? ''}`.trim();
}

export function buildCompletedText(squad) {
  return `¡La squad de ${squad.game} está completa! Juegan: ${memberNames(squad)}.`;
}

export function formatDuration(ms) {
  const totalSeconds = Math.max(1, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds} s`;
  return seconds === 0 ? `${minutes} min` : `${minutes} min ${seconds} s`;
}
