import { buildApp } from './app.js';
import { config } from './config.js';
import { isSessionConfigured, validateSessionCookie } from './auth/session.js';

async function start() {
  try {
    const app = await buildApp();

    await app.listen({
      port: config.port,
      host: config.host
    });

    console.log(`\n================================================================`);
    console.log(`🚀 LinkSight API Server running at: http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}`);
    console.log(`📚 Interactive OpenAPI Docs at:    http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}/docs`);
    console.log(`🩺 System Health Check at:         http://${config.host === '0.0.0.0' ? 'localhost' : config.host}:${config.port}/health`);
    console.log(`================================================================\n`);

    // Startup Session Validation
    if (!isSessionConfigured()) {
      console.warn(`⚠️  [AUTH NOTICE] No LI_AT_COOKIE detected in environment.`);
      console.warn(`   Live profile lookups will return 401 Unauthorized until configured.`);
      console.warn(`   Please copy "li_at" and "JSESSIONID" from browser DevTools into .env.\n`);
    } else {
      console.log(`🔍 [AUTH CHECK] Validating configured session cookie with LinkedIn...`);
      const validation = await validateSessionCookie();
      if (validation.valid) {
        console.log(`✅ [AUTH SUCCESS] Logged in as: "${validation.username}". Session cookie is active and valid.\n`);
      } else {
        console.error(`❌ [AUTH EXPIRED / INVALID] ${validation.error}`);
        console.error(`👉 Manual action required: Re-copy fresh "li_at" and "JSESSIONID" from your browser and update .env.`);
        console.error(`   (Note: Per safety policy, automated relogin is strictly disabled).\n`);
      }
    }
  } catch (err) {
    console.error('❌ Fatal error starting server:', err);
    process.exit(1);
  }
}

start();
