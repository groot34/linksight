import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchProfile, ProfileNotFoundError, LinkedInRateLimitError } from './fetch-profile.js';
import { profileCache } from '../cache/memory-cache.js';
import { SessionAuthError } from '../auth/session.js';

describe('Scraper Module (fetchProfile)', () => {
  beforeEach(() => {
    profileCache.clear();
  });

  it('validates URL and extracts profile successfully with mock HTTP client', async () => {
    const mockHttpClient = {
      get: vi.fn().mockResolvedValue({
        status: 200,
        data: {
          included: [
            {
              $type: 'com.linkedin.voyager.dash.identity.profile.Profile',
              firstName: 'Satya',
              lastName: 'Nadella',
              headline: 'Chairman and CEO at Microsoft'
            }
          ]
        }
      })
    } as any;

    const profile = await fetchProfile('https://www.linkedin.com/in/satyanadella', {
      httpClient: mockHttpClient,
      skipThrottling: true
    });

    expect(profile.vanity_name).toBe('satyanadella');
    expect(profile.full_name).toBe('Satya Nadella');
    expect(profile.headline).toBe('Chairman and CEO at Microsoft');
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);

    // Second call should come directly from cache without hitting httpClient again
    const cachedProfile = await fetchProfile('satyanadella', {
      httpClient: mockHttpClient,
      skipThrottling: true
    });
    expect(cachedProfile.full_name).toBe('Satya Nadella');
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
  });

  it('throws SessionAuthError on 401 Unauthorized from Voyager API', async () => {
    const mockHttpClient = {
      get: vi.fn().mockResolvedValue({
        status: 401,
        data: { message: 'Unauthorized' }
      })
    } as any;

    await expect(
      fetchProfile('https://www.linkedin.com/in/williamhgates', {
        httpClient: mockHttpClient,
      skipThrottling: true
      })
    ).rejects.toThrow(SessionAuthError);
  });

  it('throws ProfileNotFoundError when profile is 404', async () => {
    const mockHttpClient = {
      get: vi.fn().mockResolvedValue({
        status: 404,
        data: { message: 'Not Found' }
      })
    } as any;

    await expect(
      fetchProfile('https://www.linkedin.com/in/nonexistentuser999888777', {
        httpClient: mockHttpClient,
      skipThrottling: true
      })
    ).rejects.toThrow(ProfileNotFoundError);
  });

  it('throws LinkedInRateLimitError when LinkedIn returns 429', async () => {
    const mockHttpClient = {
      get: vi.fn().mockResolvedValue({
        status: 429,
        data: { message: 'Too Many Requests' }
      })
    } as any;

    await expect(
      fetchProfile('https://www.linkedin.com/in/williamhgates', {
        httpClient: mockHttpClient,
        skipThrottling: true
      })
    ).rejects.toThrow(LinkedInRateLimitError);
  });
});
