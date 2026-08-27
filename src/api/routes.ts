import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { isSessionConfigured } from '../auth/session.js';
import { requestThrottler } from '../scraper/throttler.js';
import { profileCache } from '../cache/memory-cache.js';
import { HealthResponse } from '../types/index.js';

export const apiRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Health Check Endpoint
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
