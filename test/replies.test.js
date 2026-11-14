import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractGroupReply } from '../src/whatsapp/replies.js';

const GROUP = '123@g.us';

function msg({ remoteJid = GROUP, fromMe = false, pushName = 'Juan', message }) {
  return { key: { remoteJid, fromMe, id: 'X1', participant: '999@lid' }, pushName, message };
}

const quoted = (text, stanzaId = 'BOT1') => ({ extendedTextMessage: { text, contextInfo: { stanzaId } } });

test('extracts text, sender and quoted id from a reply in the group', () => {
  assert.deepEqual(extractGroupReply(msg({ message: quoted('en 20 llego') }), GROUP), {
    quotedId: 'BOT1',
    text: 'en 20 llego',
    senderName: 'Juan',
  });
});

test('unwraps disappearing-message wrappers and reads image captions', () => {
  const wrapped = { ephemeralMessage: { message: quoted('como y voy') } };
  assert.equal(extractGroupReply(msg({ message: wrapped }), GROUP).text, 'como y voy');
  const image = { imageMessage: { caption: 'miren', contextInfo: { stanzaId: 'BOT2' } } };
  assert.deepEqual(extractGroupReply(msg({ message: image }), GROUP), { quotedId: 'BOT2', text: 'miren', senderName: 'Juan' });
});

test('ignores messages that are not replies, are from the bot or from other chats', () => {
  assert.equal(extractGroupReply(msg({ message: { conversation: 'hola' } }), GROUP), null);
  assert.equal(extractGroupReply(msg({ fromMe: true, message: quoted('yo') }), GROUP), null);
  assert.equal(extractGroupReply(msg({ remoteJid: 'otro@g.us', message: quoted('x') }), GROUP), null);
  assert.equal(extractGroupReply(msg({ message: { extendedTextMessage: { text: '  ', contextInfo: { stanzaId: 'BOT1' } } } }), GROUP), null);
  assert.equal(extractGroupReply(msg({ message: undefined }), GROUP), null);
});

test('falls back to a generic name when pushName is missing', () => {
  assert.equal(extractGroupReply(msg({ pushName: '', message: quoted('voy') }), GROUP).senderName, 'Alguien');
});
