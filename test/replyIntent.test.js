import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyReply, ReplyIntent } from '../src/squads/replyIntent.js';

const intentOf = (text) => classifyReply(text).intent;

function expectAll(intent, phrases) {
  for (const phrase of phrases) assert.equal(intentOf(phrase), intent, `"${phrase}" should be ${intent}`);
}

test('coming: plain yes-style answers', () => {
  expectAll(ReplyIntent.COMING, ['voy', 'dale', 'dale voy', 'me sumo', 'vamos', 'vamo', 'de una', 'ahí voy', 'ya entro', 'sii', 'obvio', 'listo', 'boy', 'voooy', 'Me prendo', 'cuenten conmigo', 'estoy']);
});

test('late: eating, cooking, finishing something first', () => {
  expectAll(ReplyIntent.LATE, [
    'como y voy', 'cocino y voy', 'ceno y voy', 'estoy comiendo', 'toy comiendo', 'estoy cenando',
    'estoy cocinando', 'comiendo', 'me baño y voy', 'me ducho y entro', 'termino y entro', 'termino esta y voy',
    'dame un rato', 'en un toque', 'bancame', 'esperenme', 'ya casi', 'mas tarde', 'después entro',
    'salgo del laburo y voy', 'estoy volviendo', 'llego tarde', 'todavía no termino',
  ]);
});

test('late: typos still match', () => {
  expectAll(ReplyIntent.LATE, ['cosino y voy', 'estoy comniendo', 'toy sennando', 'estoi comiendo', 'cocinadno']);
});

test('late: time expressions are extracted', () => {
  assert.deepEqual(classifyReply('en 20'), { intent: ReplyIntent.LATE, minutes: 20 });
  assert.deepEqual(classifyReply('en 20 llego'), { intent: ReplyIntent.LATE, minutes: 20 });
  assert.deepEqual(classifyReply('10 min'), { intent: ReplyIntent.LATE, minutes: 10 });
  assert.deepEqual(classifyReply('dame 5'), { intent: ReplyIntent.LATE, minutes: 5 });
  assert.deepEqual(classifyReply('como y voy, 15 minutos'), { intent: ReplyIntent.LATE, minutes: 15 });
  assert.deepEqual(classifyReply('en media hora'), { intent: ReplyIntent.LATE, minutes: 30 });
  assert.deepEqual(classifyReply('en una hora'), { intent: ReplyIntent.LATE, minutes: 60 });
  assert.deepEqual(classifyReply('en 1h'), { intent: ReplyIntent.LATE, minutes: 60 });
  assert.equal(classifyReply('estoy comiendo').minutes, null);
});

test('not coming: refusals, busy, annoyed', () => {
  expectAll(ReplyIntent.NOT_COMING, [
    'no estoy', 'no puedo', 'no voy', 'hoy no', 'paso', 'nop', 'no', 'nah', 'ni ahí', 'ni en pedo', 'ni a palos',
    'deja de joder', 'dejá de joder', 'deja de romper', 'no jodas', 'estoy ocupado', 'estoy laburando',
    'estoy estudiando', 'me voy a dormir', 'estoy durmiendo', 'no tengo ganas', 'otro día', 'mañana',
    'no estoy en casa', 'estoy de viaje', 'no llego', 'olvidate', 'ni loco', 'no gracias', 'no me da',
    'estoy re cansado', 'no tengo la pc',
  ]);
});

test('not coming wins over coming and late words in the same message', () => {
  expectAll(ReplyIntent.NOT_COMING, ['no voy, estoy comiendo', 'ahora no, dale mañana', 'no puedo, en 20 me voy a dormir']);
});

test('not coming: typos still match', () => {
  expectAll(ReplyIntent.NOT_COMING, ['deja de jodr', 'estoy ocupadoo', 'no tengo gnas', 'durmindo']);
});

test('unknown: anything else', () => {
  expectAll(ReplyIntent.UNKNOWN, ['jaja', 'quién juega?', 'qué juego es?', '', '   ']);
});

test('regular chat messages are not misread as answers', () => {
  expectAll(ReplyIntent.UNKNOWN, ['quien armo esto', 'paso el link', 'no se', 'ni idea', 'basta de spam de memes en el grupo', 'a que hora?', 'juega alguno?']);
});

test('after "pero", the last clause decides', () => {
  assert.deepEqual(classifyReply('ahora no puedo pero en 30 si'), { intent: ReplyIntent.LATE, minutes: 30 });
  assert.equal(intentOf('dale pero no puedo'), ReplyIntent.NOT_COMING);
  assert.equal(intentOf('no hay drama, voy'), ReplyIntent.COMING);
});
