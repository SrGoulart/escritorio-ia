import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { folderNameFromCwd, readTranscriptCwd } from '../src/folderName.js';

describe('folderNameFromCwd', () => {
  it('takes the last segment of a Windows path', () => {
    expect(folderNameFromCwd('G:\\00 - PROJETOS\\DRE\\reclassificacao-dre')).toBe(
      'reclassificacao-dre',
    );
  });

  it('takes the last segment of a POSIX path', () => {
    expect(folderNameFromCwd('/home/vitor/projetos/painel-sks')).toBe('painel-sks');
  });

  it('ignores trailing separators', () => {
    expect(folderNameFromCwd('C:\\proj\\app\\')).toBe('app');
    expect(folderNameFromCwd('/proj/app/')).toBe('app');
  });

  it('returns undefined for empty or missing input', () => {
    expect(folderNameFromCwd('')).toBeUndefined();
    expect(folderNameFromCwd(undefined)).toBeUndefined();
  });
});

describe('readTranscriptCwd', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-cwd-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  const write = (lines: string[]): string => {
    const file = path.join(dir, 's.jsonl');
    fs.writeFileSync(file, lines.join('\n') + '\n');
    return file;
  };

  it('finds the cwd on the first record that has one', () => {
    const file = write([
      JSON.stringify({ type: 'file-history-snapshot' }),
      JSON.stringify({ type: 'user', cwd: 'G:\\proj\\reclassificacao-dre' }),
      JSON.stringify({ type: 'assistant', cwd: 'G:\\other' }),
    ]);
    expect(readTranscriptCwd(file)).toBe('G:\\proj\\reclassificacao-dre');
  });

  it('skips malformed lines', () => {
    const file = write(['{not json', JSON.stringify({ cwd: '/a/b' })]);
    expect(readTranscriptCwd(file)).toBe('/a/b');
  });

  it('returns undefined when no record carries a cwd', () => {
    const file = write([JSON.stringify({ type: 'user' })]);
    expect(readTranscriptCwd(file)).toBeUndefined();
  });

  it('returns undefined for a missing file', () => {
    expect(readTranscriptCwd(path.join(dir, 'nope.jsonl'))).toBeUndefined();
  });
});
