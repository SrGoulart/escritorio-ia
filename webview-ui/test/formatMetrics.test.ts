/**
 * Per-agent totals as shown in the overlay: "12k tok · 4m".
 *
 * Run with: npm test
 */

import assert from 'node:assert/strict';

import { test } from 'vitest';

import {
  formatDuration,
  formatTokens,
  metricsLabel,
  metricsTooltip,
} from '../src/office/engine/formatMetrics.js';

test('small token counts are shown as is', () => {
  assert.equal(formatTokens(0), '0');
  assert.equal(formatTokens(842), '842');
});

test('thousands get one decimal below 10k and none above', () => {
  assert.equal(formatTokens(1_000), '1.0k');
  assert.equal(formatTokens(1_234), '1.2k');
  assert.equal(formatTokens(9_949), '9.9k');
  assert.equal(formatTokens(12_400), '12k');
  assert.equal(formatTokens(123_456), '123k');
});

test('millions get one decimal', () => {
  assert.equal(formatTokens(1_000_000), '1.0M');
  assert.equal(formatTokens(2_345_678), '2.3M');
});

test('a count that rounds up to the next unit is promoted to it', () => {
  assert.equal(formatTokens(999_900), '1.0M');
  assert.equal(formatTokens(9_999), '10k');
});

test('durations: seconds, minutes, hours', () => {
  assert.equal(formatDuration(0), '0s');
  assert.equal(formatDuration(45_000), '45s');
  assert.equal(formatDuration(60_000), '1m');
  assert.equal(formatDuration(12 * 60_000 + 40_000), '12m');
  assert.equal(formatDuration(2 * 3_600_000 + 5 * 60_000), '2h 05m');
});

test('the label counts input + output and leaves cache reads out', () => {
  const label = metricsLabel({
    inputTokens: 8_000,
    cacheReadTokens: 5_000_000,
    outputTokens: 4_400,
    activeMs: 4 * 60_000,
  });
  assert.equal(label, '12k tok · 4m');
});

test('no label before the first totals arrive', () => {
  assert.equal(metricsLabel(null), null);
});

test('the tooltip spells out every counter, cache reads included', () => {
  const tip = metricsTooltip({
    inputTokens: 8_000,
    cacheReadTokens: 5_000_000,
    outputTokens: 4_400,
    activeMs: 4 * 60_000,
  });
  assert.match(tip, /8\.0k/);
  assert.match(tip, /4\.4k/);
  assert.match(tip, /5\.0M/);
  assert.match(tip, /4m/);
});
