import { FastifyInstance, FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../config.js';
import { isSessionConfigured, SessionAuthError } from '../auth/session.js';
import { requestThrottler } from '../scraper/throttler.js';
import { profileCache } from '../cache/memory-cache.js';
import { extractVanityName } from '../scraper/url-helper.js';
import { fetchProfile, ProfileNotFoundError, LinkedInRateLimitError, VoyagerGoneError } from '../scraper/fetch-profile.js';
import { HealthResponse, ProfileResponse, ApiErrorResponse } from '../types/index.js';

interface ProfileRequestBody {
  profileUrl: string;
  skipCache?: boolean;
}

interface ProfileQueryParams {
  url?: string;
  skipCache?: boolean;
}

/**
 * Middleware: Basic API Key access control (when API_KEY is configured).
 */
async function verifyApiKey(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!config.apiKey || config.apiKey.length === 0) {
    // API key verification is disabled in development / unconfigured mode
    return;
  }

  const apiKeyHeader = request.headers['x-api-key'];
  if (!apiKeyHeader || apiKeyHeader !== config.apiKey) {
    const errorResponse: ApiErrorResponse = {
      statusCode: 401,
      error: 'Unauthorized',
      code: 'INVALID_API_KEY',
      message: 'Invalid or missing x-api-key header. Access to this API is restricted.'
    };
    return reply.code(401).send(errorResponse);
  }
}

async function handleProfileLookup(
  profileUrl: string | undefined,
  skipCache: boolean | undefined,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const startTime = Date.now();

  if (!profileUrl || typeof profileUrl !== 'string' || profileUrl.trim().length === 0) {
    await reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      code: 'INVALID_URL',
      message: 'The "profileUrl" field is required and must be a valid LinkedIn profile URL.'
    });
    return;
  }

  let vanityName = '';
  try {
    vanityName = extractVanityName(profileUrl);
  } catch (err: any) {
    await reply.code(400).send({
      statusCode: 400,
      error: 'Bad Request',
      code: 'INVALID_URL',
      message: err.message || 'Invalid LinkedIn profile URL provided.'
    });
    return;
  }

  if (!skipCache) {
    const cached = profileCache.get(vanityName);
    if (cached) {
      const quota = requestThrottler.getDailyQuota();
      const response: ProfileResponse = {
        success: true,
        data: cached.data,
        meta: {
          cached: true,
          cached_at: cached.cachedAt,
          fetched_at: new Date().toISOString(),
          execution_time_ms: Date.now() - startTime,
          daily_requests_remaining: quota.remaining
        }
      };
      await reply.code(200).send(response);
      return;
    }
  }

  try {
    const profileData = await fetchProfile(profileUrl, { skipCache });
    const quota = requestThrottler.getDailyQuota();

    const response: ProfileResponse = {
      success: true,
      data: profileData,
      meta: {
        cached: false,
        fetched_at: new Date().toISOString(),
        execution_time_ms: Date.now() - startTime,
        daily_requests_remaining: quota.remaining
      }
    };

    await reply.code(200).send(response);
  } catch (err: any) {
    if (err instanceof SessionAuthError) {
      await reply.code(401).send(err.toResponse());
      return;
    }

    if (err instanceof ProfileNotFoundError) {
      await reply.code(404).send({
        statusCode: 404,
        error: 'Not Found',
        code: err.code,
        message: err.message
      });
      return;
    }

    if (err instanceof VoyagerGoneError) {
      await reply.code(410).send({
        statusCode: 410,
        error: 'Gone',
        code: err.code,
        message: err.message
      });
      return;
    }

    if (err instanceof LinkedInRateLimitError || (err.message && err.message.includes('DAILY_CAP_EXCEEDED'))) {
      await reply.code(429).send({
        statusCode: 429,
        error: 'Too Many Requests',
        code: 'RATE_LIMIT_EXCEEDED',
        message: err.message || 'Rate limit reached. Please wait for cooldown or daily quota reset.'
      });
      return;
    }

    if (err.message && err.message.includes('INVALID_URL')) {
      await reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        code: 'INVALID_URL',
        message: err.message
      });
      return;
    }

    request.log.error(err, 'Upstream LinkedIn scrape failed');
    await reply.code(502).send({
      statusCode: 502,
      error: 'Bad Gateway',
      code: 'UPSTREAM_SCRAPE_ERROR',
      message: `Failed to scrape LinkedIn profile: ${err.message || 'Unknown network error'}`
    });
  }
}

export const apiRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // -------------------------------------------------------------------------
  // POST /api/profile (Primary endpoint requested in Phase 5)
  // -------------------------------------------------------------------------
  fastify.post<{ Body: ProfileRequestBody; Reply: ProfileResponse | ApiErrorResponse }>(
    '/api/profile',
    {
      preHandler: verifyApiKey,
      schema: {
        description: 'Extract structured public LinkedIn profile data by profile URL via direct internal Voyager HTTP requests.',
        tags: ['Profile'],
        security: config.apiKey ? [{ apiKeyAuth: [] }] : [],
        body: {
          type: 'object',
          required: ['profileUrl'],
          properties: {
            profileUrl: {
              type: 'string',
              description: 'Public LinkedIn profile URL (e.g. https://www.linkedin.com/in/williamhgates)'
            },
            skipCache: {
              type: 'boolean',
              description: 'If true, bypasses the in-memory cache and forces a live outbound fetch (subject to rate throttler & daily cap)',
              default: false
            }
          }
        },
        response: {
          200: {
            description: 'Profile structured data successfully retrieved',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  profileUrl: { type: 'string' },
                  name: { type: 'string' },
                  headline: { type: ['string', 'null'] },
                  location: { type: ['string', 'null'] },
                  about: { type: ['string', 'null'] },
                  profileImageUrl: { type: ['string', 'null'] },
                  bannerImageUrl: { type: ['string', 'null'] },
                  experience: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        company: { type: 'string' },
                        location: { type: ['string', 'null'] },
                        startDate: { type: ['string', 'null'] },
                        endDate: { type: ['string', 'null'] },
                        description: { type: ['string', 'null'] }
                      }
                    }
                  },
                  education: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        school: { type: 'string' },
                        degree: { type: ['string', 'null'] },
                        field: { type: ['string', 'null'] },
                        startDate: { type: ['string', 'null'] },
                        endDate: { type: ['string', 'null'] }
                      }
                    }
                  },
                  skills: { type: 'array', items: { type: 'string' } },
                  certifications: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        issuer: { type: ['string', 'null'] },
                        issueDate: { type: ['string', 'null'] }
                      }
                    }
                  },
                  languages: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        language: { type: 'string' },
                        proficiency: { type: ['string', 'null'] }
                      }
                    }
                  },
                  scrapedAt: { type: 'string' }
                }
              },
              meta: {
                type: 'object',
                properties: {
                  cached: { type: 'boolean' },
                  cached_at: { type: ['string', 'null'] },
                  fetched_at: { type: 'string' },
                  execution_time_ms: { type: 'number' },
                  daily_requests_remaining: { type: 'number' }
                }
              }
            }
          },
          400: {
            description: 'Invalid input URL or bad request',
            type: 'object',
            properties: {
              statusCode: { type: 'number', example: 400 },
              error: { type: 'string', example: 'Bad Request' },
              code: { type: 'string', example: 'INVALID_URL' },
              message: { type: 'string' }
            }
          },
          401: {
            description: 'Session cookie expired, invalid, or API key missing',
            type: 'object',
            properties: {
              statusCode: { type: 'number', example: 401 },
              error: { type: 'string', example: 'Unauthorized' },
              code: { type: 'string', example: 'SESSION_EXPIRED_OR_INVALID' },
              message: { type: 'string' },
              manual_action_required: { type: 'string' }
            }
          },
          404: {
            description: 'LinkedIn profile not found or private',
            type: 'object',
            properties: {
              statusCode: { type: 'number', example: 404 },
              error: { type: 'string', example: 'Not Found' },
              code: { type: 'string', example: 'PROFILE_NOT_FOUND' },
              message: { type: 'string' }
            }
          },
          429: {
            description: 'Rate limit or hard daily request cap reached',
            type: 'object',
            properties: {
              statusCode: { type: 'number', example: 429 },
              error: { type: 'string', example: 'Too Many Requests' },
              code: { type: 'string', example: 'RATE_LIMIT_EXCEEDED' },
              message: { type: 'string' }
            }
          },
          502: {
            description: 'Upstream LinkedIn scrape failure or network error',
            type: 'object',
            properties: {
              statusCode: { type: 'number', example: 502 },
              error: { type: 'string', example: 'Bad Gateway' },
              code: { type: 'string', example: 'UPSTREAM_SCRAPE_ERROR' },
              message: { type: 'string' }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const { profileUrl, skipCache } = request.body || {};
      await handleProfileLookup(profileUrl, skipCache, request, reply);
    }
  );

  // -------------------------------------------------------------------------
  // GET /api/profile (Convenience endpoint for cURL / browser testing)
  // -------------------------------------------------------------------------
  fastify.get<{ Querystring: ProfileQueryParams; Reply: ProfileResponse | ApiErrorResponse }>(
    '/api/profile',
    {
      preHandler: verifyApiKey,
      schema: {
        description: 'Alias of POST /api/profile. Prefer POST so Swagger does not look like two calls. Still one LinkedIn request.',
        tags: ['Profile'],
        security: config.apiKey ? [{ apiKeyAuth: [] }] : [],
        querystring: {
          type: 'object',
          required: ['url'],
          properties: {
            url: { type: 'string', description: 'LinkedIn profile URL or vanity username' },
            skipCache: { type: 'boolean', default: false }
          }
        }
      }
    },
    async (request, reply) => {
      await handleProfileLookup(request.query.url, Boolean(request.query.skipCache), request, reply);
    }
  );

  // -------------------------------------------------------------------------
  // GET /health (System status & health check)
  // -------------------------------------------------------------------------
  fastify.get<{ Reply: HealthResponse }>(
    '/health',
    {
      schema: {
        description: 'Check service health, uptime, session cookie readiness, and daily remaining quota',
        tags: ['System'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['ok', 'degraded', 'error'] },
              timestamp: { type: 'string' },
              uptime_seconds: { type: 'number' },
              version: { type: 'string' },
              session_cookie_configured: { type: 'boolean' },
              daily_quota: {
                type: 'object',
                properties: {
                  cap: { type: 'number' },
                  used_today: { type: 'number' },
                  remaining: { type: 'number' }
                }
              },
              cache_stats: {
                type: 'object',
                properties: {
                  items_count: { type: 'number' }
                }
              }
            }
          }
        }
      }
    },
    async (_request, reply) => {
      const quota = requestThrottler.getDailyQuota();
      const sessionConfigured = isSessionConfigured();

      const response: HealthResponse = {
        status: sessionConfigured ? 'ok' : 'degraded',
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.floor(process.uptime()),
        version: '1.0.0',
        session_cookie_configured: sessionConfigured,
        daily_quota: quota,
        cache_stats: {
          items_count: profileCache.size()
        }
      };

      return reply.code(200).send(response);
    }
  );
};
