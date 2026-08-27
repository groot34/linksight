import { describe, it, expect, vi } from 'vitest';
import {
  assertSessionConfigured,
  isSessionConfigured,
  getVoyagerHeaders,
  validateSessionCookie,
  SessionAuthError
} from './session.js';
import { config } from '../config.js';

describe('Auth & Session Module', () => {
  it('SessionAuthError formats standard 401 error response', () => {
    const error = new SessionAuthError('Session expired test');
    const response = error.toResponse();

    expect(response.statusCode).toBe(401);
    expect(response.code).toBe('SESSION_EXPIRED_OR_INVALID');
    expect(response.message).toBe('Session expired test');
    expect(response.manual_action_required).toBeDefined();
  });

  it('assertSessionConfigured throws when liAtCookie is empty', () => {
    const original = config.liAtCookie;
    config.liAtCookie = '';

    expect(() => assertSessionConfigured()).toThrow(SessionAuthError);

    config.liAtCookie = original;
  });

  it('getVoyagerHeaders attaches li_at and csrf-token correctly', () => {
    const origCookie = config.liAtCookie;
    const origJsession = config.liJsessionId;

    config.liAtCookie = 'AQEDAQ_test_li_at_cookie_value_12345';
    config.liJsessionId = 'ajax:987654321';

    const headers = getVoyagerHeaders();

    expect(headers['Cookie']).toContain('li_at=AQEDAQ_test_li_at_cookie_value_12345');
    expect(headers['Cookie']).toContain('JSESSIONID="ajax:987654321"');
    expect(headers['csrf-token']).toBe('ajax:987654321');
    expect(headers['Accept']).toBe('application/vnd.linkedin.normalized+json+2.1');

    config.liAtCookie = origCookie;
    config.liJsessionId = origJsession;
  });

  it('validateSessionCookie returns false when not configured', async () => {
    const origCookie = config.liAtCookie;
    config.liAtCookie = '';

    const result = await validateSessionCookie();
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not configured');

    config.liAtCookie = origCookie;
  });

  it('validateSessionCookie correctly handles 200 OK from mock client', async () => {
    const origCookie = config.liAtCookie;
    config.liAtCookie = 'AQEDAQ_test_li_at_cookie_value_12345';

    const mockClient = {
      get: vi.fn().mockResolvedValue({
        status: 200,
        data: {
          data: {
            firstName: 'Demo',
            lastName: 'User'
          }
        }
      })
    } as any;

    const result = await validateSessionCookie(mockClient);
    expect(result.valid).toBe(true);
    expect(result.username).toBe('Demo User');

    config.liAtCookie = origCookie;
  });

  it('validateSessionCookie handles 401 Unauthorized cleanly without throwing or retrying', async () => {
    const origCookie = config.liAtCookie;
    config.liAtCookie = 'AQEDAQ_test_li_at_cookie_value_12345';

    const mockClient = {
      get: vi.fn().mockResolvedValue({
        status: 401,
        data: { message: 'Unauthorized' }
      })
    } as any;

    const result = await validateSessionCookie(mockClient);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired or invalid');

    config.liAtCookie = origCookie;
  });
});
