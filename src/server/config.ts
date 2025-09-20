import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().min(0).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET は16文字以上である必要があります。'),
  REFRESH_TOKEN_TTL_SEC: z.coerce.number().positive().optional(),
  CORS_ORIGIN: z.string().optional(),
  SOCKET_CORS_ORIGIN: z.string().optional()
});

const parsed = envSchema.parse(process.env);

export interface ServerConfig {
  env: 'development' | 'test' | 'production';
  port: number;
  host: string;
  jwtSecret: string;
  refreshTokenTtlSec: number;
  corsOrigins: string[] | undefined;
  socketCorsOrigins: string[] | undefined;
}

function parseOrigins(value?: string): string[] | undefined {
  if (!value) return undefined;
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export function getServerConfig(): ServerConfig {
  return {
    env: parsed.NODE_ENV,
    port: parsed.PORT,
    host: parsed.HOST,
    jwtSecret: parsed.JWT_SECRET,
    refreshTokenTtlSec: parsed.REFRESH_TOKEN_TTL_SEC ?? 60 * 60 * 24 * 14,
    corsOrigins: parseOrigins(parsed.CORS_ORIGIN),
    socketCorsOrigins: parseOrigins(parsed.SOCKET_CORS_ORIGIN ?? parsed.CORS_ORIGIN)
  };
}
