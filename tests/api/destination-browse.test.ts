import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app } from '../../src/index';
import { API_BASE_URL, DESTINATION_TEST_DIR, SOURCE_TEST_DIR } from '../data/constants';
import { withPairQuery, writeTestSettings } from '../utils/settings';

describe(`GET ${API_BASE_URL}destination/browse`, () => {
  const sampleFolder = 'dest-sample';

  beforeEach(() => {
    fs.rmSync(DESTINATION_TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(DESTINATION_TEST_DIR, { recursive: true });
    fs.mkdirSync(SOURCE_TEST_DIR, { recursive: true });
    const folderPath = path.join(DESTINATION_TEST_DIR, sampleFolder);
    fs.mkdirSync(folderPath, { recursive: true });
    fs.writeFileSync(path.join(folderPath, 'readme.md'), '# readme\n', 'utf8');
    fs.writeFileSync(path.join(DESTINATION_TEST_DIR, 'notes.txt'), 'notes\n', 'utf8');
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR);
  });

  it('responds with status 200 at root', async () => {
    const res = await request(app).get(withPairQuery(`${API_BASE_URL}destination/browse`));

    expect(res.status).toBe(200);
    expect(res.body.path).toBe('');
    expect(res.body.selection).toEqual([]);
    expect(res.body.entries).toEqual(
      expect.arrayContaining([{ name: sampleFolder, type: 'directory' }])
    );
  });

  it('lists files in a nested directory', async () => {
    const res = await request(app).get(
      withPairQuery(`${API_BASE_URL}destination/browse?root=${sampleFolder}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.path).toBe(sampleFolder);
    expect(res.body.selection).toEqual([]);
    expect(res.body.entries).toEqual(
      expect.arrayContaining([{ name: 'readme.md', type: 'file' }])
    );
  });

  it('shows only whitelisted names when whitelist is configured', async () => {
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR, undefined, undefined, {
      destinationFilters: { whitelist: [sampleFolder] },
    });

    const res = await request(app).get(withPairQuery(`${API_BASE_URL}destination/browse`));

    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([{ name: sampleFolder, type: 'directory' }]);
    expect(res.body.selection).toEqual([]);
  });

  it('hides blacklisted names from settings', async () => {
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR, undefined, undefined, {
      destinationFilters: { blacklist: [sampleFolder] },
    });

    const res = await request(app).get(withPairQuery(`${API_BASE_URL}destination/browse`));

    expect(res.status).toBe(200);
    const names = res.body.entries.map((e: { name: string }) => e.name);
    expect(names).not.toContain(sampleFolder);
    expect(res.body.selection).toEqual([]);
  });

  it('returns explicit selection paths from settings', async () => {
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR, undefined, undefined, {
      destinationFilters: { selection: [sampleFolder] },
    });

    const res = await request(app).get(withPairQuery(`${API_BASE_URL}destination/browse`));

    expect(res.status).toBe(200);
    expect(res.body.selection).toEqual([sampleFolder]);
  });

  it('selects current folder when selection contains * inside a directory', async () => {
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR, undefined, undefined, {
      destinationFilters: { selection: ['*'] },
    });

    const res = await request(app).get(
      withPairQuery(`${API_BASE_URL}destination/browse?root=${sampleFolder}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.selection).toEqual([sampleFolder]);
  });

  it('returns 400 for path traversal with ..', async () => {
    const res = await request(app).get(
      withPairQuery(`${API_BASE_URL}destination/browse?root=${sampleFolder}/../../`)
    );

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Incorrect path');
  });

  it('returns 404 when directory does not exist', async () => {
    const res = await request(app).get(
      withPairQuery(`${API_BASE_URL}destination/browse?root=missing-folder`)
    );

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Directory not found');
  });

  it('returns 400 when pairId is missing', async () => {
    const res = await request(app).get(`${API_BASE_URL}destination/browse`);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('pairId is required');
  });
});
