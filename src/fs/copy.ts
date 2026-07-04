import fs from 'fs';
import path from 'path';
import type { CopyResult } from '../types';import { isDeniedFile } from '../path/denied';
import {
  hasParentTraversal,
  isPathUnder,
  normalizeSegments,
  resolveWithinRoot,
  subfolderName,
} from '../path/paths';

type CopyStats = {
  copiedFiles: number;
  copiedDirectories: number;
  skipped: string[];
};

const emptyResult = (destination: string | undefined): CopyResult => ({
  message: '',
  source: '',
  sources: [],
  destination: destination ?? '',
  copiedFiles: 0,
  copiedDirectories: 0,
  skipped: [],
});

const resolveEntryType = (
  baseRoot: string,
  segments: string[]
): 'file' | 'directory' | null => {
  const resolved = resolveWithinRoot(baseRoot, segments);
  if (!resolved || !fs.existsSync(resolved)) {
    return null;
  }

  const stat = fs.statSync(resolved);
  if (stat.isDirectory()) {
    return 'directory';
  }
  if (stat.isFile()) {
    return 'file';
  }
  return null;
};

const copyDirectoryTree = (
  srcAbs: string,
  destAbs: string,
  relativePath: string,
  ignoreNames: Set<string>,
  stats: CopyStats
): void => {
  fs.mkdirSync(destAbs, { recursive: true });

  for (const entry of fs.readdirSync(srcAbs, { withFileTypes: true })) {
    const entryRel = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    const srcEntry = path.join(srcAbs, entry.name);
    const destEntry = path.join(destAbs, entry.name);

    if (entry.isDirectory()) {
      if (ignoreNames.has(entry.name)) {
        stats.skipped.push(entryRel);
        continue;
      }
      stats.copiedDirectories += 1;
      copyDirectoryTree(srcEntry, destEntry, entryRel, ignoreNames, stats);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcEntry, destEntry);
      stats.copiedFiles += 1;
    }
  }
};

const copyDirectory = (
  source: string,
  sourceSegments: string[],
  destination: string | undefined,
  destSegments: string[],
  sourceRoot: string,
  destRoot: string,
  ignoreNames: Set<string>
): CopyResult => {
  const empty = {
    ...emptyResult(destination),
    source,
    sources: [source],
  };

  const sourcePath = sourceSegments.join('/');
  const destPath = destSegments.join('/');

  if (sourceRoot === destRoot) {
    if (sourcePath === destPath) {
      return { ...empty, message: 'Source and destination cannot be the same' };
    }
    if (sourceSegments.length > 0 && isPathUnder(sourceSegments, destSegments)) {
      return { ...empty, message: 'Cannot copy into source' };
    }
  }

  const sourceAbs = resolveWithinRoot(sourceRoot, sourceSegments);
  if (!sourceAbs || !fs.existsSync(sourceAbs)) {
    return { ...empty, message: 'Source not found' };
  }

  const destParentAbs =
    destSegments.length === 0 ? destRoot : resolveWithinRoot(destRoot, destSegments);
  if (!destParentAbs || !fs.existsSync(destParentAbs) || !fs.statSync(destParentAbs).isDirectory()) {
    return { ...empty, message: 'Destination not found' };
  }

  const folderName = subfolderName(sourceSegments);
  const destAbs = path.join(destParentAbs, folderName);
  const stats: CopyStats = { copiedFiles: 0, copiedDirectories: 0, skipped: [] };

  copyDirectoryTree(sourceAbs, destAbs, sourcePath, ignoreNames, stats);

  const resultPath = destPath ? `${destPath}/${folderName}` : folderName;

  return {
    message: '',
    source: sourcePath,
    sources: [sourcePath],
    destination: resultPath,
    copiedFiles: stats.copiedFiles,
    copiedDirectories: stats.copiedDirectories,
    skipped: stats.skipped,
  };
};

const copyFile = (
  source: string,
  sourceSegments: string[],
  destination: string | undefined,
  destSegments: string[],
  sourceRoot: string,
  destRoot: string
): CopyResult => {
  const empty = {
    ...emptyResult(destination),
    source,
    sources: [source],
  };

  const fileName = sourceSegments[sourceSegments.length - 1]!;
  if (isDeniedFile(fileName)) {
    return { ...empty, message: 'Access denied to for such file type' };
  }

  const sourceAbs = resolveWithinRoot(sourceRoot, sourceSegments);
  if (!sourceAbs || !fs.existsSync(sourceAbs) || !fs.statSync(sourceAbs).isFile()) {
    return { ...empty, message: 'Source not found' };
  }

  const destParentAbs =
    destSegments.length === 0 ? destRoot : resolveWithinRoot(destRoot, destSegments);
  if (!destParentAbs || !fs.existsSync(destParentAbs) || !fs.statSync(destParentAbs).isDirectory()) {
    return { ...empty, message: 'Destination not found' };
  }

  const destAbs = path.join(destParentAbs, fileName);
  fs.copyFileSync(sourceAbs, destAbs);

  const destPath = destSegments.join('/');
  const resultPath = destPath ? `${destPath}/${fileName}` : fileName;

  return {
    message: '',
    source: sourceSegments.join('/'),
    sources: [sourceSegments.join('/')],
    destination: resultPath,
    copiedFiles: 1,
    copiedDirectories: 0,
    skipped: [],
  };
};

export const copyItems = (
  sourceRoot: string,
  destRoot: string,
  sources: string[],
  destination: string | undefined,
  ignoreNames: Set<string>
): CopyResult => {
  const empty = emptyResult(destination);

  if (sources.length === 0) {
    return { ...empty, message: 'No sources selected' };
  }
  const destSegments = normalizeSegments(destination ?? '');

  if (hasParentTraversal(destSegments)) {
    return { ...empty, message: 'Incorrect path' };
  }

  const destResolved = resolveWithinRoot(destRoot, destSegments);
  if (
    destSegments.length > 0 &&
    (!destResolved || !fs.existsSync(destResolved) || !fs.statSync(destResolved).isDirectory())
  ) {
    return { ...empty, message: 'Destination not found' };
  }

  let totalFiles = 0;
  let totalDirs = 0;
  const allSkipped: string[] = [];
  const copiedSources: string[] = [];

  for (const source of sources) {
    const sourceSegments = normalizeSegments(source);

    if (sourceSegments.length === 0) {
      return { ...empty, source, sources: [source], message: 'Source not found' };
    }

    if (hasParentTraversal(sourceSegments)) {
      return { ...empty, source, sources: [source], message: 'Incorrect path' };
    }

    const entryType = resolveEntryType(sourceRoot, sourceSegments);
    if (!entryType) {
      return { ...empty, source, sources: [source], message: 'Source not found' };
    }

    const result =
      entryType === 'file'
        ? copyFile(source, sourceSegments, destination, destSegments, sourceRoot, destRoot)
        : copyDirectory(
            source,
            sourceSegments,
            destination,
            destSegments,
            sourceRoot,
            destRoot,
            ignoreNames
          );

    if (result.message) {
      return { ...empty, source, sources: [source], message: result.message };
    }

    copiedSources.push(source);
    totalFiles += result.copiedFiles;
    totalDirs += result.copiedDirectories;
    allSkipped.push(...result.skipped);
  }

  return {
    message: '',
    source: copiedSources[0] ?? '',
    sources: copiedSources,
    destination: destination ?? '',
    copiedFiles: totalFiles,
    copiedDirectories: totalDirs,
    skipped: allSkipped,
  };
};
