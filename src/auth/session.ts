import { config } from '../config.js';
import { ApiErrorResponse } from '../types/index.js';

export class SessionAuthError extends Error {
  public readonly statusCode: number = 401;
  public readonly code: string = 'SESSION_EXPIRED_OR_INVALID';
  public readonly manualAction: string;

  constructor(message = 'LinkedIn session cookie (li_at / JSESSIONID) is missing, expired, or invalid.') {
    super(message);
    this.name = 'SessionAuthError';
    this.manualAction = 'Log into linkedin.com in your browser, open DevTools -> Application -> Cookies, copy fresh li_at and JSESSIONID values into your .env file or environment variables, and restart.';
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

export function isSessionConfigured(): boolean {
  return Boolean(config.liAtCookie && config.liAtCookie.length > 10);
}

export function assertSessionConfigured(): void {
  if (!isSessionConfigured()) {
    throw new SessionAuthError('LI_AT_COOKIE is not configured or is too short. Manual session cookie injection is required.');
  }
}
