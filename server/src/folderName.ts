import * as fs from 'fs';

/** How much of a transcript to scan for its first `cwd` (records before it, e.g. snapshots, carry none). */
const CWD_SCAN_BYTES = 64 * 1024;

/** Last path segment of a working directory, for Windows and POSIX paths alike. */
export function folderNameFromCwd(cwd: string | undefined): string | undefined {
  if (!cwd) return undefined;
  const parts = cwd.split(/[\\/]+/).filter(Boolean);
  return parts[parts.length - 1];
}

/**
 * The real working directory of a Claude Code session, read from the first
 * transcript record that records one. Unlike the project-dir hash, it keeps
 * hyphens inside folder names ("reclassificacao-dre" stays whole).
 */
export function readTranscriptCwd(jsonlFile: string): string | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(jsonlFile, 'r');
    const buf = Buffer.alloc(CWD_SCAN_BYTES);
    const bytes = fs.readSync(fd, buf, 0, CWD_SCAN_BYTES, 0);
    const lines = buf.toString('utf-8', 0, bytes).split('\n');
    // The last line may be cut mid-record by the read window; it fails to parse and is skipped.
    for (const line of lines) {
      if (!line.includes('"cwd"')) continue;
      try {
        const record = JSON.parse(line) as { cwd?: unknown };
        if (typeof record.cwd === 'string' && record.cwd) return record.cwd;
      } catch {
        // malformed or truncated line
      }
    }
  } catch {
    // missing or unreadable file
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
  return undefined;
}
