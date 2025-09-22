import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fastifyJwt from '@fastify/jwt';
import Fastify, { type FastifyError, type FastifyReply, type FastifyRequest } from 'fastify';
import { serializerCompiler, validatorCompiler, type ZodTypeProvider } from 'fastify-type-provider-zod';
import { Server as SocketIOServer } from 'socket.io';

import type { ServerConfig } from './config.js';
import type { ServerDependencies } from './dependencies.js';
import { getJwtUser, normalizeJwtUser } from './auth/jwtUser.js';
import type { FastifyZodInstance, FastifyZodPlugin } from './fastifyTypes.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerContestRoutes } from './routes/contests.js';
import { registerPromptRoutes } from './routes/prompts.js';
import { registerSessionRoutes } from './routes/sessions.js';

type FastifyInstanceWithAuth = FastifyZodInstance & {
  authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;
};

const authenticate: FastifyZodPlugin = async (fastify) => {
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const payload = await request.jwtVerify();
      const normalized = normalizeJwtUser(payload);
      if (!normalized) {
        request.log.warn({
          msg: 'authenticate: jwt payload missing required fields',
          payloadKeys: payload && typeof payload === 'object' && !Buffer.isBuffer(payload)
            ? Object.keys(payload as Record<string, unknown>)
            : undefined
        });
        await reply.code(401).send({ message: '認証に失敗しました。' });
        return reply;
      }
      request.user = normalized as FastifyRequest['user'];
      request.log.debug({
        msg: 'authenticate: user verified',
        userId: normalized.userId,
        role: normalized.role
      });
    } catch (error) {
      request.log.warn({
        msg: 'authenticate: jwtVerify failed',
        cause: error instanceof Error ? error.message : error
      });
      await reply.code(401).send({ message: '認証に失敗しました。' });
      return reply;
    }
    return undefined;
  });
};

const authorizeAdmin: FastifyZodPlugin = async (fastify) => {
  fastify.decorate('authorizeAdmin', async (request: FastifyRequest, reply: FastifyReply) => {
    const instance = fastify as FastifyInstanceWithAuth;
    const authenticationResult = await instance.authenticate(request, reply);
    if (authenticationResult) {
      return authenticationResult;
    }
    const user = getJwtUser(request);
    if (!user) {
      request.log.warn({ msg: 'authorizeAdmin: user missing after authenticate' });
      await reply.code(401).send({ message: '認証に失敗しました。' });
      return reply;
    }
    if (user.role !== 'admin') {
      request.log.warn({ msg: 'authorizeAdmin: role mismatch', role: user.role, userId: user.userId });
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

export async function buildServer({ config, dependencies }: BuildServerOptions): Promise<FastifyZodInstance> {
  const fastify = Fastify({
    logger: config.env !== 'test'
  }).withTypeProvider<ZodTypeProvider>();

  fastify.setValidatorCompiler(validatorCompiler);
  fastify.setSerializerCompiler(serializerCompiler);

  fastify.decorate('deps', dependencies);
  fastify.decorate('config', config);

  await fastify.register(cors, {
    origin: config.corsOrigins ?? true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    preflightContinue: false
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
  const io = new SocketIOServer(fastify.server, {
    cors: {
      origin: config.socketCorsOrigins ?? config.corsOrigins ?? true
    }
  });

  fastify.decorate('io', io);

  io.on('connection', (socket) => {
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

  type FastifyValidationIssue = {
    instancePath?: string;
    keyword?: string;
    params?: Record<string, unknown>;
  };

  type FastifyValidationError = FastifyError & {
    validation?: FastifyValidationIssue[];
    validationContext?: string;
  };

  fastify.setErrorHandler((error, _request, reply) => {
    const validationError = error as FastifyValidationError;
    if (validationError.validation && validationError.validationContext === 'params') {
      const invalidUuid = validationError.validation.find((issue) => issue.keyword === 'invalid_format' && issue.params?.format === 'uuid');
      if (invalidUuid) {
        const rawPath = invalidUuid.instancePath ?? '';
        const paramName = rawPath.startsWith('/') ? rawPath.slice(1) : rawPath;
        const label = paramName !== '' ? paramName : 'ID';
        return reply.status(400).send({ message: `${label} は UUID 形式で指定してください。` });
      }
    }
    const statusCode = (error as FastifyError).statusCode ?? 500;
    const message = (error as FastifyError).message ?? '予期せぬエラーが発生しました。';
    return reply.status(statusCode).send({ message });
  });

  fastify.addHook('onClose', async () => {
    io.close();
    await dependencies.prisma.$disconnect();
  });

  return fastify;
}
