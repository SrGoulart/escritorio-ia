/** An agent's session totals as the webview holds them (mirrors the `agentMetrics` message). */
export interface AgentMetricsView {
  inputTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  activeMs: number;
}

/** 842 -> "842", 1234 -> "1.2k", 12400 -> "12k", 2345678 -> "2.3M". */
export function formatTokens(n: number): string {
  if (n < 1_000) return String(Math.round(n));
  if (n < 1_000_000) {
    const k = n / 1_000;
    if (k < 10) {
      const text = k.toFixed(1);
      // 9.95k+ rounds to "10.0k": show it in the whole-number form instead.
      return text === '10.0' ? '10k' : `${text}k`;
    }
    const rounded = Math.round(k);
    // 999.5k+ rounds to 1000k: promote to millions.
    return rounded >= 1_000 ? '1.0M' : `${rounded}k`;
  }
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** 45s, 12m, "2h 05m". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1_000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const totalMinutes = Math.floor(totalSeconds / 60);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  return `${hours}h ${String(totalMinutes % 60).padStart(2, '0')}m`;
}

/** The one-line overlay label. Cache reads are left out: they re-read the same context every turn and would dwarf the real work. */
export function metricsLabel(m: AgentMetricsView | null): string | null {
  if (!m) return null;
  return `${formatTokens(m.inputTokens + m.outputTokens)} tok · ${formatDuration(m.activeMs)}`;
}

export function metricsTooltip(m: AgentMetricsView): string {
  return [
    `Input: ${formatTokens(m.inputTokens)} tokens (fresh + cache creation)`,
    `Output: ${formatTokens(m.outputTokens)} tokens`,
    `Cache reads: ${formatTokens(m.cacheReadTokens)} tokens (not in the total)`,
    `Active: ${formatDuration(m.activeMs)} (approximate, pauses over 3 min excluded)`,
  ].join('\n');
}
