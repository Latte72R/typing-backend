import Fastify, { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fastifyJwt from '@fastify/jwt';
import fastifySocketIo from '@fastify/socket.io';
import { ZodTypeProvider } from 'fastify-type-provider-zod';

import type { ServerConfig } from './config.js';
import type { ServerDependencies } from './dependencies.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerContestRoutes } from './routes/contests.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerPromptRoutes } from './routes/prompts.js';

const authenticate: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authenticate', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      await reply.code(401).send({ message: '認証に失敗しました。' });
      return reply;
    }
    return undefined;
  });
};

const authorizeAdmin: FastifyPluginAsync = async (fastify) => {
  fastify.decorate('authorizeAdmin', async (request, reply) => {
    try {
      await request.jwtVerify();
    } catch {
      await reply.code(401).send({ message: '認証に失敗しました。' });
      return reply;
    }
    if (request.user.role !== 'admin') {
      await reply.code(403).send({ message: '管理者権限が必要です。' });
      return reply;
    }
    return undefined;
  });
};

export interface BuildServerOptions {
  config: ServerConfig;
  dependencies: ServerDependencies;
}

export async function buildServer({ config, dependencies }: BuildServerOptions): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: config.env !== 'test'
  }).withTypeProvider<ZodTypeProvider>();

  fastify.decorate('deps', dependencies);
  fastify.decorate('config', config);

  await fastify.register(cors, {
    origin: config.corsOrigins ?? true,
    credentials: true
  });
  await fastify.register(helmet, {
    contentSecurityPolicy: false
  });
  await fastify.register(fastifyJwt, {
    secret: config.jwtSecret,
    sign: {
      expiresIn: '15m'
    }
  });
  await fastify.register(authenticate);
  await fastify.register(authorizeAdmin);
  await fastify.register(fastifySocketIo, {
    cors: {
      origin: config.socketCorsOrigins ?? config.corsOrigins ?? true
    }
  });

  fastify.io.on('connection', (socket) => {
    socket.on('contest:join', ({ contestId }: { contestId: string }) => {
      if (!contestId) return;
      socket.join(`contest:${contestId}:leaderboard`);
    });
    socket.on('contest:leave', ({ contestId }: { contestId: string }) => {
      if (!contestId) return;
      socket.leave(`contest:${contestId}:leaderboard`);
    });
  });

  await fastify.register(registerAuthRoutes, { prefix: '/api/v1' });
  await fastify.register(registerContestRoutes, { prefix: '/api/v1' });
  await fastify.register(registerSessionRoutes, { prefix: '/api/v1' });
  await fastify.register(registerPromptRoutes, { prefix: '/api/v1' });

  fastify.addHook('onClose', async () => {
    await dependencies.prisma.$disconnect();
  });

  return fastify;
}
