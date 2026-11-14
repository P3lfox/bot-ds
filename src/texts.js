/**
 * Every text the bot says to players, in one place.
 *
 * Tone: Argentine with a Tucumán touch, written like a person types in a chat:
 * all lowercase, no opening ¿ ¡ (only the closing ones), and commas/periods that
 * show up only now and then (see casual()). Names of people are kept as they are.
 * Admin/technical messages are not here and stay neutral.
 */

/** Probability that a given comma or period is "remembered". */
const KEEP_PUNCTUATION = 0.3;

/**
 * Randomly drops the template's own commas and periods (never the ones inside
 * {placeholders} values, never ? ! or :) and always drops the final period.
 */
export function casual(template, rng = Math.random) {
  return template
    .replace(/\.$/, '')
    .replace(/[.,](?=\s)/g, (mark) => (rng() < KEEP_PUNCTUATION ? mark : ''));
}

/** Replaces {key} with values[key]. */
export function fill(template, values = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

/** casual() on the template, then fill() with the values. */
export function say(template, values = {}, rng = Math.random) {
  return fill(casual(template, rng), values);
}

export const T = {
  // WhatsApp group
  waMissing: 'y diái? faltan {missing} pa la squad de {game}. ya están: {names}. sumate en discord: {url}',
  waOpen: 'están jugando {game}: {names}. caete, sumate en discord: {url}',
  waCompleted: 'meta, ya está la squad de {game}! juegan: {names}',

  // Discord channel
  completed: 'meta changos! ya está la squad de **{game}**: {mentions} a darle!',
  ready: 'ya son {count} pa **{game}**! {mentions} ya pueden arrancar. {left} por si cae alguien más',
  readyLeftOne: 'queda 1 lugar',
  readyLeftMany: 'quedan {left} lugares',

  // Discord ephemeral replies
  noGame: 'decime a qué juegan, chango',
  cooldown: 'pará chango, recién se avisó. esperá un cachito: {time} más',
  notifyOk: 'meta, ya avisé al grupo de wsp',
  notifyFail: 'no pude mandar el aviso por wsp: {reason}',
  completedNotifyFail: 'no pude avisar por wsp que se completó la squad: {reason}',
  unexpected: 'uh, algo se rompió. probá de nuevo en un cachito',

  // Squad rules (SquadError messages)
  errors: {
    invalidCapacity: 'el cupo tiene que ser de 2 pa arriba',
    invalidMinPlayers: 'el mínimo tiene que ser de 2 pa arriba y menos que el cupo',
    alreadyJoined: 'ya estás anotado, chango',
    creatorCannotLeave: 'vos armaste la squad, no te podés hacer atrá. si no vas tocá cancelar',
    notJoined: 'no estás anotado en esta squad',
    notCreator: 'solo el que armó la squad la puede cancelar',
    notFound: 'esta squad ya fue',
    inProgress: 'ya estoy mandando un aviso pa esta squad, aguantá',
  },

  // WhatsApp delivery problems (shown after "no pude mandar el aviso por wsp: ...")
  wa: {
    notConnected: 'el wsp no está conectado',
    noGroup: 'falta configurar WA_GROUP_ID',
    sendError: 'se trabó el envío',
  },

  // Embed and buttons
  embed: {
    title: 'squad de {game}',
    createdBy: 'la armó',
    status: 'estado',
    missing: 'faltan',
    noLimit: 'sin límite',
    slots: 'cupos ({count}/{capacity})',
    slotsMin: ' · se juega desde {min}',
    players: 'jugadores ({count})',
    free: '*libre*',
    voice: 'canal de voz',
    voiceHint: ' (el que entra queda anotado)',
    open: 'abierta',
    ready: 'lista pa jugar',
    full: 'completa',
    expired: 'se venció',
    cancelled: 'cancelada',
  },
  buttons: {
    join: 'me sumo',
    leave: 'me bajo',
    notify: 'avisar por wsp',
    cancel: 'cancelar',
  },

  // Relayed WhatsApp replies
  relay: {
    source: '(wsp)',
    coming: ' viene',
    late: ' viene más tarde',
    lateMinutes: ' viene más tarde, en ~{minutes} min',
    notComing: ' no viene',
  },
};
