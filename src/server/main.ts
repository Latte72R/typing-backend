import { createPool } from '../db/client.js';
import { applyMigrations } from '../db/migrations.js';
import { buildServer } from './buildServer.js';
import { getServerConfig } from './config.js';
import { createDependencies } from './dependencies.js';

async function migrateDatabase(): Promise<void> {
  const pool = createPool();
  try {
    await applyMigrations(pool);
  } finally {
    try {
      await pool.end();
    } catch (closeError) {
      console.error('マイグレーション用のDB接続のクローズに失敗しました', closeError);
    }
  }
}

async function main() {
  const config = getServerConfig();
  try {
    await migrateDatabase();
  } catch (error) {
    console.error('データベースマイグレーションの適用に失敗しました', error);
    process.exit(1);
    return;
  }
  const dependencies = createDependencies(config);
  const server = await buildServer({ config, dependencies });
  try {
    await server.listen({ port: config.port, host: config.host });
  } catch (error) {
    server.log.error(error, 'サーバーの起動に失敗しました');
    await dependencies.prisma.$disconnect();
    process.exit(1);
  }
}

void main();
