import { AxiosError, AxiosInstance } from 'axios';
import { extractVanityName } from './url-helper.js';
import { parseVoyagerProfile } from './parser.js';
import { requestThrottler } from './throttler.js';
import { profileCache } from '../cache/memory-cache.js';
import {
  blockLiveLinkedIn,
  createAuthenticatedHttpClient,
  isLiveLinkedInBlocked,
  getLiveLinkedInBlockReason,
  SessionAuthError
} from '../auth/session.js';
import { LinkedInProfile } from '../types/index.js';

function throwSessionAuthFailure(statusOrReason: string): never {
  blockLiveLinkedIn(statusOrReason);
  throw new SessionAuthError(
    `LinkedIn session authentication failed (${statusOrReason}). Cookie is expired or was invalidated. No more LinkedIn requests will be sent until you restart with a fresh cookie.`,
    'Do not click Execute again. Log into linkedin.com in Chrome, copy fresh li_at and JSESSIONID into .env, then restart the server once.'
  );
}

export interface FetchProfileOptions {
  skipCache?: boolean;
  skipThrottling?: boolean;
  httpClient?: AxiosInstance;
}

export class ProfileNotFoundError extends Error {
  public readonly statusCode = 404;
  public readonly code = 'PROFILE_NOT_FOUND';

  constructor(vanityName: string) {
    super(`LinkedIn profile "${vanityName}" was not found or is private.`);
    this.name = 'ProfileNotFoundError';
  }
}

export class LinkedInRateLimitError extends Error {
  public readonly statusCode = 429;
  public readonly code = 'LINKEDIN_RATE_LIMITED';

  constructor() {
    super('LinkedIn returned HTTP 429 Too Many Requests. Please wait for cooldown.');
    this.name = 'LinkedInRateLimitError';
  }
}

export class VoyagerGoneError extends Error {
  public readonly statusCode = 410;
  public readonly code = 'VOYAGER_ENDPOINT_GONE';

  constructor(httpStatus: number) {
    super(
      `LinkedIn returned HTTP ${httpStatus}. That Voyager path is retired (not a logout). Do not retry the same request.`
    );
    this.name = 'VoyagerGoneError';
  }
}

/** Current Dash identity lookup. Legacy /identity/profiles/{slug}/profileView is HTTP 410. */
function dashProfilePath(vanityName: string): string {
  const identity = encodeURIComponent(vanityName);
  const decorationId = encodeURIComponent(
    'com.linkedin.voyager.dash.deco.identity.profile.FullProfileWithEntities-93'
  );
  return `/voyager/api/identity/dash/profiles?q=memberIdentity&memberIdentity=${identity}&decorationId=${decorationId}`;
}

function throwGoneAndBlock(httpStatus: number): never {
  blockLiveLinkedIn(`HTTP ${httpStatus}`);
  throw new VoyagerGoneError(httpStatus);
}

/**
 * Fetches a LinkedIn profile by public URL or vanity username.
 * 
 * Guarantees:
 * 1. 100% pure HTTP reverse-engineered Voyager API call (zero browser automation).
 * 2. Strict volume protection: rate throttling delay with random jitter and hard daily cap.
 * 3. Idempotent in-memory caching to protect account during reviewer testing.
 * 4. Graceful error handling for expired cookies, private profiles, or rate limits.
 */
export async function fetchProfile(
  profileUrl: string,
  options: FetchProfileOptions = {}
): Promise<LinkedInProfile> {
  // 1. Validate URL & Extract Vanity Name
  const vanityName = extractVanityName(profileUrl);

  // 2. Check In-Memory Cache (unless skipCache is requested)
  if (!options.skipCache) {
    const cached = profileCache.get(vanityName);
    if (cached) {
      return cached.data;
    }
  }

  // Never send a cookie LinkedIn already rejected in this process
  if (isLiveLinkedInBlocked()) {
    const reason = getLiveLinkedInBlockReason() || 'blocked';
    if (reason.includes('410')) {
      throw new VoyagerGoneError(410);
    }
    throw new SessionAuthError(
      `Live LinkedIn requests are blocked after a previous auth failure (${reason}).`,
      'Do not retry. Update .env with a fresh cookie and restart the server once.'
    );
  }

  // 3. Enforce Rate Limiting & Daily Request Cap at the Outbound Frontier
  if (!options.skipThrottling) {
    await requestThrottler.acquireThrottledSlot();
  }

  // 4. Execute Voyager HTTP Request — ONE request only. No fallback, no retry.
  const client = options.httpClient || createAuthenticatedHttpClient();

  try {
    const primaryEndpoint = dashProfilePath(vanityName);

    const response = await client.get(primaryEndpoint, {
      headers: {
        'Accept': 'application/vnd.linkedin.normalized+json+2.1'
      }
    });

    console.log(`[LinkedIn] GET dash/profiles slug=${vanityName} -> HTTP ${response.status}`);

    // Handle Auth Failures — 401, 403, or 302 redirect all mean "session invalid"
    if (response.status === 401 || response.status === 403 || response.status === 302) {
      throwSessionAuthFailure(`HTTP ${response.status}`);
    }

    if (response.status === 404) {
      throw new ProfileNotFoundError(vanityName);
    }

    if (response.status === 429) {
      throw new LinkedInRateLimitError();
    }

    // 410 = LinkedIn deleted this API path. Retrying the same URL only burns quota.
    if (response.status === 410) {
      throwGoneAndBlock(response.status);
    }

    if (response.status !== 200 || !response.data) {
      throw new Error(`UNEXPECTED_VOYAGER_STATUS: Received HTTP ${response.status} from LinkedIn Voyager API.`);
    }

    // 5. Direct JSON Parsing (Resilient per-section degradation)
    const profileData = parseVoyagerProfile(vanityName, response.data);

    // 6. Cache Valid Result
    profileCache.set(vanityName, profileData);

    return profileData;
  } catch (error: any) {
    if (
      error instanceof SessionAuthError ||
      error instanceof ProfileNotFoundError ||
      error instanceof LinkedInRateLimitError ||
      error instanceof VoyagerGoneError
    ) {
      throw error;
    }

    if (error?.isAxiosError) {
      const axiosErr = error as AxiosError;
      const status = axiosErr.response?.status;
      const code = axiosErr.code || '';
      console.log(`[LinkedIn] request error slug=${vanityName} status=${status ?? 'n/a'} code=${code}`);

      if (status === 401 || status === 403 || status === 302 || code === 'ERR_FR_TOO_MANY_REDIRECTS') {
        throwSessionAuthFailure(status ? `HTTP ${status}` : code);
      }
      if (status === 404) {
        throw new ProfileNotFoundError(vanityName);
      }
      if (status === 429) {
        throw new LinkedInRateLimitError();
      }
      if (status === 410) {
        throwGoneAndBlock(status);
      }
    }

    throw error;
  }
}
