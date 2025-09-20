import { getServerConfig } from './config.js';
import { createDependencies } from './dependencies.js';
import { buildServer } from './buildServer.js';

async function main() {
  const config = getServerConfig();
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
