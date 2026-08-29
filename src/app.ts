import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { apiRoutes } from './api/routes.js';
import { config } from './config.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = fastify({
    logger: {
      level: config.logLevel
    }
  });

  // Security Headers & CORS
  await app.register(helmet, {
    contentSecurityPolicy: false // Allows Swagger UI to load resources smoothly
  });
  
  await app.register(cors, {
    origin: true
  });

  // Incoming API Rate Limiting (Protects server & prevents spam bursts)
  await app.register(rateLimit, {
    max: 60, // Max 60 requests per minute per IP
    timeWindow: '1 minute',
    errorResponseBuilder: (_request, context) => ({
      statusCode: 429,
      error: 'Too Many Requests',
      code: 'SERVER_RATE_LIMIT_EXCEEDED',
      message: `Rate limit exceeded. Maximum ${context.max} requests per ${context.after}. Please slow down.`
    })
  });

  // Swagger OpenAPI Documentation
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'LinkSight LinkedIn Profile API',
        description: 'Hosted HTTPS API to extract structured public LinkedIn profile data with manual session authentication, rate throttling, and idempotent caching.',
        version: '1.0.0'
      },
      servers: [
        {
          url: '/',
          description: 'Current Server'
        }
      ],
      components: {
        securitySchemes: {
          apiKeyAuth: {
            type: 'apiKey',
            name: 'x-api-key',
            in: 'header',
            description: 'API key for basic service access control (configured via API_KEY env var)'
          }
        }
      },
      tags: [
        { name: 'Profile', description: 'LinkedIn profile lookup and structured data extraction' },
        { name: 'System', description: 'System health and quota status endpoints' }
      ]
    }
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: true
    },
    staticCSP: true,
    transformStaticCSP: (header) => header
  });

  // Root redirect to /docs
  app.get('/', async (_request, reply) => {
    return reply.redirect('/docs');
  });

  // Register API Routes
  await app.register(apiRoutes);

  return app;
}
