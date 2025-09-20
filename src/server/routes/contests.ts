import {
  type Contest as PrismaContest,
  type ContestLanguage as PrismaContestLanguage,
  type ContestVisibility as PrismaContestVisibility,
  type LeaderboardVisibility as PrismaLeaderboardVisibility,
  SessionStatus as PrismaSessionStatus
} from '@prisma/client';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { type ContestStatus, getContestStatus, isLeaderboardVisible, requiresJoinCode } from '../../domain/contest.js';
import { buildLeaderboard, extractPersonalRank } from '../../domain/leaderboard.js';
import type { FastifyZodPlugin } from '../fastifyTypes.js';

type ContestVisibility = 'public' | 'private';
type LeaderboardVisibility = 'during' | 'after' | 'hidden';

const contestResponseSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  visibility: z.enum(['public', 'private']),
  startsAt: z.string(),
  endsAt: z.string(),
  timezone: z.string(),
  timeLimitSec: z.number(),
  maxAttempts: z.number(),
  allowBackspace: z.boolean(),
  leaderboardVisibility: z.enum(['during', 'after', 'hidden']),
  language: z.string(),
  status: z.enum(['scheduled', 'running', 'finished']),
  joinCode: z.string().nullable().optional()
});

type ContestResponse = z.infer<typeof contestResponseSchema>;

const contestQuerySchema = z.object({
  status: z.enum(['scheduled', 'running', 'finished']).optional()
});

const contestBodySchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  visibility: z.enum(['public', 'private']),
  joinCode: z.string().min(4).max(64).optional(),
  startsAt: z.string().datetime({ offset: true }),
  endsAt: z.string().datetime({ offset: true }),
  timezone: z.string().default('Asia/Tokyo'),
  timeLimitSec: z.number().int().min(10).max(600),
  maxAttempts: z.number().int().min(1),
  allowBackspace: z.boolean().default(false),
  leaderboardVisibility: z.enum(['during', 'after', 'hidden']),
  language: z.enum(['romaji', 'english', 'kana'])
});

const updateContestBodySchema = contestBodySchema.partial();

const updatePromptsBodySchema = z.object({
  prompts: z.array(z.object({
    promptId: z.string().uuid(),
    orderIndex: z.number().int().min(0).optional()
  })).min(1)
});

const joinContestBodySchema = z.object({
  joinCode: z.string().optional()
});

const messageResponseSchema = z.object({ message: z.string() });

const contestIdParamSchema = z.object({ contestId: z.string().uuid() });
type ContestQuery = z.infer<typeof contestQuerySchema>;
type ContestBody = z.infer<typeof contestBodySchema>;
type UpdateContestBody = z.infer<typeof updateContestBodySchema>;
type UpdatePromptsBody = z.infer<typeof updatePromptsBodySchema>;
type JoinContestBody = z.infer<typeof joinContestBodySchema>;
type ContestIdParams = z.infer<typeof contestIdParamSchema>;

function toPrismaVisibility(value: ContestVisibility): PrismaContestVisibility {
  return value === 'public' ? 'PUBLIC' : 'PRIVATE';
}

function toPrismaLeaderboardVisibility(value: LeaderboardVisibility): PrismaLeaderboardVisibility {
  if (value === 'during') return 'DURING';
  if (value === 'after') return 'AFTER';
  return 'HIDDEN';
}

function toPrismaLanguage(value: string): PrismaContestLanguage {
  if (value === 'romaji') return 'ROMAJI';
  if (value === 'english') return 'ENGLISH';
  return 'KANA';
}

function toDomainContest(contest: PrismaContest) {
  return {
    id: contest.id,
    title: contest.title,
    visibility: contest.visibility.toLowerCase() as ContestVisibility,
    startsAt: contest.startsAt.toISOString(),
    endsAt: contest.endsAt.toISOString(),
    timeLimitSec: contest.timeLimitSec,
    maxAttempts: contest.maxAttempts,
    allowBackspace: contest.allowBackspace,
    leaderboardVisibility: contest.leaderboardVisibility.toLowerCase() as LeaderboardVisibility
  };
}

function toContestResponse(contest: PrismaContest, status: ContestStatus, includeJoinCode: boolean): ContestResponse {
  const domain = toDomainContest(contest);
  return {
    ...domain,
    description: contest.description,
    timezone: contest.timezone,
    language: contest.language.toLowerCase(),
    status,
    ...(includeJoinCode ? { joinCode: contest.joinCode ?? null } : {})
  };
}

export const registerContestRoutes: FastifyZodPlugin = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.get('/contests', {
    schema: {
      querystring: contestQuerySchema,
      response: {
        200: z.object({
          contests: z.array(contestResponseSchema.omit({ joinCode: true }))
        })
      }
    }
  }, async (request) => {
    const { prisma } = fastify.deps;
    const query = request.query as ContestQuery;
    const contests = await prisma.contest.findMany({ orderBy: { startsAt: 'asc' } });
    const now = new Date();
    const results = contests.map((contest) => {
      const status = getContestStatus(toDomainContest(contest), now);
      return toContestResponse(contest, status, false);
    });
    const filtered = query.status ? results.filter((contest) => contest.status === query.status) : results;
    return { contests: filtered };
  });

  app.post('/contests', {
    preHandler: fastify.authorizeAdmin,
    schema: {
      body: contestBodySchema,
      response: {
        201: z.object({ contest: contestResponseSchema }),
        400: messageResponseSchema
      }
    }
  }, async (request, reply) => {
    const body = request.body as ContestBody;
    if (body.visibility === 'private' && !body.joinCode) {
      return reply.code(400).send({ message: '非公開コンテストには joinCode が必要です。' });
    }
    if (body.startsAt >= body.endsAt) {
      return reply.code(400).send({ message: '開始日時は終了日時より前である必要があります。' });
    }
    const { prisma } = fastify.deps;
    const contest = await prisma.contest.create({
      data: {
        title: body.title,
        description: body.description,
        visibility: toPrismaVisibility(body.visibility),
        joinCode: body.joinCode ?? null,
        startsAt: new Date(body.startsAt),
        endsAt: new Date(body.endsAt),
        timezone: body.timezone,
        timeLimitSec: body.timeLimitSec,
        maxAttempts: body.maxAttempts,
        allowBackspace: body.allowBackspace,
        leaderboardVisibility: toPrismaLeaderboardVisibility(body.leaderboardVisibility),
        language: toPrismaLanguage(body.language),
        createdBy: request.user.userId
      }
    });
    const status = getContestStatus({
      id: contest.id,
      title: contest.title,
      visibility: body.visibility,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      timeLimitSec: body.timeLimitSec,
      maxAttempts: body.maxAttempts,
      allowBackspace: body.allowBackspace,
      leaderboardVisibility: body.leaderboardVisibility
    });
    return reply.code(201).send({ contest: toContestResponse(contest, status, true) });
  });

  app.patch('/contests/:contestId', {
    preHandler: fastify.authorizeAdmin,
    schema: {
      body: updateContestBodySchema,
      params: contestIdParamSchema,
      response: {
        200: z.object({ contest: contestResponseSchema }),
        400: messageResponseSchema,
        404: messageResponseSchema
      }
    }
  }, async (request, reply) => {
    const { contestId } = request.params as ContestIdParams;
    const body = request.body as UpdateContestBody;
    const { prisma } = fastify.deps;
    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) {
      return reply.code(404).send({ message: 'コンテストが見つかりません。' });
    }
    if ((body.startsAt ?? contest.startsAt.toISOString()) >= (body.endsAt ?? contest.endsAt.toISOString())) {
      return reply.code(400).send({ message: '開始日時は終了日時より前である必要があります。' });
    }
    const updated = await prisma.contest.update({
      where: { id: contestId },
      data: {
        title: body.title ?? contest.title,
        description: body.description ?? contest.description,
        visibility: body.visibility ? toPrismaVisibility(body.visibility) : contest.visibility,
        joinCode: body.visibility === 'public' ? null : (body.joinCode ?? contest.joinCode),
        startsAt: body.startsAt ? new Date(body.startsAt) : contest.startsAt,
        endsAt: body.endsAt ? new Date(body.endsAt) : contest.endsAt,
        timezone: body.timezone ?? contest.timezone,
        timeLimitSec: body.timeLimitSec ?? contest.timeLimitSec,
        maxAttempts: body.maxAttempts ?? contest.maxAttempts,
        allowBackspace: body.allowBackspace ?? contest.allowBackspace,
        leaderboardVisibility: body.leaderboardVisibility ? toPrismaLeaderboardVisibility(body.leaderboardVisibility) : contest.leaderboardVisibility,
        language: body.language ? toPrismaLanguage(body.language) : contest.language
      }
    });
    const status = getContestStatus({
      id: updated.id,
      title: updated.title,
      visibility: updated.visibility.toLowerCase() as ContestVisibility,
      startsAt: updated.startsAt.toISOString(),
      endsAt: updated.endsAt.toISOString(),
      timeLimitSec: updated.timeLimitSec,
      maxAttempts: updated.maxAttempts,
      allowBackspace: updated.allowBackspace,
      leaderboardVisibility: updated.leaderboardVisibility.toLowerCase() as LeaderboardVisibility
    });
    return reply.send({ contest: toContestResponse(updated, status, true) });
  });

  app.post('/contests/:contestId/prompts', {
    preHandler: fastify.authorizeAdmin,
    schema: {
      params: contestIdParamSchema,
      body: updatePromptsBodySchema,
      response: {
        204: z.null(),
        404: messageResponseSchema
      }
    }
  }, async (request, reply) => {
    const { contestId } = request.params as ContestIdParams;
    const { prisma } = fastify.deps;
    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) {
      return reply.code(404).send({ message: 'コンテストが見つかりません。' });
    }
    const body = request.body as UpdatePromptsBody;
    await prisma.$transaction(async (tx) => {
      await tx.contestPrompt.deleteMany({ where: { contestId } });
      await tx.contestPrompt.createMany({
        data: body.prompts.map((prompt, index) => ({
          contestId,
          promptId: prompt.promptId,
          orderIndex: prompt.orderIndex ?? index
        }))
      });
    });
    return reply.code(204).send();
  });

  app.post('/contests/:contestId/join', {
    preHandler: fastify.authenticate,
    schema: {
      params: contestIdParamSchema,
      body: joinContestBodySchema,
      response: {
        204: z.null(),
        403: messageResponseSchema,
        404: messageResponseSchema
      }
    }
  }, async (request, reply) => {
    const { contestId } = request.params as ContestIdParams;
    const { prisma } = fastify.deps;
    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) {
      return reply.code(404).send({ message: 'コンテストが見つかりません。' });
    }
    const domainContest = toDomainContest(contest);
    const body = request.body as JoinContestBody;
    if (requiresJoinCode(domainContest)) {
      if (!body.joinCode || body.joinCode !== contest.joinCode) {
        return reply.code(403).send({ message: 'このコンテストには正しい参加コードが必要です。' });
      }
    }
    await prisma.entry.upsert({
      where: {
        userId_contestId: {
          userId: request.user.userId,
          contestId
        }
      },
      update: {},
      create: {
        userId: request.user.userId,
        contestId
      }
    });
    return reply.code(204).send();
  });

  app.get('/contests/:contestId/leaderboard', {
    preHandler: fastify.authenticate,
    schema: {
      params: contestIdParamSchema,
      response: {
        200: z.object({
          top: z.array(z.object({
            sessionId: z.string().uuid(),
            userId: z.string().uuid(),
            username: z.string().optional(),
            score: z.number(),
            accuracy: z.number(),
            cpm: z.number(),
            endedAt: z.string(),
            rank: z.number()
          })),
          total: z.number(),
          me: z.object({
            sessionId: z.string().uuid(),
            userId: z.string().uuid(),
            username: z.string().optional(),
            score: z.number(),
            accuracy: z.number(),
            cpm: z.number(),
            endedAt: z.string(),
            rank: z.number()
          }).nullable()
        }),
        403: messageResponseSchema,
        404: messageResponseSchema
      }
    }
  }, async (request, reply) => {
    const { contestId } = request.params as ContestIdParams;
    const { prisma, store } = fastify.deps;
    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) {
      return reply.code(404).send({ message: 'コンテストが見つかりません。' });
    }
    const domainContest = toDomainContest(contest);
    if (!isLeaderboardVisible(domainContest)) {
      return reply.code(403).send({ message: 'このコンテストのリーダーボードは現在閲覧できません。' });
    }
    const sessions = await store.getLeaderboard(contestId, 100);
    const leaderboard = buildLeaderboard(sessions);
    const me = extractPersonalRank(leaderboard.ranked, request.user.userId);
    return {
      top: leaderboard.summary.top,
      total: leaderboard.summary.total,
      me
    };
  });

  app.get('/contests/:contestId/live', {
    preHandler: fastify.authorizeAdmin,
    schema: {
      params: contestIdParamSchema,
      response: {
        200: z.object({
          contestId: z.string().uuid(),
          totalEntries: z.number(),
          runningSessions: z.number(),
          flaggedSessions: z.number()
        }),
        404: messageResponseSchema
      }
    }
  }, async (request, reply) => {
    const { contestId } = request.params as ContestIdParams;
    const { prisma } = fastify.deps;
    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) {
      return reply.code(404).send({ message: 'コンテストが見つかりません。' });
    }
    const totalEntries = await prisma.entry.count({ where: { contestId } });
    const runningSessions = await prisma.session.count({ where: { contestId, status: PrismaSessionStatus.RUNNING } });
    const flaggedSessions = await prisma.session.count({ where: { contestId, status: PrismaSessionStatus.DQ } });
    return reply.send({
      contestId,
      totalEntries,
      runningSessions,
      flaggedSessions
    });
  });
};
