import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { DirectoryLocation, DirectoryPair, SettingsData } from '../types';

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

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const emptyLocationLists = (): Pick<DirectoryLocation, 'whitelist' | 'blacklist' | 'selection'> => ({
  whitelist: [],
  blacklist: [],
  selection: [],
});

export const normalizeLocation = (raw: unknown): DirectoryLocation => {
  if (typeof raw === 'string') {
    return {
      path: path.resolve(raw.trim()),
      ...emptyLocationLists(),
    };
  }

  if (typeof raw === 'object' && raw !== null) {
    const record = raw as Record<string, unknown>;
    const rawPath = typeof record.path === 'string' ? record.path.trim() : '';
    return {
      path: rawPath ? path.resolve(rawPath) : '',
      whitelist: normalizeStringList(record.whitelist),
      blacklist: normalizeStringList(record.blacklist),
      selection: normalizeStringList(record.selection),
    };
  }

  return { path: '', ...emptyLocationLists() };
};

const deriveTitle = (source: DirectoryLocation, destination: DirectoryLocation): string => {
  const sourceName = source.path.split(/[/\\]/).filter(Boolean).pop() || source.path;
  const destName = destination.path.split(/[/\\]/).filter(Boolean).pop() || destination.path;
  return `${sourceName} → ${destName}`;
};

const validateTitle = (title: string): string => {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new SettingsValidationError('Title is required');
  }
  return trimmed;
};

const validatePairPaths = (
  source: DirectoryLocation,
  destination: DirectoryLocation
): { source: DirectoryLocation; destination: DirectoryLocation } => {
  if (!source.path || !destination.path) {
    throw new SettingsValidationError('Source and destination paths are required');
  }

  if (!fs.existsSync(source.path)) {
    throw new SettingsValidationError('Source path does not exist');
  }
  if (!fs.statSync(source.path).isDirectory()) {
    throw new SettingsValidationError('Source path must be a directory');
  }
  if (!fs.existsSync(destination.path)) {
    throw new SettingsValidationError('Destination path does not exist');
  }
  if (!fs.statSync(destination.path).isDirectory()) {
    throw new SettingsValidationError('Destination path must be a directory');
  }

  return { source, destination };
};

const writeSettings = (data: SettingsData): void => {
  const filePath = getSettingsPath();
  ensureSettingsDir(filePath);
  const tempPath = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
};

const isValidLocationRaw = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return typeof record.path === 'string' && record.path.trim().length > 0;
  }
  return false;
};

const isLegacyLocation = (value: unknown): boolean => typeof value === 'string';

const normalizeEntry = (
  entry: Omit<Partial<DirectoryPair>, 'source' | 'destination'> & { source: unknown; destination: unknown }
): DirectoryPair => {
  const source = normalizeLocation(entry.source);
  const destination = normalizeLocation(entry.destination);
  const now = Date.now();
  const title =
    typeof entry.title === 'string' && entry.title.trim()
      ? entry.title.trim()
      : deriveTitle(source, destination);
  const createdAt = typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt) ? entry.createdAt : now;
  const updatedAt = typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt) ? entry.updatedAt : now;

  return {
    id: typeof entry.id === 'string' && entry.id.trim() ? entry.id : crypto.randomUUID(),
    title,
    source,
    destination,
    createdAt,
    updatedAt,
  };
};

const entryNeedsMigration = (entry: unknown): boolean => {
  if (typeof entry !== 'object' || entry === null) {
    return false;
  }
  const record = entry as Record<string, unknown>;
  return (
    typeof record.id !== 'string' ||
    !record.id.trim() ||
    typeof record.title !== 'string' ||
    !record.title.trim() ||
    typeof record.createdAt !== 'number' ||
    !Number.isFinite(record.createdAt) ||
    typeof record.updatedAt !== 'number' ||
    !Number.isFinite(record.updatedAt) ||
    isLegacyLocation(record.source) ||
    isLegacyLocation(record.destination)
  );
};

const readSettings = (): SettingsData => {
  const filePath = getSettingsPath();
  if (!fs.existsSync(filePath)) {
    return { directories: [] };
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { directories?: unknown };
  const entries = Array.isArray(raw.directories) ? raw.directories : [];
  const needsMigration = entries.some(entryNeedsMigration);

  const directories = entries
    .filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === 'object' &&
        entry !== null &&
        isValidLocationRaw((entry as { source?: unknown }).source) &&
        isValidLocationRaw((entry as { destination?: unknown }).destination)
    )
    .map((entry) =>
      normalizeEntry({
        source: entry.source,
        destination: entry.destination,
        ...(typeof entry.id === 'string' && entry.id.trim() ? { id: entry.id } : {}),
        ...(typeof entry.title === 'string' && entry.title.trim() ? { title: entry.title } : {}),
        ...(typeof entry.createdAt === 'number' && Number.isFinite(entry.createdAt)
          ? { createdAt: entry.createdAt }
          : {}),
        ...(typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt)
          ? { updatedAt: entry.updatedAt }
          : {}),
      })
    );

  const data = { directories };
  if (needsMigration) {
    writeSettings(data);
  }
  return data;
};

export const listPairs = (): DirectoryPair[] => readSettings().directories;

export const getPairById = (id: string): DirectoryPair | null =>
  listPairs().find((pair) => pair.id === id) ?? null;

export const addPair = (source: DirectoryLocation, destination: DirectoryLocation, title: string): DirectoryPair => {
  const validatedTitle = validateTitle(title);
  const normalizedSource = normalizeLocation(source);
  const normalizedDestination = normalizeLocation(destination);
  const validated = validatePairPaths(normalizedSource, normalizedDestination);
  const data = readSettings();
  const now = Date.now();
  const pair: DirectoryPair = {
    id: crypto.randomUUID(),
    title: validatedTitle,
    source: validated.source,
    destination: validated.destination,
    createdAt: now,
    updatedAt: now,
  };
  data.directories.push(pair);
  writeSettings(data);
  return pair;
};

export const updatePair = (
  id: string,
  source: DirectoryLocation,
  destination: DirectoryLocation,
  title: string
): DirectoryPair => {
  const validatedTitle = validateTitle(title);
  const normalizedSource = normalizeLocation(source);
  const normalizedDestination = normalizeLocation(destination);
  const validated = validatePairPaths(normalizedSource, normalizedDestination);
  const data = readSettings();
  const index = data.directories.findIndex((pair) => pair.id === id);
  if (index === -1) {
    throw new SettingsValidationError('Directory pair not found');
  }

  const existing = data.directories[index]!;
  const updated: DirectoryPair = {
    id,
    title: validatedTitle,
    source: validated.source,
    destination: validated.destination,
    createdAt: existing.createdAt,
    updatedAt: Date.now(),
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
