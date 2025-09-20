import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

import { buildLeaderboard, extractPersonalRank } from '../../domain/leaderboard.js';
import { NotFoundError, ValidationError, ConflictError } from '../../services/typingStore.js';

const startSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  contestId: z.string().uuid(),
  prompt: z.object({
    id: z.string().uuid(),
    displayText: z.string(),
    typingTarget: z.string()
  }),
  startedAt: z.string(),
  attemptsUsed: z.number().int().nonnegative(),
  attemptsRemaining: z.number().int().nonnegative()
});

const finishSessionBodySchema = z.object({
  cpm: z.number().nonnegative(),
  wpm: z.number().nonnegative(),
  accuracy: z.number().min(0).max(1),
  score: z.number().nonnegative(),
  errors: z.number().int().min(0).optional(),
  keylog: z.array(z.object({
    t: z.number().min(0),
    k: z.string(),
    ok: z.boolean().optional()
  })).max(2000).optional(),
  clientFlags: z.object({
    defocus: z.number().int().min(0).optional(),
    pasteBlocked: z.boolean().optional(),
    anomalyScore: z.number().min(0).optional()
  }).optional()
});

const finishSessionResponseSchema = z.object({
  status: z.enum(['finished', 'expired', 'dq']),
  stats: z.object({
    cpm: z.number(),
    wpm: z.number(),
    accuracy: z.number(),
    score: z.number(),
    correct: z.number(),
    mistakes: z.number(),
    elapsedMs: z.number()
  }),
  issues: z.array(z.string()),
  anomaly: z.object({
    mean: z.number(),
    stdev: z.number(),
    cv: z.number(),
    count: z.number()
  }),
  flags: z.object({
    pasteBlocked: z.boolean(),
    defocus: z.number(),
    anomalyScore: z.number().optional()
  }),
  bestUpdated: z.boolean(),
  attemptsUsed: z.number().int().nonnegative()
});

function handleStoreError(error: unknown) {
  if (error instanceof NotFoundError) {
    return { status: 404, message: error.message };
  }
  if (error instanceof ValidationError) {
    return { status: 400, message: error.message };
  }
  if (error instanceof ConflictError) {
    return { status: 409, message: error.message };
  }
  return null;
}

export const registerSessionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/contests/:contestId/sessions', {
    preHandler: fastify.authenticate,
    schema: {
      params: z.object({ contestId: z.string().uuid() }),
      response: {
        201: startSessionResponseSchema
      }
    }
  }, async (request, reply) => {
    const { contestId } = request.params;
    try {
      const result = await fastify.deps.store.startSession({
        contestId,
        userId: request.user.userId
      });
      return reply.code(201).send(result);
    } catch (error) {
      const handled = handleStoreError(error);
      if (handled) {
        return reply.code(handled.status).send({ message: handled.message });
      }
      throw error;
    }
  });

  fastify.post('/sessions/:sessionId/finish', {
    preHandler: fastify.authenticate,
    schema: {
      params: z.object({ sessionId: z.string().uuid() }),
      body: finishSessionBodySchema,
      response: {
        200: finishSessionResponseSchema
      }
    }
  }, async (request, reply) => {
    const { sessionId } = request.params;
    const { prisma, store } = fastify.deps;
    let contestId: string | null = null;
    try {
      const session = await prisma.session.findUnique({
        where: { id: sessionId },
        select: { contestId: true }
      });
      if (!session) {
        return reply.code(404).send({ message: 'セッションが見つかりません。' });
      }
      contestId = session.contestId;
      const result = await store.finishSession({
        sessionId,
        userId: request.user.userId,
        payload: request.body
      });
      if (contestId) {
        const sessions = await store.getLeaderboard(contestId, 100);
        const leaderboard = buildLeaderboard(sessions);
        const me = extractPersonalRank(leaderboard.ranked, request.user.userId);
        fastify.io.to(`contest:${contestId}:leaderboard`).emit('leaderboard:update', {
          top: leaderboard.summary.top,
          total: leaderboard.summary.total,
          me
        });
      }
      return reply.send(result);
    } catch (error) {
      const handled = handleStoreError(error);
      if (handled) {
        return reply.code(handled.status).send({ message: handled.message });
      }
      throw error;
    }
  });
};
