import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app } from '../../src/index';
import { browseDestinationTree, browseSourceTree } from '../../src/fs/browse';
import { API_BASE_URL, DESTINATION_TEST_DIR, SOURCE_TEST_DIR } from '../data/constants';
import { withPairBody, writeTestSettings } from '../utils/settings';

const mkdirp = (dirPath: string): void => {
  fs.mkdirSync(dirPath, { recursive: true });
};

const writeFile = (filePath: string, content = 'content'): void => {
  fs.writeFileSync(filePath, content, 'utf8');
};

const resetDir = (dirPath: string): void => {
  fs.rmSync(dirPath, { recursive: true, force: true });
  fs.mkdirSync(dirPath, { recursive: true });
};

const createSourceFixture = (): void => {
  resetDir(SOURCE_TEST_DIR);
  resetDir(DESTINATION_TEST_DIR);
  mkdirp(path.join(DESTINATION_TEST_DIR, 'backups'));

  writeFile(path.join(SOURCE_TEST_DIR, 'readme.md'), '# readme\n');
  writeFile(path.join(SOURCE_TEST_DIR, 'license.txt'), 'license\n');
  writeFile(path.join(SOURCE_TEST_DIR, 'invalid-file-type.lock'), 'lock\n');

  mkdirp(path.join(SOURCE_TEST_DIR, 'projects/app/src'));
  mkdirp(path.join(SOURCE_TEST_DIR, 'projects/app/node_modules/pkg'));
  mkdirp(path.join(SOURCE_TEST_DIR, 'projects/app/.git'));
  mkdirp(path.join(SOURCE_TEST_DIR, 'projects/docs'));
  mkdirp(path.join(SOURCE_TEST_DIR, 'backups'));

  writeFile(path.join(SOURCE_TEST_DIR, 'projects/app/package.json'), '{}');
  writeFile(path.join(SOURCE_TEST_DIR, 'projects/app/readme.md'));
  writeFile(path.join(SOURCE_TEST_DIR, 'projects/app/src/index.ts'));
  writeFile(path.join(SOURCE_TEST_DIR, 'projects/app/node_modules/pkg/index.js'));
  writeFile(path.join(SOURCE_TEST_DIR, 'projects/app/.git/HEAD'));
  writeFile(path.join(SOURCE_TEST_DIR, 'projects/docs/guide.md'));
  writeFile(path.join(SOURCE_TEST_DIR, 'backups/notes.txt'));
};

describe(`POST ${API_BASE_URL}move`, () => {
  beforeEach(() => {
    createSourceFixture();
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR);
  });

  it('moves source folder into destination and removes it from source', async () => {
    const res = await request(app)
      .post(`${API_BASE_URL}move`)
      .send(withPairBody({ source: 'projects/app', destination: 'backups' }));

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('');
    expect(res.body.source).toBe('projects/app');
    expect(res.body.sources).toEqual(['projects/app']);
    expect(res.body.destination).toBe('backups');
    expect(res.body.movedFiles).toBeGreaterThan(0);
    expect(res.body.movedDirectories).toBeGreaterThan(0);

    expect(fs.existsSync(path.join(DESTINATION_TEST_DIR, 'backups/app/package.json'))).toBe(true);
    expect(fs.existsSync(path.join(SOURCE_TEST_DIR, 'projects/app'))).toBe(false);

    const sourceBrowse = browseSourceTree(SOURCE_TEST_DIR, 'projects', {
      whitelist: [],
      blacklist: [],
      selection: [],
      ignoreNames: new Set(),
    });
    expect(sourceBrowse.entries.map((e) => e.name)).toEqual(['docs']);
  });

  it('skips ignored directories during move', async () => {
    const res = await request(app)
      .post(`${API_BASE_URL}move`)
      .send(
        withPairBody({
          source: 'projects/app',
          destination: 'backups',
          ignore: 'node_modules,.git',
        })
      );

    expect(res.status).toBe(200);
    expect(res.body.skipped).toEqual(
      expect.arrayContaining(['projects/app/node_modules', 'projects/app/.git'])
    );

    expect(fs.existsSync(path.join(DESTINATION_TEST_DIR, 'backups/app/node_modules'))).toBe(false);
    expect(fs.existsSync(path.join(SOURCE_TEST_DIR, 'projects/app'))).toBe(false);
  });

  it('returns 404 when source is missing', async () => {
    const res = await request(app)
      .post(`${API_BASE_URL}move`)
      .send(withPairBody({ source: 'missing/path', destination: 'backups' }));

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Source not found');
  });

  it('returns 400 when destination is under source within the same root', async () => {
    const sharedRoot = path.join(SOURCE_TEST_DIR, 'shared-root');
    resetDir(sharedRoot);
    mkdirp(path.join(sharedRoot, 'projects/app'));
    writeFile(path.join(sharedRoot, 'projects/app/readme.md'));
    writeTestSettings(sharedRoot, sharedRoot);

    const res = await request(app)
      .post(`${API_BASE_URL}move`)
      .send(withPairBody({ source: 'projects', destination: 'projects/app' }));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Cannot move into source');
  });

  it('moves a single file into destination folder', async () => {
    const res = await request(app)
      .post(`${API_BASE_URL}move`)
      .send(withPairBody({ sources: ['projects/app/readme.md'], destination: 'backups' }));

    expect(res.status).toBe(200);
    expect(res.body.movedFiles).toBe(1);
    expect(res.body.movedDirectories).toBe(0);

    expect(fs.existsSync(path.join(DESTINATION_TEST_DIR, 'backups/readme.md'))).toBe(true);
    expect(fs.existsSync(path.join(SOURCE_TEST_DIR, 'projects/app/readme.md'))).toBe(false);
  });

  it('moves multiple source folders into destination', async () => {
    const res = await request(app)
      .post(`${API_BASE_URL}move`)
      .send(withPairBody({ sources: ['projects/app', 'projects/docs'], destination: 'backups' }));

    expect(res.status).toBe(200);
    expect(res.body.sources).toEqual(['projects/app', 'projects/docs']);
    expect(res.body.movedFiles).toBeGreaterThan(0);

    expect(fs.existsSync(path.join(DESTINATION_TEST_DIR, 'backups/app/src/index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(DESTINATION_TEST_DIR, 'backups/docs/guide.md'))).toBe(true);
    expect(fs.existsSync(path.join(SOURCE_TEST_DIR, 'projects/app'))).toBe(false);
    expect(fs.existsSync(path.join(SOURCE_TEST_DIR, 'projects/docs'))).toBe(false);

    const destBrowse = browseDestinationTree(DESTINATION_TEST_DIR, 'backups', {
      whitelist: [],
      blacklist: [],
      selection: [],
      ignoreNames: new Set(),
    });
    expect(destBrowse.entries.map((e) => e.name).sort()).toEqual(['app', 'docs']);
  });
});
