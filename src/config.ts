import dotenv from 'dotenv';
import { z } from 'zod';
import { AppConfig } from './types/index.js';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000').transform((val) => parseInt(val, 10)),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z.string().default('info'),
  LI_AT_COOKIE: z.string().default(''),
  LI_JSESSIONID: z.string().default(''),
  DAILY_REQUEST_CAP: z.string().default('20').transform((val) => parseInt(val, 10)),
  REQUEST_COOLDOWN_SECONDS: z.string().default('7').transform((val) => parseInt(val, 10)),
  CACHE_TTL_HOURS: z.string().default('24').transform((val) => parseInt(val, 10))
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  process.exit(1);
}

export const config: AppConfig = {
  port: parsedEnv.data.PORT,
  host: parsedEnv.data.HOST,
  nodeEnv: parsedEnv.data.NODE_ENV,
  logLevel: parsedEnv.data.LOG_LEVEL,
  liAtCookie: parsedEnv.data.LI_AT_COOKIE.trim(),
  liJsessionId: parsedEnv.data.LI_JSESSIONID.trim().replace(/^"|"$/g, ''), // Strip wrapping quotes if copied from devtools
  dailyRequestCap: parsedEnv.data.DAILY_REQUEST_CAP,
  requestCooldownSeconds: parsedEnv.data.REQUEST_COOLDOWN_SECONDS,
  cacheTtlHours: parsedEnv.data.CACHE_TTL_HOURS
};
