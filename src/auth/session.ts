import axios, { AxiosInstance } from 'axios';
import { config } from '../config.js';
import { ApiErrorResponse } from '../types/index.js';

/** Once LinkedIn rejects the cookie, do not send it again until process restart. */
let liveLinkedInBlocked = false;
let liveLinkedInBlockReason = '';

export function isLiveLinkedInBlocked(): boolean {
  return liveLinkedInBlocked;
}

export function blockLiveLinkedIn(reason: string): void {
  liveLinkedInBlocked = true;
  liveLinkedInBlockReason = reason;
  console.warn(`🛑 [SAFETY] Live LinkedIn requests blocked for this process: ${reason}`);
  console.warn('   No further outbound LinkedIn calls will be made until you restart the server with a fresh cookie.');
}

export function getLiveLinkedInBlockReason(): string {
  return liveLinkedInBlockReason;
}

/** Test-only: clear the process-level block. */
export function resetLiveLinkedInBlockForTests(): void {
  liveLinkedInBlocked = false;
  liveLinkedInBlockReason = '';
}

export interface AuthenticatedHttpClients {
  axiosInstance: AxiosInstance;
  headers: Record<string, string>;
}

export interface AuthValidationResult {
  valid: boolean;
  username?: string | null;
  error?: string | null;
}

export class SessionAuthError extends Error {
  public readonly statusCode: number = 401;
  public readonly code: string = 'SESSION_EXPIRED_OR_INVALID';
  public readonly manualAction: string;

  constructor(
    message = 'LinkedIn session cookie (li_at / JSESSIONID) is missing, expired, or invalid.',
    manualAction = 'Log into linkedin.com in your browser, open DevTools -> Application -> Cookies -> https://www.linkedin.com, copy the fresh "li_at" (and "JSESSIONID") value into your .env file (LI_AT_COOKIE / LI_JSESSIONID), and restart the application.'
  ) {
    super(message);
    this.name = 'SessionAuthError';
    this.manualAction = manualAction;
  }

  public toResponse(): ApiErrorResponse {
    return {
      statusCode: this.statusCode,
      error: 'Unauthorized',
      code: this.code,
      message: this.message,
      manual_action_required: this.manualAction
    };
  }
}

/**
 * Validates that LI_AT_COOKIE is present and non-trivial.
 * Hard rule: Never falls back to any automated login attempt.
 */
export function assertSessionConfigured(): void {
  if (!config.liAtCookie || config.liAtCookie.trim().length < 10) {
    throw new SessionAuthError(
      'Missing or invalid LI_AT_COOKIE environment variable. Automatic login is prohibited by policy.',
      '1. Open linkedin.com in your browser and ensure you are logged in.\n' +
      '2. Open DevTools (F12) -> Application -> Storage -> Cookies -> https://www.linkedin.com\n' +
      '3. Copy the value of "li_at" and paste it into your .env file as LI_AT_COOKIE=your_cookie_here\n' +
      '4. Copy "JSESSIONID" and paste it as LI_JSESSIONID="ajax:your_jsessionid_here"\n' +
      '5. Restart the server.'
    );
  }
}

export function isSessionConfigured(): boolean {
  return Boolean(config.liAtCookie && config.liAtCookie.trim().length >= 10);
}

/**
 * Builds HTTP headers mimicking a standard logged-in browser session for Voyager API calls.
 * Reads LI_AT_COOKIE and LI_JSESSIONID from configuration.
 */
export function getAuthHeaders(): Record<string, string> {
  assertSessionConfigured();

  const jsessionId = config.liJsessionId ? config.liJsessionId.replace(/^"|"$/g, '') : '';
  const cookieHeader = jsessionId
    ? `li_at=${config.liAtCookie}; JSESSIONID="${jsessionId}"`
    : `li_at=${config.liAtCookie}`;

  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    'Accept': 'application/vnd.linkedin.normalized+json+2.1',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cookie': cookieHeader,
    'Referer': 'https://www.linkedin.com/',
    'Origin': 'https://www.linkedin.com',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'x-li-lang': 'en_US',
    'x-restli-protocol-version': '2.0.0'
  };

  if (jsessionId) {
    headers['csrf-token'] = jsessionId;
  }

  return headers;
}

// Alias for backwards compatibility
export const getVoyagerHeaders = getAuthHeaders;

/**
 * Creates an authenticated Axios HTTP client pre-configured with the session cookie & CSRF headers.
 */
export function createAuthenticatedHttpClient(): AxiosInstance {
  const headers = getAuthHeaders();

  const client = axios.create({
    baseURL: 'https://www.linkedin.com',
    timeout: 15000,
    headers,
    maxRedirects: 0, // CRITICAL: LinkedIn 302s mean "session invalid" — never follow them
    validateStatus: (status) => status < 500 || status === 500 // handle 500 gracefully too
  });

  return client;
}

/**
 * Lightweight startup validation call:
 * Checks if the session cookie is valid without triggering expensive scraper routines.
 * If expired/invalid, fails fast and returns descriptive manual action instructions.
 * Hard rule: NO automated retry or relogin logic.
 */
export async function validateSessionCookie(httpClient?: AxiosInstance): Promise<AuthValidationResult> {
  if (!isSessionConfigured()) {
    return {
      valid: false,
      error: 'LI_AT_COOKIE is not configured. Please set LI_AT_COOKIE in .env.'
    };
  }

  const client = httpClient || createAuthenticatedHttpClient();

  try {
    // Lightweight Voyager endpoint to test authentication status
    const response = await client.get('/voyager/api/me', {
      headers: {
        'Accept': 'application/vnd.linkedin.normalized+json+2.1'
      }
    });

    if (response.status === 200) {
      const data = response.data;
      const miniProfile = data?.included?.find((item: any) => item.$type?.includes('MiniProfile')) || data?.data;
      const name = miniProfile ? `${miniProfile.firstName || ''} ${miniProfile.lastName || ''}`.trim() : null;
      return {
        valid: true,
        username: name || 'Authenticated User'
      };
    }

    if (response.status === 401 || response.status === 403 || response.status === 302) {
      blockLiveLinkedIn(`auth check HTTP ${response.status}`);
      return {
        valid: false,
        error: 'LinkedIn session cookie is expired or invalid (HTTP ' + response.status + ').'
      };
    }

    // If endpoint is not found or non-200, return status code info
    return {
      valid: false,
      error: `Unexpected response status from LinkedIn auth check: HTTP ${response.status}`
    };
  } catch (err: any) {
    return {
      valid: false,
      error: `Auth validation network error: ${err?.message || 'Unknown network error'}`
    };
  }
}

/**
 * Returns the authenticated execution context.
 * Throws SessionAuthError on failure.
 */
export function getAuthenticatedContext(): AuthenticatedHttpClients {
  assertSessionConfigured();
  const headers = getVoyagerHeaders();
  const axiosInstance = createAuthenticatedHttpClient();

  return {
    axiosInstance,
    headers
  };
}
