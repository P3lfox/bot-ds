import { test } from 'node:test';
import assert from 'node:assert/strict';
import { casual, say, T } from '../src/texts.js';

const always = () => 0; // remembers every comma and period
const never = () => 0.99; // forgets every comma and period

test('casual keeps punctuation when the writer remembers, but never the final period', () => {
  assert.equal(casual('meta, ya avisé. listo.', always), 'meta, ya avisé. listo');
});

test('casual drops commas and periods when the writer forgets', () => {
  assert.equal(casual('meta, ya avisé. listo.', never), 'meta ya avisé listo');
});

test('casual never touches question/exclamation marks, colons or text inside placeholders', () => {
  assert.equal(casual('y diái? faltan {n}. dale!', never), 'y diái? faltan {n} dale!');
  assert.equal(say('ya están: {names}. sumate', { names: 'Ana, Beto' }, never), 'ya están: Ana, Beto sumate');
});

test('casual drops each mark independently', () => {
  const values = [0, 0.99];
  let i = 0;
  assert.equal(casual('a, b, c.', () => values[i++ % 2]), 'a, b c');
});

test('bot texts are lowercase and have no opening ¿ or ¡', () => {
  const templates = Object.values(T).flatMap((v) => (typeof v === 'object' ? Object.values(v) : [v]));
  for (const template of templates) {
    const fixed = template.replace(/\{\w+\}/g, '').replace(/WA_GROUP_ID/g, '');
    assert.equal(fixed, fixed.toLowerCase(), `uppercase in: ${template}`);
    assert.ok(!/[¿¡]/.test(template), `opening mark in: ${template}`);
  }
});
