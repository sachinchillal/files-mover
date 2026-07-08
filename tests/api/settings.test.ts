import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { app } from '../../src/index';
import { API_BASE_URL, DESTINATION_TEST_DIR, SOURCE_TEST_DIR } from '../data/constants';
import {
  TEST_PAIR_ID,
  TEST_PAIR_TITLE,
  TEST_SETTINGS_PATH,
  makeLocation,
  writeTestSettings,
} from '../utils/settings';

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
        title: TEST_PAIR_TITLE,
        source: makeLocation(SOURCE_TEST_DIR),
        destination: makeLocation(DESTINATION_TEST_DIR),
        createdAt: expect.any(Number),
        updatedAt: expect.any(Number),
      },
    ]);
  });

  it('creates a directory pair', async () => {
    const res = await request(app)
      .post(`${API_BASE_URL}settings/directories`)
      .send({
        title: TEST_PAIR_TITLE,
        source: makeLocation(SOURCE_TEST_DIR),
        destination: makeLocation(DESTINATION_TEST_DIR),
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toEqual(expect.any(String));
    expect(res.body.title).toBe(TEST_PAIR_TITLE);
    expect(res.body.source).toEqual(makeLocation(SOURCE_TEST_DIR));
    expect(res.body.destination).toEqual(makeLocation(DESTINATION_TEST_DIR));
    expect(res.body.createdAt).toEqual(expect.any(Number));
    expect(res.body.updatedAt).toEqual(res.body.createdAt);

    const saved = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf8'));
    expect(saved.directories).toHaveLength(1);
  });

  it('updates a directory pair', async () => {
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR);
    const updatedDest = path.join(DESTINATION_TEST_DIR, 'updated');
    fs.mkdirSync(updatedDest, { recursive: true });

    const before = await request(app).get(`${API_BASE_URL}settings`);
    const createdAt = before.body.directories[0].createdAt;

    const res = await request(app)
      .put(`${API_BASE_URL}settings/directories/${TEST_PAIR_ID}`)
      .send({
        title: 'Updated title',
        source: makeLocation(SOURCE_TEST_DIR),
        destination: makeLocation(updatedDest),
      });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated title');
    expect(res.body.destination.path).toBe(path.resolve(updatedDest));
    expect(res.body.createdAt).toBe(createdAt);
    expect(res.body.updatedAt).toBeGreaterThanOrEqual(createdAt);
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
      .send({
        title: TEST_PAIR_TITLE,
        source: makeLocation('/missing/source'),
        destination: makeLocation(DESTINATION_TEST_DIR),
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Source path does not exist');
  });

  it('returns 400 when title is missing on create', async () => {
    const res = await request(app)
      .post(`${API_BASE_URL}settings/directories`)
      .send({
        title: '   ',
        source: makeLocation(SOURCE_TEST_DIR),
        destination: makeLocation(DESTINATION_TEST_DIR),
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Title is required');
  });

  it('returns 404 when updating a missing pair', async () => {
    writeTestSettings(SOURCE_TEST_DIR, DESTINATION_TEST_DIR);

    const res = await request(app)
      .put(`${API_BASE_URL}settings/directories/missing-id`)
      .send({
        title: TEST_PAIR_TITLE,
        source: makeLocation(SOURCE_TEST_DIR),
        destination: makeLocation(DESTINATION_TEST_DIR),
      });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe('Directory pair not found');
  });

  it('migrates legacy string source/destination to objects on read', async () => {
    const now = Date.now();
    const legacy = {
      directories: [
        {
          id: TEST_PAIR_ID,
          title: TEST_PAIR_TITLE,
          source: path.resolve(SOURCE_TEST_DIR),
          destination: path.resolve(DESTINATION_TEST_DIR),
          createdAt: now,
          updatedAt: now,
        },
      ],
    };
    fs.writeFileSync(TEST_SETTINGS_PATH, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8');

    const res = await request(app).get(`${API_BASE_URL}settings`);

    expect(res.status).toBe(200);
    expect(res.body.directories[0].source).toEqual(makeLocation(SOURCE_TEST_DIR));
    expect(res.body.directories[0].destination).toEqual(makeLocation(DESTINATION_TEST_DIR));

    const saved = JSON.parse(fs.readFileSync(TEST_SETTINGS_PATH, 'utf8'));
    expect(saved.directories[0].source).toEqual(makeLocation(SOURCE_TEST_DIR));
    expect(saved.directories[0].destination).toEqual(makeLocation(DESTINATION_TEST_DIR));
  });
});
