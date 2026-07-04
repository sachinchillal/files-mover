import request from 'supertest';
import { app } from '../../src/index';
import { API_BASE_URL } from '../data/constants';

describe(`GET ${API_BASE_URL}ping`, () => {
  it('responds with status 200', async () => {
    const res = await request(app).get(`${API_BASE_URL}ping`);

    expect(res.status).toBe(200);
  });

  it('responds with JSON content-type', async () => {
    const res = await request(app).get(`${API_BASE_URL}ping`);

    expect(res.headers['content-type']).toMatch(/application\/json/);
  });

  it('returns { message: "pong" }', async () => {
    const res = await request(app).get(`${API_BASE_URL}ping`);

    expect(res.body).toEqual({ message: 'pong' });
  });
});
