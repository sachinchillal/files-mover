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
import { parseIgnoreList } from './path/ignore';
import {
  SettingsValidationError,
  addPair,
  deletePair,
  getPairById,
  listPairs,
  updatePair,
} from './settings/store';
import type { BrowseResult } from './types';

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


apiRouter.get('/settings', (_req: Request, res: Response) => {
  res.json({ directories: listPairs() });
});

apiRouter.post('/settings/directories', (req: Request, res: Response) => {
  const source = typeof req.body?.source === 'string' ? req.body.source : '';
  const destination = typeof req.body?.destination === 'string' ? req.body.destination : '';

  try {
    const pair = addPair(source, destination);
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
  const source = typeof req.body?.source === 'string' ? req.body.source : '';
  const destination = typeof req.body?.destination === 'string' ? req.body.destination : '';

  try {
    const pair = updatePair(id, source, destination);
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
  const ignoreNames = parseIgnoreList(ignore);

  sendBrowseResponse(res, browseSourceTree(pair.source, root, ignoreNames));
});

apiRouter.get('/destination/browse', (req: Request, res: Response) => {
  const pairId = typeof req.query.pairId === 'string' ? req.query.pairId : undefined;
  const pair = resolvePairId(pairId, res);
  if (!pair) {
    return;
  }

  const root = typeof req.query.root === 'string' ? req.query.root : undefined;
  const ignore = typeof req.query.ignore === 'string' ? req.query.ignore : undefined;
  const ignoreNames = parseIgnoreList(ignore);

  sendBrowseResponse(res, browseDestinationTree(pair.destination, root, ignoreNames));
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

  const result = copyItems(pair.source, pair.destination, sources, destination, ignoreNames);

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
