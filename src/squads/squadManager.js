import { randomUUID } from 'node:crypto';

export const SquadStatus = Object.freeze({
  OPEN: 'open',
  FULL: 'full',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
});

export class SquadError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'SquadError';
    this.code = code;
  }
}

/**
 * In-memory store of active squads. Finished squads (full, expired, cancelled)
 * are removed from the store and their timers cleared.
 */
export class SquadManager {
  #squads = new Map();

  constructor({
    expireMs,
    autoNotifyMs,
    cooldownMs,
    onExpire = async () => {},
    onAutoNotify = async () => {},
    now = Date.now,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
    logger = console,
  }) {
    Object.assign(this, { expireMs, autoNotifyMs, cooldownMs, onExpire, onAutoNotify });
    this.now = now;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.logger = logger;
  }

  create({ game, capacity, creatorId, creatorName, voiceChannelId = null }) {
    if (!Number.isInteger(capacity) || capacity < 2) {
      throw new SquadError('INVALID_CAPACITY', 'El cupo tiene que ser un número entero mayor o igual a 2.');
    }
    const squad = {
      id: randomUUID(),
      game,
      capacity,
      creatorId,
      members: new Map([[creatorId, creatorName]]),
      status: SquadStatus.OPEN,
      createdAt: this.now(),
      lastNotifiedAt: null,
      notifying: false,
      completionNotified: false,
      voiceChannelId,
      channelId: null,
      messageId: null,
      messageUrl: null,
      timers: [],
    };
    squad.timers.push(
      this.setTimer(() => this.#autoNotify(squad), this.autoNotifyMs),
      this.setTimer(() => this.#expire(squad), this.expireMs),
    );
    this.#squads.set(squad.id, squad);
    return squad;
  }

  get(id) {
    return this.#squads.get(id);
  }

  /** Oldest open squad linked to a voice channel (Map keeps insertion order). */
  findOpenByVoiceChannel(voiceChannelId) {
    for (const squad of this.#squads.values()) {
      if (squad.voiceChannelId === voiceChannelId && squad.status === SquadStatus.OPEN) return squad;
    }
    return undefined;
  }

  attachMessage(id, { channelId, messageId, url }) {
    const squad = this.#require(id);
    Object.assign(squad, { channelId, messageId, messageUrl: url });
    return squad;
  }

  /** Removes a squad without callbacks (e.g. the Discord message could not be posted). */
  discard(id) {
    const squad = this.#squads.get(id);
    if (squad) this.#finish(squad, SquadStatus.CANCELLED);
  }

  join(id, userId, name) {
    const squad = this.#require(id);
    if (squad.members.has(userId)) {
      throw new SquadError('ALREADY_JOINED', 'Ya estás anotado en esta squad.');
    }
    squad.members.set(userId, name);
    const completed = squad.members.size >= squad.capacity;
    if (completed) this.#finish(squad, SquadStatus.FULL);
    return { squad, completed };
  }

  leave(id, userId) {
    const squad = this.#require(id);
    if (userId === squad.creatorId) {
      throw new SquadError('CREATOR_CANNOT_LEAVE', 'Sos el creador: si no vas a jugar, usá "Cancelar".');
    }
    if (!squad.members.has(userId)) {
      throw new SquadError('NOT_JOINED', 'No estás anotado en esta squad.');
    }
    squad.members.delete(userId);
    return squad;
  }

  cancel(id, userId) {
    const squad = this.#require(id);
    if (userId !== squad.creatorId) {
      throw new SquadError('NOT_CREATOR', 'Solo quien creó la squad puede cancelarla.');
    }
    this.#finish(squad, SquadStatus.CANCELLED);
    return squad;
  }

  missing(squad) {
    return Math.max(0, squad.capacity - squad.members.size);
  }

  cooldownRemaining(squad) {
    if (squad.lastNotifiedAt === null) return 0;
    return Math.max(0, squad.lastNotifiedAt + this.cooldownMs - this.now());
  }

  markNotified(id) {
    const squad = this.#squads.get(id);
    if (squad) squad.lastNotifiedAt = this.now();
  }

  #require(id) {
    const squad = this.#squads.get(id);
    if (!squad || squad.status !== SquadStatus.OPEN) {
      throw new SquadError('NOT_FOUND', 'Esta squad ya no está activa.');
    }
    return squad;
  }

  #finish(squad, status) {
    squad.status = status;
    for (const timer of squad.timers) this.clearTimer(timer);
    squad.timers = [];
    this.#squads.delete(squad.id);
  }

  #autoNotify(squad) {
    if (squad.status !== SquadStatus.OPEN || this.missing(squad) === 0) return;
    if (this.cooldownRemaining(squad) > 0) return;
    this.#runSafely('auto-notify', () => this.onAutoNotify(squad));
  }

  #expire(squad) {
    if (squad.status !== SquadStatus.OPEN) return;
    this.#finish(squad, SquadStatus.EXPIRED);
    this.#runSafely('expire', () => this.onExpire(squad));
  }

  #runSafely(label, fn) {
    Promise.resolve()
      .then(fn)
      .catch((err) => this.logger.error(`[squads] Error en ${label}:`, err));
  }
}
