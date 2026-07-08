import fs from 'fs';
import type { BrowseEntry, BrowseResult, LocationFilters } from '../types';
import { isDeniedFile } from '../path/denied';
import {
  filterEntries,
  filterEntryName,
  resolveSelection,
  type SelectionMode,
} from '../path/locationFilters';
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

const buildEntries = (dirPath: string, filters: LocationFilters): BrowseEntry[] => {
  const dirents = fs.readdirSync(dirPath, { withFileTypes: true });

  const dirs: string[] = [];
  const files: string[] = [];

  for (const dirent of dirents) {
    if (!filterEntryName(dirent.name, filters)) {
      continue;
    }
    if (dirent.isDirectory()) {
      dirs.push(dirent.name);
    } else if (dirent.isFile()) {
      files.push(dirent.name);
    }
  }

  const entries: BrowseEntry[] = [];
  for (const name of dirs.sort(sortNames)) {
    entries.push({ name, type: 'directory' });
  }
  for (const name of files.sort(sortNames)) {
    entries.push({ name, type: 'file' });
  }

  return entries;
};

const emptyResult = (): BrowseResult => ({
  path: '',
  parent: '',
  entries: [],
  selection: [],
  message: '',
});

const browseFilesystem = (
  baseRoot: string,
  root: string | undefined,
  filters: LocationFilters,
  mode: SelectionMode
): BrowseResult => {
  const empty = emptyResult();

  if (!fs.existsSync(baseRoot)) {
    return { ...empty, message: 'Directory not found' };
  }

  if (!root) {
    const entries = buildEntries(baseRoot, filters);
    return {
      ...empty,
      path: '',
      parent: '',
      entries,
      selection: resolveSelection(entries, '', filters.selection, { mode }),
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
  const entries = buildEntries(resolved, filters);
  return {
    path: browsePath,
    parent: parentPath(segments),
    entries,
    selection: resolveSelection(entries, browsePath, filters.selection, { mode }),
    message: '',
  };
};

export const browseSourceTree = (
  baseRoot: string,
  root: string | undefined,
  filters: LocationFilters
): BrowseResult => browseFilesystem(baseRoot, root, filters, 'source');

export const browseDestinationTree = (
  baseRoot: string,
  root: string | undefined,
  filters: LocationFilters
): BrowseResult => browseFilesystem(baseRoot, root, filters, 'destination');
