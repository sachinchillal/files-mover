import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app } from '../../src/index';
import { API_BASE_URL, DESTINATION_TEST_DIR, SOURCE_TEST_DIR } from '../data/constants';
import { TEST_PAIR_ID, TEST_SETTINGS_PATH, writeTestSettings } from '../utils/settings';

describe(`Settings API ${API_BASE_URL}settings`, () => {
  beforeEach(() => {
    fs.rmSync(SOURCE_TEST_DIR, { recursive: true, force: true });
    fs.rmSync(DESTINATION_TEST_DIR, { recursive: true, force: true });
    fs.mkdirSync(SOURCE_TEST_DIR, { recursive: true });
    fs.mkdirSync(DESTINATION_TEST_DIR, { recursive: true });
    fs.mkdirSync(path.dirname(TEST_SETTINGS_PATH), { recursive: true });
    if (fs.existsSync(TEST_SETTINGS_PATH)) {
      fs.rmSync(TEST_SETTINGS_PATH, { force: true });
    }
    process.env.SETTINGS_PATH = TEST_SETTINGS_PATH;
  });

  it('lists directory pairs', async () => {
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR);

    const res = await request(app).get(`${API_BASE_URL}settings`);

    expect(res.status).toBe(200);
    expect(res.body.directories).toEqual([
      {
        id: TEST_PAIR_ID,
        source: path.resolve(SOURCE_TEST_DIR),
        destination: path.resolve(DESTINATION_TEST_DIR),
      },
    ]);
  });

  it('creates a directory pair', async () => {
    const res = await request(app)
      .post(`${API_BASE_URL}settings/directories`)
      .send({ source: SOURCE_TEST_DIR, destination: DESTINATION_TEST_DIR });

    expect(res.status).toBe(201);
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.source).toBe(path.resolve(SOURCE_TEST_DIR));
    expect(res.body.destination).toBe(path.resolve(DESTINATION_TEST_DIR));

    const saved = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf8'));
    expect(saved.directories).toHaveLength(1);
  });

  it('updates a directory pair', async () => {
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR);
    const updatedDest = path.join(DESTINATION_TEST_DIR, 'updated');
    fs.mkdirSync(updatedDest, { recursive: true });

    const res = await request(app)
      .put(`${API_BASE_URL}settings/directories/${TEST_PAIR_ID}`)
      .send({ source: SOURCE_TEST_DIR, destination: updatedDest });

    expect(res.status).toBe(200);
    expect(res.body.destination).toBe(path.resolve(updatedDest));
  });

  it('deletes a directory pair', async () => {
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR);

    const res = await request(app).delete(`${API_BASE_URL}settings/directories/${TEST_PAIR_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(TEST_PAIR_ID);

    const list = await request(app).get(`${API_BASE_URL}settings`);
    expect(list.body.directories).toEqual([]);
  });

  it('returns 400 when paths are invalid on create', async () => {
    const res = await request(app)
      .post(`${API_BASE_URL}settings/directories`)
      .send({ source: '/missing/source', destination: DESTINATION_TEST_DIR });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Source path does not exist');
  });

  it('returns 404 when updating a missing pair', async () => {
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR);

    const res = await request(app)
      .put(`${API_BASE_URL}settings/directories/missing-id`)
      .send({ source: SOURCE_TEST_DIR, destination: DESTINATION_TEST_DIR });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Directory pair not found');
  });
});
