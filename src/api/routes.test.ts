import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';

describe('API Routes', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns 200 with status and quota info', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health'
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json).toHaveProperty('status');
    expect(json).toHaveProperty('uptime_seconds');
    expect(json).toHaveProperty('version', '1.0.0');
    expect(json).toHaveProperty('daily_quota');
    expect(json.daily_quota).toHaveProperty('cap');
    expect(json.daily_quota).toHaveProperty('remaining');
    expect(json.daily_quota).toHaveProperty('used_today');
    expect(json).toHaveProperty('cache_stats');
  });

  it('GET / redirects to /docs', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/'
    });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe('/docs');
  });
});
