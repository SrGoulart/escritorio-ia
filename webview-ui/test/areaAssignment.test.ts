/**
 * One office room per project: a folder with no Area mapping claims the first
 * unowned Area that has seats, and overflow agents never sit in another
 * folder's Area.
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  needsAreaAssignment,
  pickUnclaimedArea,
  seatsOutsideForeignAreas,
} from '../src/office/engine/areaAssignment.js';

test('a folder with no mapping entry needs an area', () => {
  assert.equal(needsAreaAssignment({}, 'painel-sks'), true);
});

test('an empty mapping array is a deliberate choice and is never overwritten', () => {
  assert.equal(needsAreaAssignment({ 'painel-sks': [] }, 'painel-sks'), false);
});

test('an already-mapped folder does not need an area', () => {
  assert.equal(needsAreaAssignment({ 'painel-sks': ['Sala A'] }, 'painel-sks'), false);
});

test('picks the first area, in layout order, that has seats and no owner', () => {
  const picked = pickUnclaimedArea(
    ['Sala A', 'Sala B', 'Sala C'],
    new Set(['Sala A', 'Sala B', 'Sala C']),
    {
      dre: ['Sala A'],
    },
  );
  assert.equal(picked, 'Sala B');
});

test('skips areas without any seat', () => {
  const picked = pickUnclaimedArea(['Corredor', 'Sala B'], new Set(['Sala B']), {});
  assert.equal(picked, 'Sala B');
});

test('areas shared through a multi-label mapping count as owned', () => {
  const picked = pickUnclaimedArea(
    ['Sala A', 'Sala B', 'Sala C'],
    new Set(['Sala A', 'Sala B', 'Sala C']),
    {
      dre: ['Sala A', 'Sala B'],
    },
  );
  assert.equal(picked, 'Sala C');
});

test('returns null when every area is owned', () => {
  const picked = pickUnclaimedArea(['Sala A'], new Set(['Sala A']), { dre: ['Sala A'] });
  assert.equal(picked, null);
});

test('returns null when the layout defines no areas', () => {
  assert.equal(pickUnclaimedArea([], new Set(), {}), null);
});

const zones: Record<string, string | null> = {
  s1: 'Sala A',
  s2: 'Sala B',
  s3: 'Sala C',
  s4: null,
};
const zoneOf = (uid: string): string | null => zones[uid] ?? null;

test('overflow seating drops seats in areas owned by another folder', () => {
  const kept = seatsOutsideForeignAreas(
    ['s1', 's2', 's3', 's4'],
    zoneOf,
    { dre: ['Sala A'], sks: ['Sala B'] },
    'novo',
  );
  assert.deepEqual(kept, ['s3', 's4']);
});

test('a folder keeps seats in its own area', () => {
  const kept = seatsOutsideForeignAreas(
    ['s1', 's2'],
    zoneOf,
    { dre: ['Sala A'], sks: ['Sala B'] },
    'dre',
  );
  assert.deepEqual(kept, ['s1']);
});

test('an area shared by two folders is not foreign to either', () => {
  const kept = seatsOutsideForeignAreas(
    ['s1'],
    zoneOf,
    { dre: ['Sala A'], sks: ['Sala A'] },
    'sks',
  );
  assert.deepEqual(kept, ['s1']);
});

test('without mappings every seat is kept', () => {
  assert.deepEqual(seatsOutsideForeignAreas(['s1', 's4'], zoneOf, {}, 'x'), ['s1', 's4']);
});
