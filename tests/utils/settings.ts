import fs from 'fs';
import path from 'path';
import type { DirectoryLocation, DirectoryPair } from '../../src/types';

export const TEST_PAIR_ID = 'test-pair-id';
export const TEST_PAIR_TITLE = 'Test pair';
export const TEST_SETTINGS_PATH = path.join(__dirname, '../data/test-settings.json');

export type LocationFilterOverrides = Partial<
  Pick<DirectoryLocation, 'whitelist' | 'blacklist' | 'selection'>
>;

export type WriteTestSettingsOptions = {
  sourceFilters?: LocationFilterOverrides;
  destinationFilters?: LocationFilterOverrides;
};

export const makeLocation = (
  locationPath: string,
  overrides: LocationFilterOverrides = {}
): DirectoryLocation => ({
  path: path.resolve(locationPath),
  whitelist: overrides.whitelist ?? [],
  blacklist: overrides.blacklist ?? [],
  selection: overrides.selection ?? [],
});

export const writeTestSettings = (
  source: string,
  destination: string,
  id: string = TEST_PAIR_ID,
  title: string = TEST_PAIR_TITLE,
  options: WriteTestSettingsOptions = {}
): string => {
  const now = Date.now();
  const data = {
    directories: [
      {
        id,
        title,
        source: makeLocation(source, options.sourceFilters),
        destination: makeLocation(destination, options.destinationFilters),
        createdAt: now,
        updatedAt: now,
      },
    ],
  };
  fs.mkdirSync(path.dirname(TEST_SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(TEST_SETTINGS_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  process.env.SETTINGS_PATH = TEST_SETTINGS_PATH;
  return id;
};

export const clearTestSettings = (): void => {
  if (fs.existsSync(TEST_SETTINGS_PATH)) {
    fs.rmSync(TEST_SETTINGS_PATH, { force: true });
  }
  delete process.env.SETTINGS_PATH;
};

export const withPairQuery = (url: string, pairId: string = TEST_PAIR_ID): string => {
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}pairId=${encodeURIComponent(pairId)}`;
};

export const withPairBody = <T extends Record<string, unknown>>(
  body: T,
  pairId: string = TEST_PAIR_ID
): T & { pairId: string } => ({
  ...body,
  pairId,
});

export type { DirectoryPair };
