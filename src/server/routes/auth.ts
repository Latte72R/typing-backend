import { Prisma } from '@prisma/client';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import type { FastifyZodPlugin } from '../fastifyTypes.js';

const authPayloadSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: z.object({
    id: z.string().uuid(),
    username: z.string(),
    email: z.string().email(),
    role: z.enum(['user', 'admin'])
  })
});

const signupBodySchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(32),
  password: z.string().min(8).max(128)
});

const signinBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128)
});

const refreshBodySchema = z.object({
  refreshToken: z.string().min(10)
});

const signoutBodySchema = refreshBodySchema.partial();

const errorResponseSchema = z.object({
  message: z.string()
});

type SignupBody = z.infer<typeof signupBodySchema>;
type SigninBody = z.infer<typeof signinBodySchema>;
type RefreshBody = z.infer<typeof refreshBodySchema>;
type SignoutBody = z.infer<typeof signoutBodySchema>;

function prismaIsUniqueError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export const registerAuthRoutes: FastifyZodPlugin = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post('/auth/signup', {
    schema: {
      body: signupBodySchema,
      response: {
        201: authPayloadSchema,
        409: errorResponseSchema
      }
    }
  }, async (request, reply) => {
    const body = request.body as SignupBody;
    const { store, auth, prisma } = fastify.deps;
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: body.email }, { username: body.username }]
      }
    });
    if (existingUser) {
      return reply.code(409).send({ message: '指定されたメールアドレスまたはユーザー名は既に使用されています。' });
    }
    const passwordHash = await auth.hashPassword(body.password);
    try {
      const user = await store.createUser({
        email: body.email,
        username: body.username,
        passwordHash
      });
      const accessToken = fastify.jwt.sign({ userId: user.id, role: user.role });
      const refresh = await auth.issueRefreshToken(user.id);
      return reply.code(201).send({
        accessToken,
        refreshToken: refresh.token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      });
    } catch (error: unknown) {
      if (prismaIsUniqueError(error)) {
        return reply.code(409).send({ message: 'ユーザーの作成に失敗しました（重複）。' });
      }
      throw error;
    }
  });

  app.post('/auth/signin', {
    schema: {
      body: signinBodySchema,
      response: {
        200: authPayloadSchema,
        401: errorResponseSchema
      }
    }
  }, async (request, reply) => {
    const body = request.body as SigninBody;
    const { store, auth } = fastify.deps;
    const user = await store.findUserByEmail(body.email);
    if (!user) {
      return reply.code(401).send({ message: 'メールアドレスまたはパスワードが正しくありません。' });
    }
    const valid = await auth.verifyPassword(body.password, user.passwordHash);
    if (!valid) {
      return reply.code(401).send({ message: 'メールアドレスまたはパスワードが正しくありません。' });
    }
    const accessToken = fastify.jwt.sign({ userId: user.id, role: user.role });
    const refresh = await auth.issueRefreshToken(user.id);
    return reply.send({
      accessToken,
      refreshToken: refresh.token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  });

  app.post('/auth/refresh', {
    schema: {
      body: refreshBodySchema,
      response: {
        200: authPayloadSchema,
        401: errorResponseSchema
      }
    }
  }, async (request, reply) => {
    const body = request.body as RefreshBody;
    const rotation = await fastify.deps.auth.rotateRefreshToken(body.refreshToken);
    if (!rotation) {
      return reply.code(401).send({ message: 'リフレッシュトークンが無効です。' });
    }
    const user = await fastify.deps.store.findUserById(rotation.userId);
    if (!user) {
      await fastify.deps.auth.revokeRefreshToken(rotation.newToken);
      return reply.code(401).send({ message: 'リフレッシュトークンが無効です。' });
    }
    const accessToken = fastify.jwt.sign({ userId: user.id, role: user.role });
    return reply.send({
      accessToken,
      refreshToken: rotation.newToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  });

  app.post('/auth/signout', {
    schema: {
      body: signoutBodySchema,
      response: {
        204: z.null()
      }
    }
  }, async (request, reply) => {
    const body = request.body as SignoutBody | undefined;
    if (body?.refreshToken) {
      await fastify.deps.auth.revokeRefreshToken(body.refreshToken);
    } else if (request.headers.authorization) {
      try {
        await request.jwtVerify();
        if (request.user?.userId) {
          await fastify.deps.auth.revokeAll(request.user.userId);
        }
      } catch {
        // ignore verification errors during signout
      }
    }
    return reply.code(204).send();
  });
};
