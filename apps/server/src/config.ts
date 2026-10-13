import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().default('mongodb://localhost:27017/talk_db'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  SESSION_SECRET: z.string().min(32).default('super-secret-default-session-key-minimum-32-chars-long-abc123'),
  TURN_SECRET: z.string().default('super-secure-coturn-shared-secret-must-match-turnserver-conf'),
  TURN_REALM: z.string().default('talk.local'),
  TURN_SERVER_URL: z.string().default('turn:localhost:3478'),
  STUN_SERVER_URL: z.string().default('stun:localhost:3478'),
  UNCLAIMED_LINK_TTL_HOURS: z.coerce.number().default(24),
  INACTIVE_ROOM_CRON: z.string().default('0 3 * * *'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('[Config Error] Invalid environment configuration:');
  parsed.error.errors.forEach((err) => {
    console.error(` - ${err.path.join('.')}: ${err.message}`);
  });
  throw new Error('Invalid environment configuration');
}

export const config = parsed.data;
