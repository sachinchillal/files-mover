import type { BrowseEntry, LocationFilters } from '../types';
import { isDeniedFile } from './denied';

export type SelectionMode = 'source' | 'destination';

export type ResolveSelectionOptions = {
  mode: SelectionMode;
};

const toNameSet = (names: string[]): Set<string> =>
  new Set(names.map((name) => name.trim()).filter(Boolean));

export const entryRelativePath = (browsePath: string, name: string): string =>
  browsePath ? `${browsePath}/${name}` : name;

export const filterEntryName = (name: string, filters: LocationFilters): boolean => {
  const whitelist = toNameSet(filters.whitelist);
  if (whitelist.size > 0 && !whitelist.has(name)) {
    return false;
  }

  const blocked = toNameSet(filters.blacklist);
  if (blocked.has(name) || filters.ignoreNames.has(name)) {
    return false;
  }

  return true;
};

export const filterEntries = (entries: BrowseEntry[], filters: LocationFilters): BrowseEntry[] =>
  entries.filter((entry) => filterEntryName(entry.name, filters));

const isSelectableEntry = (entry: BrowseEntry, mode: SelectionMode): boolean => {
  if (mode === 'destination') {
    return entry.type === 'directory';
  }
  return entry.type === 'directory' || !isDeniedFile(entry.name);
};

export const resolveSelection = (
  entries: BrowseEntry[],
  browsePath: string,
  selectionConfig: string[],
  options: ResolveSelectionOptions
): string[] => {
  const config = selectionConfig.map((item) => item.trim()).filter(Boolean);
  if (!config.length) {
    return [];
  }

  const selectableEntries = entries.filter((entry) => isSelectableEntry(entry, options.mode));

  if (config.includes('*')) {
    if (options.mode === 'destination') {
      if (browsePath) {
        return [browsePath];
      }
      const firstDir = selectableEntries.find((entry) => entry.type === 'directory');
      return firstDir ? [entryRelativePath(browsePath, firstDir.name)] : [];
    }

    return selectableEntries.map((entry) => entryRelativePath(browsePath, entry.name));
  }

  const configSet = new Set(config);
  const selected: string[] = [];

  for (const entry of selectableEntries) {
    const relativePath = entryRelativePath(browsePath, entry.name);
    if (configSet.has(relativePath) || configSet.has(entry.name)) {
      selected.push(relativePath);
    }
  }

  return selected;
};
