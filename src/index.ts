// src/index.ts
import dotenv from 'dotenv';
import type { Request, Response } from 'express';
import express, { Router } from 'express';
import path from 'path';

if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

import { browseDestinationTree, browseSourceTree } from './fs/browse';
import { copyItems } from './fs/copy';
import { extractZip } from './fs/extractZip';
import { moveItems } from './fs/move';
import { parseIgnoreList } from './path/ignore';
import {
  SettingsValidationError,
  addPair,
  deletePair,
  getPairById,
  listPairs,
  normalizeLocation,
  updatePair,
} from './settings/store';
import type { BrowseResult, DirectoryLocation, LocationFilters } from './types';

const PORT = process.env.PORT || 3300;

const app = express();
app.use(express.json());
const apiRouter = Router();

apiRouter.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'API is working fine...!' });
});

apiRouter.get('/ping', (_req: Request, res: Response) => {
  res.json({ message: 'pong' });
});

const EMOJI_INDEX_URL = 'https://favicon.io/assets/data/emoji-favicons/index.json';

apiRouter.get('/emojis', async (_req: Request, res: Response) => {
  try {
    const response = await fetch(EMOJI_INDEX_URL);
    if (!response.ok) {
      res.status(response.status).json({ message: 'Failed to fetch emoji index' });
      return;
    }
    res.json(await response.json());
  } catch {
    res.status(502).json({ message: 'Failed to fetch emoji index' });
  }
});

apiRouter.get('/settings', (_req: Request, res: Response) => {
  res.json({ directories: listPairs() });
});

const parseLocationBody = (value: unknown): DirectoryLocation | null => {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.path !== 'string' || !record.path.trim()) {
    return null;
  }
  return normalizeLocation(value);
};

apiRouter.post('/settings/directories', (req: Request, res: Response) => {
  const title = typeof req.body?.title === 'string' ? req.body.title : '';
  const source = parseLocationBody(req.body?.source);
  const destination = parseLocationBody(req.body?.destination);

  if (!source || !destination) {
    res.status(400).json({ message: 'Source and destination paths are required' });
    return;
  }

  try {
    const pair = addPair(source, destination, title);
    res.status(201).json(pair);
  } catch (error) {
    if (error instanceof SettingsValidationError) {
      res.status(400).json({ message: error.message });
      return;
    }
    throw error;
  }
});

apiRouter.put('/settings/directories/:id', (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : '';
  const title = typeof req.body?.title === 'string' ? req.body.title : '';
  const source = parseLocationBody(req.body?.source);
  const destination = parseLocationBody(req.body?.destination);

  if (!source || !destination) {
    res.status(400).json({ message: 'Source and destination paths are required' });
    return;
  }

  try {
    const pair = updatePair(id, source, destination, title);
    res.json(pair);
  } catch (error) {
    if (error instanceof SettingsValidationError) {
      const status = error.message === 'Directory pair not found' ? 404 : 400;
      res.status(status).json({ message: error.message });
      return;
    }
    throw error;
  }
});

apiRouter.delete('/settings/directories/:id', (req: Request, res: Response) => {
  const id = typeof req.params.id === 'string' ? req.params.id : '';

  try {
    const pair = deletePair(id);
    res.json(pair);
  } catch (error) {
    if (error instanceof SettingsValidationError) {
      res.status(404).json({ message: error.message });
      return;
    }
    throw error;
  }
});

const sendBrowseResponse = (res: Response, result: BrowseResult): void => {
  if (result.message === 'Incorrect path') {
    res.status(400).json(result);
    return;
  }

  if (
    result.message === 'Directory not found' ||
    result.message === 'Access denied to for such file type'
  ) {
    res.status(404).json(result);
    return;
  }

  res.json(result);
};

const resolvePairId = (pairId: string | undefined, res: Response) => {
  if (!pairId) {
    res.status(400).json({ message: 'pairId is required' });
    return null;
  }

  const pair = getPairById(pairId);
  if (!pair) {
    res.status(404).json({ message: 'Directory pair not found' });
    return null;
  }

  return pair;
};

apiRouter.get('/source/browse', (req: Request, res: Response) => {
  const pairId = typeof req.query.pairId === 'string' ? req.query.pairId : undefined;
  const pair = resolvePairId(pairId, res);
  if (!pair) {
    return;
  }

  const root = typeof req.query.root === 'string' ? req.query.root : undefined;
  const ignore = typeof req.query.ignore === 'string' ? req.query.ignore : undefined;
  const filters: LocationFilters = {
    whitelist: pair.source.whitelist,
    blacklist: pair.source.blacklist,
    selection: pair.source.selection,
    ignoreNames: parseIgnoreList(ignore),
  };

  sendBrowseResponse(res, browseSourceTree(pair.source.path, root, filters));
});

apiRouter.get('/destination/browse', (req: Request, res: Response) => {
  const pairId = typeof req.query.pairId === 'string' ? req.query.pairId : undefined;
  const pair = resolvePairId(pairId, res);
  if (!pair) {
    return;
  }

  const root = typeof req.query.root === 'string' ? req.query.root : undefined;
  const ignore = typeof req.query.ignore === 'string' ? req.query.ignore : undefined;
  const filters: LocationFilters = {
    whitelist: pair.destination.whitelist,
    blacklist: pair.destination.blacklist,
    selection: pair.destination.selection,
    ignoreNames: parseIgnoreList(ignore),
  };

  sendBrowseResponse(res, browseDestinationTree(pair.destination.path, root, filters));
});

apiRouter.post('/copy', (req: Request, res: Response) => {
  const pairId = typeof req.body?.pairId === 'string' ? req.body.pairId : undefined;
  const pair = resolvePairId(pairId, res);
  if (!pair) {
    return;
  }

  const sources = (Array.isArray(req.body?.sources)
    ? req.body.sources.filter((s: unknown): s is string => typeof s === 'string')
    : typeof req.body?.source === 'string'
      ? [req.body.source]
      : []
  )
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);
  const destination = typeof req.body?.destination === 'string' ? req.body.destination : undefined;
  const ignore = typeof req.body?.ignore === 'string' ? req.body.ignore : undefined;
  const ignoreNames = parseIgnoreList(ignore);

  if (sources.length === 0) {
    res.status(400).json({ message: 'No sources selected' });
    return;
  }

  const result = copyItems(pair.source.path, pair.destination.path, sources, destination, ignoreNames);

  if (result.message === 'No sources selected') {
    res.status(400).json(result);
    return;
  }

  if (result.message === 'Incorrect path') {
    res.status(400).json(result);
    return;
  }

  if (result.message === 'Source and destination cannot be the same') {
    res.status(400).json(result);
    return;
  }

  if (result.message === 'Cannot copy into source') {
    res.status(400).json(result);
    return;
  }

  if (
    result.message === 'Source not found' ||
    result.message === 'Destination not found' ||
    result.message === 'Access denied to for such file type'
  ) {
    res.status(404).json(result);
    return;
  }

  res.json(result);
});

apiRouter.post('/move', (req: Request, res: Response) => {
  const pairId = typeof req.body?.pairId === 'string' ? req.body.pairId : undefined;
  const pair = resolvePairId(pairId, res);
  if (!pair) {
    return;
  }

  const sources = (Array.isArray(req.body?.sources)
    ? req.body.sources.filter((s: unknown): s is string => typeof s === 'string')
    : typeof req.body?.source === 'string'
      ? [req.body.source]
      : []
  )
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);
  const destination = typeof req.body?.destination === 'string' ? req.body.destination : undefined;
  const ignore = typeof req.body?.ignore === 'string' ? req.body.ignore : undefined;
  const ignoreNames = parseIgnoreList(ignore);

  if (sources.length === 0) {
    res.status(400).json({ message: 'No sources selected' });
    return;
  }

  const result = moveItems(pair.source.path, pair.destination.path, sources, destination, ignoreNames);
  const message =
    result.message === 'Cannot copy into source' ? 'Cannot move into source' : result.message;

  if (message === 'No sources selected') {
    res.status(400).json({ ...result, message });
    return;
  }

  if (message === 'Incorrect path') {
    res.status(400).json({ ...result, message });
    return;
  }

  if (message === 'Source and destination cannot be the same') {
    res.status(400).json({ ...result, message });
    return;
  }

  if (message === 'Cannot move into source') {
    res.status(400).json({ ...result, message });
    return;
  }

  if (
    message === 'Source not found' ||
    message === 'Destination not found' ||
    message === 'Access denied to for such file type'
  ) {
    res.status(404).json({ ...result, message });
    return;
  }

  res.json({ ...result, message });
});

apiRouter.post('/zip/extract', (req: Request, res: Response) => {
  const pairId = typeof req.body?.pairId === 'string' ? req.body.pairId : undefined;
  const pair = resolvePairId(pairId, res);
  if (!pair) {
    return;
  }

  const file = typeof req.body?.file === 'string' ? req.body.file.trim() : '';
  if (!file) {
    res.status(400).json({ message: 'No zip file selected' });
    return;
  }

  const renameFolder =
    typeof req.body?.renameFolder === 'string' && req.body.renameFolder.trim()
      ? req.body.renameFolder.trim()
      : undefined;

  const result = extractZip(pair.source.path, file, renameFolder);

  if (
    result.message === 'No zip file selected' ||
    result.message === 'Incorrect path' ||
    result.message === 'Invalid folder name' ||
    result.message === 'Folder already exists'
  ) {
    res.status(400).json(result);
    return;
  }

  if (result.message === 'Not a zip file' || result.message === 'Invalid zip entry path') {
    res.status(400).json(result);
    return;
  }

  if (
    result.message === 'Source not found' ||
    result.message === 'Access denied to for such file type'
  ) {
    res.status(404).json(result);
    return;
  }

  res.json(result);
});

app.use('/api', apiRouter);
// To deploy in a subpath, use this route
// app.use('/viewer/api', apiRouter);

app.use('/', express.static(path.join(__dirname, 'public')));

app.all(/.*/, (_req, res) => {
  res.status(404).send('404 - Page Not Found');
});

export { app };

if (process.env.NODE_ENV !== 'test') {
  if (process.env.NODE_ENV === 'production') {
    app.listen();
  } else {
    const server = app.listen(PORT, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : PORT;
      console.log(`Server is running on http://localhost:${actualPort}`);
    });
  }
}
