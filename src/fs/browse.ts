import fs from 'fs';
import path from 'path';
import type { BrowseEntry, BrowseResult } from '../types';
import { isDeniedFile } from '../path/denied';
import {
  normalizeSegments,
  resolveWithinRoot,
} from '../path/paths';

const sortNames = (a: string, b: string): number =>
  a.localeCompare(b, 'en', { numeric: true });

const parentPath = (segments: string[]): string => {
  if (segments.length === 0) {
    return '';
  }
  return segments.slice(0, -1).join('/');
};

const buildEntries = (
  dirPath: string,
  ignoreNames: Set<string>
): BrowseEntry[] => {
  const entries: BrowseEntry[] = [];
  const dirents = fs.readdirSync(dirPath, { withFileTypes: true });

  const dirs: string[] = [];
  const files: string[] = [];

  for (const dirent of dirents) {
    if (dirent.isDirectory()) {
      if (!ignoreNames.has(dirent.name)) {
        dirs.push(dirent.name);
      }
    } else if (dirent.isFile()) {
      files.push(dirent.name);
    }
  }

  for (const name of dirs.sort(sortNames)) {
    entries.push({ name, type: 'directory' });
  }

  for (const name of files.sort(sortNames)) {
    entries.push({ name, type: 'file' });
  }

  return entries;
};

export const browseFilesystem = (
  baseRoot: string,
  root: string | undefined,
  ignoreNames: Set<string>
): BrowseResult => {
  const empty: BrowseResult = { path: '', parent: '', entries: [], message: '' };

  if (!fs.existsSync(baseRoot)) {
    return { ...empty, message: 'Directory not found' };
  }

  if (!root) {
    return {
      ...empty,
      path: '',
      parent: '',
      entries: buildEntries(baseRoot, ignoreNames),
    };
  }

  const segments = normalizeSegments(root);

  for (const seg of segments) {
    if (seg === '..') {
      return { ...empty, message: 'Incorrect path' };
    }
  }

  const resolved = resolveWithinRoot(baseRoot, segments);
  if (!resolved) {
    return { ...empty, message: 'Incorrect path' };
  }

  if (!fs.existsSync(resolved)) {
    return { ...empty, message: 'Directory not found' };
  }

  const stat = fs.statSync(resolved);
  if (!stat.isDirectory()) {
    const fileName = segments[segments.length - 1]!;
    if (isDeniedFile(fileName)) {
      return { ...empty, message: 'Access denied to for such file type' };
    }
    return { ...empty, message: 'Directory not found' };
  }

  const browsePath = segments.join('/');
  return {
    path: browsePath,
    parent: parentPath(segments),
    entries: buildEntries(resolved, ignoreNames),
    message: '',
  };
};

export const browseSourceTree = (
  baseRoot: string,
  root: string | undefined,
  ignoreNames: Set<string>
): BrowseResult => browseFilesystem(baseRoot, root, ignoreNames);

export const browseDestinationTree = (
  baseRoot: string,
  root: string | undefined,
  ignoreNames: Set<string>
): BrowseResult => browseFilesystem(baseRoot, root, ignoreNames);
