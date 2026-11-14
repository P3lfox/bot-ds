import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGame } from '../src/squads/games.js';

test('aliases resolve to the canonical game and its squad size', () => {
  assert.deepEqual(resolveGame('valo'), { name: 'Valorant', capacity: 5, known: true, minPlayers: null });
  assert.deepEqual(resolveGame('VALORANT'), { name: 'Valorant', capacity: 5, known: true, minPlayers: null });
  assert.deepEqual(resolveGame('lol'), { name: 'League of Legends', capacity: 5, known: true, minPlayers: null });
  assert.deepEqual(resolveGame('Fortnite'), { name: 'Fortnite', capacity: 4, known: true, minPlayers: null });
});

test('matching ignores accents, spaces and punctuation', () => {
  assert.equal(resolveGame('  League of Legends ').name, 'League of Legends');
  assert.equal(resolveGame('cs:go').name, 'Counter-Strike 2');
  assert.equal(resolveGame('Rocket-League').capacity, 3);
});

test('unknown games keep the typed name and use the default size', () => {
  assert.deepEqual(resolveGame('Juego Raro'), { name: 'Juego Raro', capacity: 5, known: false, minPlayers: null });
});

test('new fixed-size games resolve with their squad size', () => {
  assert.deepEqual(resolveGame('lethal'), { name: 'Lethal Company', capacity: 4, known: true, minPlayers: null });
  assert.deepEqual(resolveGame('l4d2'), { name: 'Left 4 Dead 2', capacity: 4, known: true, minPlayers: null });
  assert.deepEqual(resolveGame('elden ring'), { name: 'Elden Ring', capacity: 3, known: true, minPlayers: null });
  assert.equal(resolveGame('er').name, 'Elden Ring');
});

test('open-world games have no capacity', () => {
  assert.deepEqual(resolveGame('mc'), { name: 'Minecraft', capacity: null, known: true, minPlayers: null });
  assert.deepEqual(resolveGame('Project Zomboid'), { name: 'Project Zomboid', capacity: null, known: true, minPlayers: null });
  assert.equal(resolveGame('pz').name, 'Project Zomboid');
  assert.deepEqual(resolveGame('Valheim'), { name: 'Valheim', capacity: null, known: true, minPlayers: null });
});

test('Rocket League is ready with 2 and full with 3', () => {
  assert.deepEqual(resolveGame('rl'), { name: 'Rocket League', capacity: 3, known: true, minPlayers: 2 });
});
