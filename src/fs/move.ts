import fs from 'fs';
import type { CopyResult, MoveResult } from '../types';
import { copyItems } from './copy';
import { normalizeSegments, resolveWithinRoot } from '../path/paths';

const toMoveResult = (copyResult: CopyResult): MoveResult => ({
  message: copyResult.message,
  source: copyResult.source,
  sources: copyResult.sources,
  destination: copyResult.destination,
  movedFiles: copyResult.copiedFiles,
  movedDirectories: copyResult.copiedDirectories,
  skipped: copyResult.skipped,
});

const removeSource = (sourceRoot: string, source: string): void => {
  const segments = normalizeSegments(source);
  const abs = resolveWithinRoot(sourceRoot, segments);
  if (!abs || !fs.existsSync(abs)) {
    return;
  }

  const stat = fs.statSync(abs);
  if (stat.isDirectory()) {
    fs.rmSync(abs, { recursive: true, force: true });
  } else {
    fs.unlinkSync(abs);
  }
};

export const moveItems = (
  sourceRoot: string,
  destRoot: string,
  sources: string[],
  destination: string | undefined,
  ignoreNames: Set<string>
): MoveResult => {
  const copyResult = copyItems(sourceRoot, destRoot, sources, destination, ignoreNames);
  if (copyResult.message) {
    return toMoveResult(copyResult);
  }

  const sortedSources = [...copyResult.sources].sort((a, b) => b.length - a.length);
  for (const source of sortedSources) {
    removeSource(sourceRoot, source);
  }

  return toMoveResult(copyResult);
};
