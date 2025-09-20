import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { z } from 'zod/v4';

const envConfigSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  PGHOST: z.string().optional(),
  PGPORT: z.coerce.number().optional(),
  PGUSER: z.string().optional(),
  PGPASSWORD: z.string().optional(),
  PGDATABASE: z.string().optional(),
  PGSSLMODE: z.enum(['disable', 'require']).optional()
});

export type ResolvedDatabaseConfig = PoolConfig & { connectionString?: string };

export function resolveDatabaseConfig(overrides: Partial<PoolConfig> = {}): ResolvedDatabaseConfig {
  const parsed = envConfigSchema.parse(process.env);
  if (parsed.DATABASE_URL) {
    return {
      connectionString: parsed.DATABASE_URL,
      ssl: parsed.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
      ...overrides
    };
  }
  return {
    host: parsed.PGHOST,
    port: parsed.PGPORT,
    user: parsed.PGUSER,
    password: parsed.PGPASSWORD,
    database: parsed.PGDATABASE,
    ssl: parsed.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : undefined,
    ...overrides
  };
}

export function createPool(overrides: Partial<PoolConfig> = {}): Pool {
  const config = resolveDatabaseConfig(overrides);
  return new Pool(config);
}

export async function withTransaction<T>(pool: Pool, callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export type DatabasePool = Pool;
export type DatabaseClient = PoolClient;
