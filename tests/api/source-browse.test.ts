import request from 'supertest';
import fs from 'fs';
import { app } from '../../src/index';
import { createTestDataDirectories } from '../utils/app';
import { TestDataDirectories } from '../data/directories.data';
import { API_BASE_URL, SOURCE_TEST_DIR, DESTINATION_TEST_DIR } from '../data/constants';
import { withPairQuery, writeTestSettings } from '../utils/settings';

describe(`GET ${API_BASE_URL}source/browse`, () => {
  beforeEach(() => {
    fs.rmSync(SOURCE_TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(SOURCE_TEST_DIR, { recursive: true });
    fs.mkdirSync(DESTINATION_TEST_DIR, { recursive: true });
    createTestDataDirectories(TestDataDirectories);
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR);
  });

  it('responds with status 200 at root', async () => {
    const res = await request(app).get(withPairQuery(`${API_BASE_URL}source/browse`));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body.path).toBe('');
    expect(res.body.parent).toBe('');
    expect(res.body.message).toBe('');
    expect(res.body.selection).toEqual([]);
    expect(res.body.entries).toEqual(
      expect.arrayContaining([
        { name: TestDataDirectories.folder, type: 'directory' },
      ])
    );
  });

  it('lists files and folders in a nested directory', async () => {
    const root = TestDataDirectories.folder;
    const res = await request(app).get(withPairQuery(`${API_BASE_URL}source/browse?root=${root}`));

    const dirNames = TestDataDirectories.children.map((child) => child.folder);
    const fileNames = TestDataDirectories.files;

    expect(res.status).toBe(200);
    expect(res.body.path).toBe(root);
    expect(res.body.parent).toBe('');
    expect(res.body.message).toBe('');
    expect(res.body.selection).toEqual([]);
    expect(res.body.entries).toEqual(
      expect.arrayContaining([
        ...dirNames.map((name) => ({ name, type: 'directory' })),
        ...fileNames.map((name) => ({ name, type: 'file' })),
      ])
    );
  });

  it('hides ignored directory names', async () => {
    const root = TestDataDirectories.folder;
    const ignored = TestDataDirectories.children[0].folder;
    const res = await request(app).get(
      withPairQuery(`${API_BASE_URL}source/browse?root=${root}&ignore=${ignored}`)
    );

    expect(res.status).toBe(200);
    const names = res.body.entries.map((e: { name: string }) => e.name);
    expect(names).not.toContain(ignored);
    expect(res.body.selection).toEqual([]);
  });

  it('shows only whitelisted names when whitelist is configured', async () => {
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR, undefined, undefined, {
      sourceFilters: { whitelist: [TestDataDirectories.files[0]] },
    });

    const res = await request(app).get(
      withPairQuery(`${API_BASE_URL}source/browse?root=${TestDataDirectories.folder}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.entries).toEqual([{ name: TestDataDirectories.files[0], type: 'file' }]);
    expect(res.body.selection).toEqual([]);
  });

  it('hides blacklisted names from settings', async () => {
    const blocked = TestDataDirectories.files[0];
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR, undefined, undefined, {
      sourceFilters: { blacklist: [blocked] },
    });

    const res = await request(app).get(
      withPairQuery(`${API_BASE_URL}source/browse?root=${TestDataDirectories.folder}`)
    );

    expect(res.status).toBe(200);
    const names = res.body.entries.map((e: { name: string }) => e.name);
    expect(names).not.toContain(blocked);
    expect(res.body.selection).toEqual([]);
  });

  it('returns explicit selection paths from settings', async () => {
    const selectedFile = TestDataDirectories.files[0];
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR, undefined, undefined, {
      sourceFilters: { selection: [selectedFile] },
    });

    const res = await request(app).get(
      withPairQuery(`${API_BASE_URL}source/browse?root=${TestDataDirectories.folder}`)
    );

    expect(res.status).toBe(200);
    expect(res.body.selection).toEqual([`${TestDataDirectories.folder}/${selectedFile}`]);
  });

  it('returns all visible entry paths when selection contains *', async () => {
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR, undefined, undefined, {
      sourceFilters: { selection: ['*'] },
    });

    const res = await request(app).get(withPairQuery(`${API_BASE_URL}source/browse`));

    expect(res.status).toBe(200);
    expect(res.body.selection).toEqual([TestDataDirectories.folder]);
  });

  it('returns 400 for path traversal with ..', async () => {
    const root = `${TestDataDirectories.folder}/../../`;
    const res = await request(app).get(withPairQuery(`${API_BASE_URL}source/browse?root=${root}`));

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Incorrect path');
  });

  it('returns 404 when directory does not exist', async () => {
    const res = await request(app).get(
      withPairQuery(`${API_BASE_URL}source/browse?root=invalid-path`)
    );

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Directory not found');
  });

  it('returns 404 for denied file types', async () => {
    const root = `${TestDataDirectories.folder}/invalid-file-type.lock`;
    const res = await request(app).get(withPairQuery(`${API_BASE_URL}source/browse?root=${root}`));

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Access denied to for such file type');
  });

  it('returns 400 when pairId is missing', async () => {
    const res = await request(app).get(`${API_BASE_URL}source/browse`);

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('pairId is required');
  });

  it('returns 404 when directory pair is not found', async () => {
    const res = await request(app).get(
      `${API_BASE_URL}source/browse?pairId=missing-pair-id`
    );

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Directory pair not found');
  });
});
