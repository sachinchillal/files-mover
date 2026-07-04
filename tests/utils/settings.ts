import fs from 'fs';
import path from 'path';
import type { DirectoryPair } from '../../src/types';

export const TEST_PAIR_ID = 'test-pair-id';
export const TEST_SETTINGS_PATH = path.join(__dirname, '../data/test-settings.json');

export const writeTestSettings = (
  source: string,
  destination: string,
  id: string = TEST_PAIR_ID
): string => {
  const data = {
    directories: [{ id, source: path.resolve(source), destination: path.resolve(destination) }],
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
