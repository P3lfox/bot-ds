import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SquadManager } from '../src/squads/squadManager.js';
import { createSquadNotifier } from '../src/squads/notifier.js';
import { buildMissingText, buildCompletedText, formatDuration } from '../src/squads/messages.js';
import { WhatsAppUnavailableError } from '../src/whatsapp/errors.js';

function makeManager() {
  return new SquadManager({
    expireMs: 1e9, autoNotifyMs: 1e9, cooldownMs: 10 * 60_000,
    setTimer: () => 0, clearTimer: () => {},
  });
}

function makeSquad(manager) {
  const squad = manager.create({ game: 'CS2', capacity: 5, creatorId: 'u1', creatorName: 'Ana' });
  manager.join(squad.id, 'u2', 'Beto');
  manager.attachMessage(squad.id, { channelId: 'c', messageId: 'm', url: 'https://discord.com/channels/g/c/m' });
  return squad;
}

test('missing text follows the requested format', () => {
  const manager = makeManager();
  const squad = makeSquad(manager);
  assert.equal(
    buildMissingText(squad),
    'Faltan 3 para la squad de CS2. Están: Ana, Beto. Sumate en Discord: https://discord.com/channels/g/c/m',
  );
  assert.match(buildCompletedText(squad), /CS2/);
});

test('formatDuration renders minutes and seconds', () => {
  assert.equal(formatDuration(7 * 60_000 + 12_000), '7 min 12 s');
  assert.equal(formatDuration(45_000), '45 s');
  assert.equal(formatDuration(1), '1 s');
});

test('notifyMissing sends, then sets cooldown', async () => {
  const sent = [];
  const manager = makeManager();
  const squad = makeSquad(manager);
  const notifier = createSquadNotifier({ manager, whatsapp: { avisarGrupo: async (t) => sent.push(t) } });
  assert.deepEqual(await notifier.notifyMissing(squad), { ok: true });
  assert.equal(sent.length, 1);
  assert.ok(manager.cooldownRemaining(squad) > 0);
  const second = await notifier.notifyMissing(squad);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'cooldown');
  assert.equal(sent.length, 1);
});

test('notifyMissing reports unavailable WhatsApp without cooldown', async () => {
  const manager = makeManager();
  const squad = makeSquad(manager);
  const notifier = createSquadNotifier({
    manager,
    whatsapp: { avisarGrupo: async () => { throw new WhatsAppUnavailableError('WhatsApp no está conectado.'); } },
    logger: { error() {}, warn() {} },
  });
  const result = await notifier.notifyMissing(squad);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'unavailable');
  assert.equal(manager.cooldownRemaining(squad), 0);
});

test('concurrent notifyMissing calls send only once', async () => {
  const sent = [];
  const manager = makeManager();
  const squad = makeSquad(manager);
  const notifier = createSquadNotifier({
    manager,
    whatsapp: { avisarGrupo: (t) => new Promise((r) => setTimeout(() => r(sent.push(t)), 10)) },
  });
  const [a, b] = await Promise.all([notifier.notifyMissing(squad), notifier.notifyMissing(squad)]);
  assert.equal(sent.length, 1);
  assert.deepEqual([a.ok, b.ok].sort(), [false, true]);
});

test('notifyCompleted sends a single message per squad', async () => {
  const sent = [];
  const manager = makeManager();
  const squad = makeSquad(manager);
  const notifier = createSquadNotifier({ manager, whatsapp: { avisarGrupo: async (t) => sent.push(t) } });
  await notifier.notifyCompleted(squad);
  await notifier.notifyCompleted(squad);
  assert.equal(sent.length, 1);
});

test('open squad notice lists who is playing without a missing count', () => {
  const manager = makeManager();
  const squad = manager.create({ game: 'Minecraft', capacity: null, creatorId: 'u1', creatorName: 'Ana' });
  manager.attachMessage(squad.id, { channelId: 'c', messageId: 'm', url: 'https://discord.com/channels/g/c/m' });
  assert.equal(buildMissingText(squad), 'Están jugando Minecraft: Ana. Sumate en Discord: https://discord.com/channels/g/c/m');
});

test('sent notices are remembered so WhatsApp replies can be routed to the squad', async () => {
  let n = 0;
  const manager = makeManager();
  const squad = makeSquad(manager);
  const notifier = createSquadNotifier({ manager, whatsapp: { avisarGrupo: async () => ({ id: `WA${++n}` }) } });
  await notifier.notifyMissing(squad);
  await notifier.notifyCompleted(squad);
  const target = { squadId: squad.id, game: 'CS2', channelId: 'c', messageId: 'm' };
  assert.deepEqual(notifier.findNotice('WA1'), target);
  assert.deepEqual(notifier.findNotice('WA2'), target);
  assert.equal(notifier.findNotice('nope'), undefined);
});

test('remembered notices expire after the retention window', async () => {
  let now = 0;
  const manager = makeManager();
  const squad = makeSquad(manager);
  const notifier = createSquadNotifier({
    manager,
    whatsapp: { avisarGrupo: async () => ({ id: 'WA1' }) },
    now: () => now,
    noticeTtlMs: 1000,
  });
  await notifier.notifyMissing(squad);
  now = 999;
  assert.ok(notifier.findNotice('WA1'));
  now = 1001;
  assert.equal(notifier.findNotice('WA1'), undefined);
});
