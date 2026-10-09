/**
 * Seating through OfficeState: a folder claims its own room on first sight, even
 * when the agent comes back with a saved seat, and the claim is persisted once.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import { OfficeState } from '../src/office/engine/officeState.js';
import type { OfficeLayout, Seat } from '../src/office/types.js';
import { Direction, TileType } from '../src/office/types.js';

const COLS = 6;
const ROWS = 2;

/** Two rooms side by side: cols 0-2 are "Sala 1", cols 3-5 are "Sala 2". One seat each, plus an unzoned one. */
function twoRoomOffice(): OfficeState {
  const layout: OfficeLayout = {
    version: 1,
    cols: COLS,
    rows: ROWS,
    tiles: new Array<TileType>(COLS * ROWS).fill(TileType.FLOOR_1),
    furniture: [],
    areas: [
      { label: 'Sala 1', color: 'red' },
      { label: 'Sala 2', color: 'blue' },
    ],
    areaTiles: Array.from({ length: COLS * ROWS }, (_, i) => (i % COLS < 3 ? 'Sala 1' : 'Sala 2')),
  };
  const os = new OfficeState(layout);
  const seat = (uid: string, col: number, row: number): Seat => ({
    uid,
    seatCol: col,
    seatRow: row,
    facingDir: Direction.DOWN,
    assigned: false,
  });
  os.seats.clear();
  os.seats.set('a1', seat('a1', 0, 0));
  os.seats.set('a2', seat('a2', 1, 0));
  os.seats.set('b1', seat('b1', 4, 0));
  os.seats.set('b2', seat('b2', 5, 0));
  return os;
}

test('a new folder claims the first free room and sits in it', () => {
  const os = twoRoomOffice();
  const persisted: Array<Record<string, string[]>> = [];
  os.onAreaMappingsAutoAssigned = (m) => persisted.push(m);

  os.addAgent(1, undefined, undefined, undefined, true, 'dre');

  assert.deepEqual(os.areaMappings, { dre: ['Sala 1'] });
  assert.equal(os.seatZone(os.characters.get(1)!.seatId!), 'Sala 1');
  assert.equal(persisted.length, 1, 'persisted exactly once');
});

test('a second folder gets the next room, and the first keeps its own', () => {
  const os = twoRoomOffice();
  os.addAgent(1, undefined, undefined, undefined, true, 'dre');
  os.addAgent(2, undefined, undefined, undefined, true, 'painel-sks');
  os.addAgent(3, undefined, undefined, undefined, true, 'dre');

  assert.deepEqual(os.areaMappings, { dre: ['Sala 1'], 'painel-sks': ['Sala 2'] });
  assert.equal(os.seatZone(os.characters.get(2)!.seatId!), 'Sala 2');
  assert.equal(os.seatZone(os.characters.get(3)!.seatId!), 'Sala 1');
});

test('a restored agent with a saved seat in the wrong room is moved into its folder room', () => {
  const os = twoRoomOffice();
  os.addAgent(1, undefined, undefined, 'b1', true, 'dre'); // saved seat is in Sala 2

  assert.deepEqual(os.areaMappings, { dre: ['Sala 1'] });
  assert.equal(os.seatZone(os.characters.get(1)!.seatId!), 'Sala 1');
});

test('a restored agent whose folder is already mapped keeps its saved seat', () => {
  const os = twoRoomOffice();
  os.setAreaMappings({ dre: ['Sala 1'] });
  let fired = false;
  os.onAreaMappingsAutoAssigned = () => (fired = true);

  os.addAgent(1, undefined, undefined, 'a2', true, 'dre');

  assert.equal(os.characters.get(1)!.seatId, 'a2');
  assert.equal(fired, false, 'nothing to persist');
});

test('overflow never sits in another folder room', () => {
  const os = twoRoomOffice();
  os.addAgent(1, undefined, undefined, undefined, true, 'dre');
  os.addAgent(2, undefined, undefined, undefined, true, 'painel-sks');
  // No third room: this folder has to overflow, and both rooms are owned.
  os.addAgent(3, undefined, undefined, undefined, true, 'novo');

  assert.equal(os.characters.get(3)!.seatId, null, 'no seat rather than a stranger room');
});
