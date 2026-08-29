import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchProfile, ProfileNotFoundError, LinkedInRateLimitError, VoyagerGoneError } from './fetch-profile.js';
import { profileCache } from '../cache/memory-cache.js';
import { resetLiveLinkedInBlockForTests, SessionAuthError } from '../auth/session.js';

describe('Scraper Module (fetchProfile)', () => {
  beforeEach(() => {
    profileCache.clear();
    resetLiveLinkedInBlockForTests();
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

    expect(profile.profileUrl).toBe('https://www.linkedin.com/in/satyanadella');
    expect(profile.name).toBe('Satya Nadella');
    expect(profile.headline).toBe('Chairman and CEO at Microsoft');
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
    expect(String(mockHttpClient.get.mock.calls[0][0])).toContain('/voyager/api/identity/dash/profiles');
    expect(String(mockHttpClient.get.mock.calls[0][0])).not.toContain('/profileView');

    // Second call should come directly from cache without hitting httpClient again
    const cachedProfile = await fetchProfile('satyanadella', {
      httpClient: mockHttpClient,
      skipThrottling: true
    });
    expect(cachedProfile.name).toBe('Satya Nadella');
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
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);

    // Second attempt must not hit LinkedIn again
    await expect(
      fetchProfile('https://www.linkedin.com/in/williamhgates', {
        httpClient: mockHttpClient,
        skipThrottling: true
      })
    ).rejects.toThrow(SessionAuthError);
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
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
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
  });

  it('does not fire a second LinkedIn request on HTTP 500', async () => {
    const mockHttpClient = {
      get: vi.fn().mockResolvedValue({
        status: 500,
        data: { message: 'Internal Server Error' }
      })
    } as any;

    await expect(
      fetchProfile('https://www.linkedin.com/in/williamhgates', {
        httpClient: mockHttpClient,
        skipThrottling: true
      })
    ).rejects.toThrow(/UNEXPECTED_VOYAGER_STATUS/);
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
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

  it('treats HTTP 410 as gone and does not retry LinkedIn', async () => {
    const mockHttpClient = {
      get: vi.fn().mockResolvedValue({
        status: 410,
        data: { status: 410 }
      })
    } as any;

    await expect(
      fetchProfile('https://www.linkedin.com/in/williamhgates', {
        httpClient: mockHttpClient,
        skipThrottling: true
      })
    ).rejects.toThrow(VoyagerGoneError);
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);

    await expect(
      fetchProfile('https://www.linkedin.com/in/williamhgates', {
        httpClient: mockHttpClient,
        skipThrottling: true
      })
    ).rejects.toThrow(VoyagerGoneError);
    expect(mockHttpClient.get).toHaveBeenCalledTimes(1);
  });
});
