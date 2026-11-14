import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRelayPayload, createReplyRelay, DISCORD_MESSAGE_LIMIT } from '../src/discord/relay.js';

test('relay payload has the expected format, replies to the squad message and mentions nobody', () => {
  assert.deepEqual(buildRelayPayload({ senderName: 'Juan', text: 'en 20 llego', messageId: 'm1' }), {
    content: '💬 **Juan** (WhatsApp): en 20 llego',
    reply: { messageReference: 'm1', failIfNotExists: false },
    allowedMentions: { parse: [], repliedUser: false },
  });
});

test('markdown and mentions in the text are escaped', () => {
  const { content } = buildRelayPayload({ senderName: '*Jua_n*', text: '@everyone **ya**', messageId: 'm1' });
  assert.equal(content, '💬 **\\*Jua\\_n\\*** (WhatsApp): @everyone \\*\\*ya\\*\\*');
});

test('long markdown-heavy text stays within the Discord limit after escaping', () => {
  const { content } = buildRelayPayload({ senderName: 'Juan', text: '*_~'.repeat(1000), messageId: 'm1' });
  assert.ok(content.length <= DISCORD_MESSAGE_LIMIT, `length ${content.length}`);
  assert.ok(content.endsWith('…'));
});

test('truncation never splits an emoji', () => {
  const { content } = buildRelayPayload({ senderName: 'Juan', text: '😀'.repeat(3000), messageId: 'm1' });
  assert.ok(content.length <= DISCORD_MESSAGE_LIMIT);
  assert.ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(content), 'no lone high surrogate');
});

test('without a squad message the relay is posted without reply reference', () => {
  assert.equal(buildRelayPayload({ senderName: 'Juan', text: 'hola', messageId: null }).reply, undefined);
});

function fakeChannel() {
  const sent = [];
  return { sent, isSendable: () => true, send: async (p) => sent.push(p) };
}

test('relay routes a reply to the channel of the quoted notice', async () => {
  const channel = fakeChannel();
  const fetched = [];
  const relay = createReplyRelay({
    findNotice: (id) => (id === 'WA1' ? { channelId: 'c1', messageId: 'm1' } : undefined),
    fetchChannel: async (id) => (fetched.push(id), channel),
  });
  await relay({ quotedId: 'WA1', text: 'como y voy', senderName: 'Ana' });
  await relay({ quotedId: 'unknown', text: 'x', senderName: 'Ana' });
  assert.deepEqual(fetched, ['c1']);
  assert.equal(channel.sent.length, 1);
  assert.equal(channel.sent[0].content, '💬 **Ana** (WhatsApp): como y voy');
  assert.equal(channel.sent[0].reply.messageReference, 'm1');
});

test('relay never throws when Discord fails', async () => {
  const errors = [];
  const relay = createReplyRelay({
    findNotice: () => ({ channelId: 'c1', messageId: 'm1' }),
    fetchChannel: async () => ({ isSendable: () => true, send: async () => { throw new Error('boom'); } }),
    logger: { error: (...a) => errors.push(a) },
  });
  await relay({ quotedId: 'WA1', text: 'hola', senderName: 'Ana' });
  assert.equal(errors.length, 1);
});
