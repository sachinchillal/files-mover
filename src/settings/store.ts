import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { DirectoryPair, SettingsData } from '../types';

export class SettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SettingsValidationError';
  }
}

const getSettingsPath = (): string =>
  process.env.SETTINGS_PATH ?? path.join(__dirname, '..', 'data', 'settings.json');

const ensureSettingsDir = (filePath: string): void => {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const validatePairPaths = (source: string, destination: string): { source: string; destination: string } => {
  const trimmedSource = source.trim();
  const trimmedDestination = destination.trim();

  if (!trimmedSource || !trimmedDestination) {
    throw new SettingsValidationError('Source and destination paths are required');
  }

  const resolvedSource = path.resolve(trimmedSource);
  const resolvedDestination = path.resolve(trimmedDestination);

  if (!fs.existsSync(resolvedSource)) {
    throw new SettingsValidationError('Source path does not exist');
  }
  if (!fs.statSync(resolvedSource).isDirectory()) {
    throw new SettingsValidationError('Source path must be a directory');
  }
  if (!fs.existsSync(resolvedDestination)) {
    throw new SettingsValidationError('Destination path does not exist');
  }
  if (!fs.statSync(resolvedDestination).isDirectory()) {
    throw new SettingsValidationError('Destination path must be a directory');
  }

  return { source: resolvedSource, destination: resolvedDestination };
};

const writeSettings = (data: SettingsData): void => {
  const filePath = getSettingsPath();
  ensureSettingsDir(filePath);
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
};

const normalizeEntry = (entry: Partial<DirectoryPair> & { source: string; destination: string }): DirectoryPair => ({
  id: typeof entry.id === 'string' && entry.id.trim() ? entry.id : crypto.randomUUID(),
  source: path.resolve(entry.source.trim()),
  destination: path.resolve(entry.destination.trim()),
});

const readSettings = (): SettingsData => {
  const filePath = getSettingsPath();
  if (!fs.existsSync(filePath)) {
    return { directories: [] };
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { directories?: unknown };
  const entries = Array.isArray(raw.directories) ? raw.directories : [];
  const needsMigration = entries.some(
    (entry) =>
      typeof entry === 'object' &&
      entry !== null &&
      (typeof (entry as { id?: string }).id !== 'string' || !(entry as { id?: string }).id?.trim())
  );

  const directories = entries
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as { source?: unknown }).source === 'string' &&
        typeof (entry as { destination?: unknown }).destination === 'string'
    )
    .map((entry) => {
      const normalized: { source: string; destination: string; id?: string } = {
        source: entry.source as string,
        destination: entry.destination as string,
      };
      if (typeof entry.id === 'string' && entry.id.trim()) {
        normalized.id = entry.id;
      }
      return normalizeEntry(normalized);
    });

  const data = { directories };
  if (needsMigration) {
    writeSettings(data);
  }
  return data;
};

export const listPairs = (): DirectoryPair[] => readSettings().directories;

export const getPairById = (id: string): DirectoryPair | null =>
  listPairs().find((pair) => pair.id === id) ?? null;

export const addPair = (source: string, destination: string): DirectoryPair => {
  const validated = validatePairPaths(source, destination);
  const data = readSettings();
  const pair: DirectoryPair = {
    id: crypto.randomUUID(),
    source: validated.source,
    destination: validated.destination,
  };
  data.directories.push(pair);
  writeSettings(data);
  return pair;
};

export const updatePair = (id: string, source: string, destination: string): DirectoryPair => {
  const validated = validatePairPaths(source, destination);
  const data = readSettings();
  const index = data.directories.findIndex((pair) => pair.id === id);
  if (index === -1) {
    throw new SettingsValidationError('Directory pair not found');
  }

  const updated: DirectoryPair = {
    id,
    source: validated.source,
    destination: validated.destination,
  };
  data.directories[index] = updated;
  writeSettings(data);
  return updated;
};

export const deletePair = (id: string): DirectoryPair => {
  const data = readSettings();
  const index = data.directories.findIndex((pair) => pair.id === id);
  if (index === -1) {
    throw new SettingsValidationError('Directory pair not found');
  }

  const [removed] = data.directories.splice(index, 1);
  writeSettings(data);
  return removed!;
};
