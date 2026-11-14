import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGame } from '../src/squads/games.js';

test('aliases resolve to the canonical game and its squad size', () => {
  assert.deepEqual(resolveGame('valo'), { name: 'Valorant', capacity: 5, known: true });
  assert.deepEqual(resolveGame('VALORANT'), { name: 'Valorant', capacity: 5, known: true });
  assert.deepEqual(resolveGame('lol'), { name: 'League of Legends', capacity: 5, known: true });
  assert.deepEqual(resolveGame('Fortnite'), { name: 'Fortnite', capacity: 4, known: true });
});

test('matching ignores accents, spaces and punctuation', () => {
  assert.equal(resolveGame('  League of Legends ').name, 'League of Legends');
  assert.equal(resolveGame('cs:go').name, 'Counter-Strike 2');
  assert.equal(resolveGame('Rocket-League').capacity, 3);
});

test('unknown games keep the typed name and use the default size', () => {
  assert.deepEqual(resolveGame('Juego Raro'), { name: 'Juego Raro', capacity: 5, known: false });
});

