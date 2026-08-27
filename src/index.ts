import { buildApp } from './app.js';
import { config } from './config.js';
import { isSessionConfigured } from './auth/session.js';

async function start() {
  try {
    const app = await buildApp();

    await app.listen({
      port: config.port,
      host: config.host
    });

    console.log(`\n🚀 LinkSight API server running at http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
    console.log(`📚 Interactive OpenAPI Swagger docs available at http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}/docs`);
    console.log(`🩺 Health check endpoint at http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}/health`);

    if (!isSessionConfigured()) {
      console.warn(`⚠️  WARNING: LI_AT_COOKIE is not configured. Live scraping requests will return 401 until configured in .env.`);
    } else {
      console.log(`🔑 LinkedIn session credentials detected and active.`);
    }
  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

start();
