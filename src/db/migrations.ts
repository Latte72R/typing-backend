import bcrypt from 'bcryptjs';
import { z } from 'zod/v4';

import type { DatabaseClient, DatabasePool } from './client.js';

const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_EMAIL = 'admin@example.com';
const DEFAULT_ADMIN_PASSWORD = 'change-me';
const BCRYPT_ROUNDS = 12;

const adminSeedSchema = z.object({
  ADMIN_USERNAME: z.string().min(1).optional(),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional()
});

interface AdminSeedConfig {
  username: string;
  email: string;
  password: string;
}

function resolveAdminSeedConfig(): AdminSeedConfig {
  const parsed = adminSeedSchema.parse(process.env);
  return {
    username: parsed.ADMIN_USERNAME ?? DEFAULT_ADMIN_USERNAME,
    email: parsed.ADMIN_EMAIL ?? DEFAULT_ADMIN_EMAIL,
    password: parsed.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD
  } satisfies AdminSeedConfig;
}

const schemaStatements = [
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
  `CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS contests (
    id UUID PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    visibility TEXT NOT NULL CHECK (visibility IN ('public','private')),
    join_code TEXT,
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at   TIMESTAMPTZ NOT NULL,
    timezone  TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    time_limit_sec INTEGER NOT NULL CHECK (time_limit_sec BETWEEN 10 AND 600),
    max_attempts INTEGER NOT NULL CHECK (max_attempts >= 1),
    allow_backspace BOOLEAN NOT NULL DEFAULT false,
    leaderboard_visibility TEXT NOT NULL CHECK (leaderboard_visibility IN ('during','after','hidden')),
    language TEXT NOT NULL CHECK (language IN ('romaji','english','kana')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS prompts (
    id UUID PRIMARY KEY,
    language TEXT NOT NULL,
    display_text TEXT NOT NULL,
    typing_target TEXT NOT NULL,
    tags TEXT[],
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS contest_prompts (
    contest_id UUID REFERENCES contests(id) ON DELETE CASCADE,
    prompt_id  UUID REFERENCES prompts(id)  ON DELETE RESTRICT,
    order_index INTEGER NOT NULL,
    PRIMARY KEY (contest_id, prompt_id)
  )`,
  `CREATE TABLE IF NOT EXISTS entries (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    contest_id UUID REFERENCES contests(id) ON DELETE CASCADE,
    attempts_used INTEGER NOT NULL DEFAULT 0,
    best_score INTEGER,
    best_cpm NUMERIC,
    best_accuracy NUMERIC,
    last_attempt_at TIMESTAMPTZ,
    UNIQUE (user_id, contest_id)
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    contest_id UUID REFERENCES contests(id) ON DELETE CASCADE,
    prompt_id UUID REFERENCES prompts(id) ON DELETE RESTRICT,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at   TIMESTAMPTZ,
    status TEXT NOT NULL CHECK (status IN ('running','finished','dq','expired')),
    cpm NUMERIC,
    wpm NUMERIC,
    accuracy NUMERIC,
    errors INTEGER,
    score INTEGER,
    defocus_count INTEGER NOT NULL DEFAULT 0,
    paste_blocked BOOLEAN NOT NULL DEFAULT true,
    anomaly_score NUMERIC,
    dq_reason TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS keystrokes (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID REFERENCES sessions(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL,
    t_ms INTEGER NOT NULL,
    key TEXT NOT NULL,
    ok BOOLEAN NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS entries_contest_best_score_idx ON entries (contest_id, best_score DESC)`,
  `CREATE INDEX IF NOT EXISTS sessions_contest_score_idx ON sessions (contest_id, score DESC)`
];

async function runStatements(client: DatabaseClient): Promise<void> {
  for (const statement of schemaStatements) {
    await client.query(statement);
  }
}

async function ensureAdminUser(client: DatabaseClient): Promise<void> {
  const existingAdmin = await client.query<{ id: string }>(
    `SELECT id FROM users WHERE role = 'admin' LIMIT 1`
  );
  if (existingAdmin.rowCount > 0) {
    return;
  }

  const { username, email, password } = resolveAdminSeedConfig();
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

  const existingUser = await client.query<{ id: string; role: string }>(
    `SELECT id, role FROM users WHERE username = $1 OR email = $2 LIMIT 1`,
    [username, email]
  );

  if (existingUser.rowCount > 0) {
    const user = existingUser.rows[0];
    await client.query(
      `UPDATE users SET role = 'admin', password_hash = $2 WHERE id = $1`,
      [user.id, passwordHash]
    );
    return;
  }

  await client.query(
    `INSERT INTO users (id, username, email, password_hash, role)
     VALUES (uuid_generate_v4(), $1, $2, $3, 'admin')`,
    [username, email, passwordHash]
  );
}

export async function applyMigrations(pool: DatabasePool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await runStatements(client);
    await ensureAdminUser(client);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
