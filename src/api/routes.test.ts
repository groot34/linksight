import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { profileCache } from '../cache/memory-cache.js';
import { config } from '../config.js';
import { LinkedInProfile } from '../types/index.js';

describe('API Routes (Phase 5)', () => {
  let app: FastifyInstance;
  let originalApiKey: string;

  const mockProfile: LinkedInProfile = {
    profileUrl: 'https://www.linkedin.com/in/satyanadella',
    name: 'Satya Nadella',
    headline: 'Chairman and CEO at Microsoft',
    location: 'Redmond, Washington, United States',
    about: 'Leading Microsoft',
    profileImageUrl: 'https://media.licdn.com/dms/image/satya.jpg',
    bannerImageUrl: null,
    experience: [
      {
        title: 'CEO',
        company: 'Microsoft',
        location: 'Redmond, WA',
        startDate: '2014-02',
        endDate: null,
        description: 'Chief Executive Officer'
      }
    ],
    education: [
      {
        school: 'University of Chicago Booth School of Business',
        degree: 'MBA',
        field: 'Business Administration',
        startDate: '1995',
        endDate: '1997'
      }
    ],
    skills: ['Cloud Computing', 'Leadership'],
    certifications: [],
    languages: [{ language: 'English', proficiency: 'Native' }],
    scrapedAt: new Date().toISOString()
  };

  beforeAll(async () => {
    originalApiKey = config.apiKey;
    config.apiKey = '';
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    config.apiKey = originalApiKey;
    await app.close();
  });

  beforeEach(() => {
    profileCache.clear();
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

  it('POST /api/profile returns 200 and cached profile data when in cache', async () => {
    profileCache.set('satyanadella', mockProfile);

    const response = await app.inject({
      method: 'POST',
      url: '/api/profile',
      payload: {
        profileUrl: 'https://www.linkedin.com/in/satyanadella'
      }
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.success).toBe(true);
    expect(json.data.name).toBe('Satya Nadella');
    expect(json.data.profileUrl).toBe('https://www.linkedin.com/in/satyanadella');
    expect(json.data.experience.length).toBe(1);
    expect(json.data.education[0].school).toBe('University of Chicago Booth School of Business');
    expect(json.meta.cached).toBe(true);
  });

  it('POST /api/profile returns 400 when profileUrl is missing or invalid', async () => {
    const resEmpty = await app.inject({
      method: 'POST',
      url: '/api/profile',
      payload: {}
    });
    expect(resEmpty.statusCode).toBe(400);

    const resInvalid = await app.inject({
      method: 'POST',
      url: '/api/profile',
      payload: { profileUrl: 'https://google.com/invalid' }
    });
    expect(resInvalid.statusCode).toBe(400);
    const json = JSON.parse(resInvalid.payload);
    expect(json.code).toBe('INVALID_URL');
  });

  it('GET /api/profile?url=... works as a convenience query endpoint', async () => {
    profileCache.set('satyanadella', mockProfile);

    const response = await app.inject({
      method: 'GET',
      url: '/api/profile?url=https://www.linkedin.com/in/satyanadella'
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.data.name).toBe('Satya Nadella');
  });

  it('verifies x-api-key access control when API_KEY is configured', async () => {
    const originalApiKey = config.apiKey;
    config.apiKey = 'test-secret-key-123';

    // 1. Without header -> 401
    const resMissing = await app.inject({
      method: 'POST',
      url: '/api/profile',
      payload: { profileUrl: 'https://www.linkedin.com/in/satyanadella' }
    });
    expect(resMissing.statusCode).toBe(401);
    expect(JSON.parse(resMissing.payload).code).toBe('INVALID_API_KEY');

    // 2. With wrong header -> 401
    const resWrong = await app.inject({
      method: 'POST',
      url: '/api/profile',
      headers: { 'x-api-key': 'wrong-key' },
      payload: { profileUrl: 'https://www.linkedin.com/in/satyanadella' }
    });
    expect(resWrong.statusCode).toBe(401);

    // 3. With correct header -> 200 (cached)
    profileCache.set('satyanadella', mockProfile);
    const resValid = await app.inject({
      method: 'POST',
      url: '/api/profile',
      headers: { 'x-api-key': 'test-secret-key-123' },
      payload: { profileUrl: 'https://www.linkedin.com/in/satyanadella' }
    });
    expect(resValid.statusCode).toBe(200);

    config.apiKey = originalApiKey;
  });
});
