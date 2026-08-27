import fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
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
          url: `http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`,
          description: 'Current Server'
        }
      ],
      tags: [
        { name: 'Profile', description: 'LinkedIn profile lookup and data extraction' },
        { name: 'System', description: 'System health and status endpoints' }
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
