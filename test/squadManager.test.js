import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SquadManager, SquadStatus, SquadError } from '../src/squads/squadManager.js';

function fakeClock() {
  let now = 0;
  let nextId = 1;
  const timers = new Map();
  return {
    now: () => now,
    setTimer: (fn, ms) => {
      const id = nextId++;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimer: (id) => timers.delete(id),
    async advance(ms) {
      now += ms;
      for (const [id, t] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (t.at <= now && timers.has(id)) {
          timers.delete(id);
          t.fn();
        }
      }
      await new Promise((r) => setImmediate(r));
    },
    pending: () => timers.size,
  };
}

const MIN = 60_000;

function setup(overrides = {}) {
  const clock = fakeClock();
  const calls = { expired: [], autoNotify: [] };
  const manager = new SquadManager({
    expireMs: 30 * MIN,
    autoNotifyMs: 5 * MIN,
    cooldownMs: 10 * MIN,
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer,
    onExpire: async (s) => calls.expired.push(s),
    onAutoNotify: async (s) => calls.autoNotify.push(s),
    logger: { error() {} },
    ...overrides,
  });
  return { clock, calls, manager };
}

const base = { game: 'Valorant', capacity: 3, creatorId: 'u1', creatorName: 'Ana' };

test('create registers the creator as first member with open status', () => {
  const { manager } = setup();
  const squad = manager.create(base);
  assert.equal(squad.status, SquadStatus.OPEN);
  assert.deepEqual([...squad.members.keys()], ['u1']);
  assert.equal(manager.missing(squad), 2);
  assert.equal(manager.get(squad.id), squad);
});

test('join adds a member and reports completion when capacity is reached', () => {
  const { manager, clock } = setup();
  const squad = manager.create(base);
  assert.equal(manager.join(squad.id, 'u2', 'Beto').completed, false);
  const result = manager.join(squad.id, 'u3', 'Caro');
  assert.equal(result.completed, true);
  assert.equal(squad.status, SquadStatus.FULL);
  assert.equal(manager.get(squad.id), undefined);
  assert.equal(clock.pending(), 0);
});

test('join rejects duplicates and closed squads', () => {
  const { manager } = setup();
  const squad = manager.create(base);
  assert.throws(() => manager.join(squad.id, 'u1', 'Ana'), (e) => e instanceof SquadError && e.code === 'ALREADY_JOINED');
  manager.cancel(squad.id, 'u1');
  assert.throws(() => manager.join(squad.id, 'u2', 'Beto'), (e) => e.code === 'NOT_FOUND');
});

test('leave removes a member; creator and non-members cannot leave', () => {
  const { manager } = setup();
  const squad = manager.create(base);
  manager.join(squad.id, 'u2', 'Beto');
  manager.leave(squad.id, 'u2');
  assert.equal(squad.members.has('u2'), false);
  assert.throws(() => manager.leave(squad.id, 'u2'), (e) => e.code === 'NOT_JOINED');
  assert.throws(() => manager.leave(squad.id, 'u1'), (e) => e.code === 'CREATOR_CANNOT_LEAVE');
});

test('only the creator can cancel', () => {
  const { manager, clock } = setup();
  const squad = manager.create(base);
  assert.throws(() => manager.cancel(squad.id, 'u2'), (e) => e.code === 'NOT_CREATOR');
  manager.cancel(squad.id, 'u1');
  assert.equal(squad.status, SquadStatus.CANCELLED);
  assert.equal(clock.pending(), 0);
});

test('auto notify fires at 5 minutes only while people are missing and not in cooldown', async () => {
  const { manager, clock, calls } = setup();
  const a = manager.create(base);
  const b = manager.create({ ...base, creatorId: 'x1' });
  await clock.advance(2 * MIN);
  manager.markNotified(b.id);
  await clock.advance(3 * MIN);
  assert.deepEqual(calls.autoNotify.map((s) => s.id), [a.id]);
});

test('squad expires after 30 minutes if not complete', async () => {
  const { manager, clock, calls } = setup();
  const squad = manager.create(base);
  await clock.advance(30 * MIN);
  assert.equal(squad.status, SquadStatus.EXPIRED);
  assert.deepEqual(calls.expired, [squad]);
  assert.equal(manager.get(squad.id), undefined);
});

test('completed squad does not expire nor auto notify', async () => {
  const { manager, clock, calls } = setup();
  const squad = manager.create({ ...base, capacity: 2 });
  manager.join(squad.id, 'u2', 'Beto');
  await clock.advance(31 * MIN);
  assert.equal(calls.expired.length, 0);
  assert.equal(calls.autoNotify.length, 0);
});

test('cooldown remaining counts down from the last notification', async () => {
  const { manager, clock } = setup();
  const squad = manager.create(base);
  assert.equal(manager.cooldownRemaining(squad), 0);
  manager.markNotified(squad.id);
  await clock.advance(4 * MIN);
  assert.equal(manager.cooldownRemaining(squad), 6 * MIN);
  await clock.advance(6 * MIN);
  assert.equal(manager.cooldownRemaining(squad), 0);
});

test('findOpenByVoiceChannel returns the oldest open squad linked to that channel', () => {
  const { manager } = setup();
  const first = manager.create({ ...base, voiceChannelId: 'v1' });
  manager.create({ ...base, creatorId: 'u9', voiceChannelId: 'v1' });
  manager.create({ ...base, creatorId: 'u8' });
  assert.equal(manager.findOpenByVoiceChannel('v1'), first);
  assert.equal(manager.findOpenByVoiceChannel('v2'), undefined);
  manager.cancel(first.id, 'u1');
  assert.notEqual(manager.findOpenByVoiceChannel('v1'), first);
});

test('a failing callback does not throw out of the timer', async () => {
  const errors = [];
  const { manager, clock } = setup({
    onExpire: async () => { throw new Error('boom'); },
    logger: { error: (...args) => errors.push(args) },
  });
  manager.create(base);
  await clock.advance(30 * MIN);
  assert.equal(errors.length, 1);
});

test('open squads (no capacity) never complete and keep auto notify', async () => {
  const { manager, clock, calls } = setup();
  const squad = manager.create({ ...base, game: 'Minecraft', capacity: null });
  for (let i = 2; i <= 30; i++) assert.equal(manager.join(squad.id, `u${i}`, `P${i}`).completed, false);
  assert.equal(manager.missing(squad), null);
  await clock.advance(5 * 60_000);
  assert.deepEqual(calls.autoNotify, [squad]);
});

test('squad with minPlayers reports ready once when reaching the minimum, then completes at capacity', () => {
  const { manager } = setup();
  const squad = manager.create({ ...base, game: 'Rocket League', capacity: 3, minPlayers: 2 });
  assert.deepEqual(manager.join(squad.id, 'u2', 'Beto'), { squad, completed: false, ready: true });
  assert.equal(manager.isReady(squad), true);
  manager.leave(squad.id, 'u2');
  assert.equal(manager.isReady(squad), false);
  assert.equal(manager.join(squad.id, 'u2', 'Beto').ready, true);
  assert.deepEqual(manager.join(squad.id, 'u3', 'Caro'), { squad, completed: true, ready: false });
});

test('squads without minPlayers never report ready', () => {
  const { manager } = setup();
  const squad = manager.create(base);
  assert.equal(manager.join(squad.id, 'u2', 'Beto').ready, false);
  assert.equal(manager.isReady(squad), false);
});
