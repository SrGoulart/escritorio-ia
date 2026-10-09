import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createSessionMetrics,
  foldMetricsRecord,
  metricsSnapshot,
  readSessionMetrics,
} from '../src/sessionMetrics.js';

const usage = (input: number, create: number, read: number, output: number) => ({
  input_tokens: input,
  cache_creation_input_tokens: create,
  cache_read_input_tokens: read,
  output_tokens: output,
});

const assistant = (id: string | undefined, u: ReturnType<typeof usage>, ts?: string) => ({
  type: 'assistant',
  timestamp: ts,
  message: { id, usage: u },
});

describe('foldMetricsRecord: tokens', () => {
  it('sums input (fresh + cache creation), cache reads and output separately', () => {
    const m = createSessionMetrics();
    foldMetricsRecord(m, assistant('m1', usage(2, 100, 1000, 50)));
    foldMetricsRecord(m, assistant('m2', usage(3, 0, 2000, 70)));
    expect(metricsSnapshot(m)).toMatchObject({
      inputTokens: 105,
      cacheReadTokens: 3000,
      outputTokens: 120,
    });
  });

  it('counts a message id once, however many records repeat it', () => {
    const m = createSessionMetrics();
    for (let i = 0; i < 6; i++) foldMetricsRecord(m, assistant('same', usage(2, 100, 1000, 50)));
    expect(metricsSnapshot(m)).toMatchObject({
      inputTokens: 102,
      cacheReadTokens: 1000,
      outputTokens: 50,
    });
  });

  it('keeps the latest usage when a repeated id reports a larger count', () => {
    const m = createSessionMetrics();
    foldMetricsRecord(m, assistant('grow', usage(1, 0, 0, 10)));
    foldMetricsRecord(m, assistant('grow', usage(1, 0, 0, 40)));
    expect(metricsSnapshot(m).outputTokens).toBe(40);
  });

  it('counts records without a message id every time', () => {
    const m = createSessionMetrics();
    foldMetricsRecord(m, assistant(undefined, usage(0, 0, 0, 5)));
    foldMetricsRecord(m, assistant(undefined, usage(0, 0, 0, 5)));
    expect(metricsSnapshot(m).outputTokens).toBe(10);
  });

  it('ignores records without usage and malformed input', () => {
    const m = createSessionMetrics();
    expect(foldMetricsRecord(m, { type: 'user', message: { content: 'oi' } })).toBe(false);
    expect(foldMetricsRecord(m, null)).toBe(false);
    expect(foldMetricsRecord(m, 'texto')).toBe(false);
    expect(foldMetricsRecord(m, assistant('z', usage(0, 0, 0, 0)))).toBe(false);
    expect(metricsSnapshot(m)).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });

  it('reports whether the totals changed', () => {
    const m = createSessionMetrics();
    expect(foldMetricsRecord(m, assistant('a', usage(1, 0, 0, 1)))).toBe(true);
    expect(foldMetricsRecord(m, assistant('a', usage(1, 0, 0, 1)))).toBe(false);
  });
});

describe('foldMetricsRecord: active time', () => {
  const at = (s: number) => new Date(Date.UTC(2026, 9, 9, 12, 0, s)).toISOString();

  it('adds the gaps between consecutive timestamps', () => {
    const m = createSessionMetrics();
    foldMetricsRecord(m, { type: 'user', timestamp: at(0) });
    foldMetricsRecord(m, { type: 'assistant', timestamp: at(10) });
    foldMetricsRecord(m, { type: 'user', timestamp: at(25) });
    expect(metricsSnapshot(m).activeMs).toBe(25_000);
  });

  it('drops pauses longer than three minutes as idle time', () => {
    const m = createSessionMetrics();
    foldMetricsRecord(m, { type: 'user', timestamp: at(0) });
    foldMetricsRecord(m, { type: 'assistant', timestamp: at(60) });
    foldMetricsRecord(m, { type: 'user', timestamp: at(60 + 181) }); // idle
    foldMetricsRecord(m, { type: 'assistant', timestamp: at(60 + 181 + 5) });
    expect(metricsSnapshot(m).activeMs).toBe(65_000);
  });

  it('ignores records without a timestamp and out-of-order ones', () => {
    const m = createSessionMetrics();
    foldMetricsRecord(m, { type: 'user', timestamp: at(30) });
    foldMetricsRecord(m, { type: 'x' });
    foldMetricsRecord(m, { type: 'assistant', timestamp: at(10) }); // goes back in time
    foldMetricsRecord(m, { type: 'assistant', timestamp: at(40) });
    // Only 30s -> 40s counts: the record without a timestamp and the one that
    // went back to 10s are skipped, and the clock stays at 30s.
    expect(metricsSnapshot(m).activeMs).toBe(10_000);
  });
});

describe('readSessionMetrics', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-metrics-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const lines = [
    JSON.stringify(assistant('a', usage(1, 10, 100, 5), '2026-10-09T12:00:00.000Z')),
    JSON.stringify(assistant('a', usage(1, 10, 100, 5), '2026-10-09T12:00:01.000Z')),
    JSON.stringify(assistant('b', usage(2, 0, 200, 7), '2026-10-09T12:00:03.000Z')),
  ];

  it('folds the whole file', () => {
    const file = path.join(dir, 's.jsonl');
    fs.writeFileSync(file, lines.join('\n') + '\n');
    expect(metricsSnapshot(readSessionMetrics(file))).toEqual({
      inputTokens: 13, // (1+10) for 'a' counted once, plus (2+0) for 'b'
      cacheReadTokens: 300,
      outputTokens: 12,
      activeMs: 3000,
    });
  });

  it('stops at the byte offset, so streaming can take over without double counting', () => {
    const file = path.join(dir, 's.jsonl');
    const head = lines.slice(0, 2).join('\n') + '\n';
    fs.writeFileSync(file, head + lines[2] + '\n');
    const m = readSessionMetrics(file, Buffer.byteLength(head));
    expect(metricsSnapshot(m).outputTokens).toBe(5);
  });

  it('skips malformed lines', () => {
    const file = path.join(dir, 's.jsonl');
    fs.writeFileSync(file, ['{broken', lines[0]].join('\n') + '\n');
    expect(metricsSnapshot(readSessionMetrics(file)).outputTokens).toBe(5);
  });

  it('returns empty metrics for a missing file', () => {
    expect(metricsSnapshot(readSessionMetrics(path.join(dir, 'nope.jsonl')))).toEqual({
      inputTokens: 0,
      cacheReadTokens: 0,
      outputTokens: 0,
      activeMs: 0,
    });
  });
});
