import * as fs from 'fs';
import { StringDecoder } from 'string_decoder';

import type { AgentStateStore } from './agentStateStore.js';
import type { AgentState } from './types.js';

/**
 * Running totals for one agent's session: tokens spent and time spent working.
 *
 * Unlike the context gauge (a snapshot of the newest turn), these only grow, so
 * they have to cover the session from its first record: `readSessionMetrics`
 * replays the history up to where streaming takes over.
 */
interface UsageBlock {
  input_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  output_tokens?: number;
}

interface MetricsRecord {
  timestamp?: string;
  message?: { id?: string; usage?: UsageBlock };
}

interface Counts {
  input: number; // fresh input + cache creation
  cacheRead: number;
  output: number;
}

export interface SessionMetrics {
  input: number;
  cacheRead: number;
  output: number;
  activeMs: number;
  /** Counts per message id: transcripts repeat one message across several records. */
  byMessageId: Map<string, Counts>;
  lastTimestampMs: number | null;
}

/** What goes over the wire: cache creation is folded into input; reads stay apart because they dwarf the rest. */
export interface MetricsSnapshot {
  inputTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  activeMs: number;
}

/**
 * A pause longer than this between two records is the user thinking or the
 * session sitting idle, not work. Active time is therefore an approximation:
 * a long tool run with no records in between is undercounted.
 */
export const ACTIVE_GAP_MAX_MS = 3 * 60 * 1000;

/** Bytes read per chunk when replaying a transcript. */
const READ_CHUNK_BYTES = 1024 * 1024;

export function createSessionMetrics(): SessionMetrics {
  return {
    input: 0,
    cacheRead: 0,
    output: 0,
    activeMs: 0,
    byMessageId: new Map(),
    lastTimestampMs: null,
  };
}

export function metricsSnapshot(m: SessionMetrics): MetricsSnapshot {
  return {
    inputTokens: m.input,
    cacheReadTokens: m.cacheRead,
    outputTokens: m.output,
    activeMs: m.activeMs,
  };
}

function countsOf(usage: UsageBlock): Counts {
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  return {
    input: n(usage.input_tokens) + n(usage.cache_creation_input_tokens),
    cacheRead: n(usage.cache_read_input_tokens),
    output: n(usage.output_tokens),
  };
}

/**
 * Fold one transcript record into the totals. Returns whether anything changed,
 * so callers only broadcast when there is news.
 */
export function foldMetricsRecord(m: SessionMetrics, record: unknown): boolean {
  if (!record || typeof record !== 'object') return false;
  const rec = record as MetricsRecord;
  let changed = false;

  // Active time: gaps between consecutive timestamps, minus long pauses.
  if (typeof rec.timestamp === 'string') {
    const t = Date.parse(rec.timestamp);
    if (Number.isFinite(t)) {
      if (m.lastTimestampMs !== null) {
        const gap = t - m.lastTimestampMs;
        if (gap > 0 && gap <= ACTIVE_GAP_MAX_MS) {
          m.activeMs += gap;
          changed = true;
        }
      }
      // Never move backwards: an out-of-order record must not inflate the next gap.
      if (m.lastTimestampMs === null || t > m.lastTimestampMs) m.lastTimestampMs = t;
    }
  }

  const usage = rec.message?.usage;
  if (usage && typeof usage === 'object') {
    const next = countsOf(usage);
    if (next.input + next.cacheRead + next.output > 0) {
      const id = rec.message?.id;
      const prev = typeof id === 'string' && id ? m.byMessageId.get(id) : undefined;
      const dIn = next.input - (prev?.input ?? 0);
      const dRead = next.cacheRead - (prev?.cacheRead ?? 0);
      const dOut = next.output - (prev?.output ?? 0);
      if (dIn !== 0 || dRead !== 0 || dOut !== 0) {
        m.input += dIn;
        m.cacheRead += dRead;
        m.output += dOut;
        changed = true;
      }
      if (typeof id === 'string' && id) m.byMessageId.set(id, next);
    }
  }
  return changed;
}

/**
 * Replay a transcript from its start to `upToByte` (default: whole file).
 * Streaming picks up at that offset, so the two never overlap.
 */
export function readSessionMetrics(jsonlFile: string, upToByte?: number): SessionMetrics {
  const m = createSessionMetrics();
  let fd: number | undefined;
  try {
    fd = fs.openSync(jsonlFile, 'r');
    const limit = Math.min(upToByte ?? Infinity, fs.fstatSync(fd).size);
    const buf = Buffer.alloc(READ_CHUNK_BYTES);
    const decoder = new StringDecoder('utf8');
    let position = 0;
    let carry = '';
    while (position < limit) {
      const want = Math.min(READ_CHUNK_BYTES, limit - position);
      const got = fs.readSync(fd, buf, 0, want, position);
      if (got <= 0) break;
      position += got;
      const lines = (carry + decoder.write(buf.subarray(0, got))).split('\n');
      carry = lines.pop() ?? '';
      for (const line of lines) foldLine(m, line);
    }
    foldLine(m, carry + decoder.end());
  } catch {
    // missing or unreadable transcript: report what was read so far (nothing)
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return m;
}

function foldLine(m: SessionMetrics, line: string): void {
  if (!line.trim()) return;
  try {
    foldMetricsRecord(m, JSON.parse(line));
  } catch {
    // malformed or truncated line
  }
}

function broadcastMetrics(agentId: number, agent: AgentState, agents: AgentStateStore): void {
  if (!agent.metrics) return;
  agents.broadcast({ type: 'agentMetrics', id: agentId, ...metricsSnapshot(agent.metrics) });
}

/**
 * Give an agent its totals when watching starts: history up to `fileOffset`
 * (adopted agents start at end-of-file), then streaming adds the rest.
 */
export function seedSessionMetrics(agentId: number, agents: AgentStateStore): void {
  const agent = agents.get(agentId);
  if (!agent || agent.metrics || !agent.jsonlFile) return;
  agent.metrics = readSessionMetrics(agent.jsonlFile, agent.fileOffset);
  broadcastMetrics(agentId, agent, agents);
}

/** Fold one freshly streamed record into the agent's totals and broadcast on change. */
export function updateSessionMetrics(
  agentId: number,
  agent: AgentState,
  agents: AgentStateStore,
  record: unknown,
): void {
  agent.metrics ??= createSessionMetrics();
  if (foldMetricsRecord(agent.metrics, record)) broadcastMetrics(agentId, agent, agents);
}
