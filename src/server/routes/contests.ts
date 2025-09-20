import type { FastifyPluginAsync } from 'fastify';
import { Prisma, type Contest as PrismaContest } from '@prisma/client';
import { z } from 'zod';

import { getContestStatus, isLeaderboardVisible, requiresJoinCode, type ContestStatus } from '../../domain/contest.js';
import { buildLeaderboard, extractPersonalRank } from '../../domain/leaderboard.js';

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

function toPrismaVisibility(value: ContestVisibility): Prisma.ContestVisibility {
  return value === 'public' ? 'PUBLIC' : 'PRIVATE';
}

function toPrismaLeaderboardVisibility(value: LeaderboardVisibility): Prisma.LeaderboardVisibility {
  if (value === 'during') return 'DURING';
  if (value === 'after') return 'AFTER';
  return 'HIDDEN';
}

function toPrismaLanguage(value: string): Prisma.ContestLanguage {
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

export const registerContestRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/contests', {
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
    const contests = await prisma.contest.findMany({ orderBy: { startsAt: 'asc' } });
    const now = new Date();
    const results = contests.map((contest) => {
      const status = getContestStatus(toDomainContest(contest), now);
      return toContestResponse(contest, status, false);
    });
    const filtered = request.query.status ? results.filter((contest) => contest.status === request.query.status) : results;
    return { contests: filtered };
  });

  fastify.post('/contests', {
    preHandler: fastify.authorizeAdmin,
    schema: {
      body: contestBodySchema,
      response: {
        201: z.object({ contest: contestResponseSchema })
      }
    }
  }, async (request, reply) => {
    const body = request.body;
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

  fastify.patch('/contests/:contestId', {
    preHandler: fastify.authorizeAdmin,
    schema: {
      body: updateContestBodySchema,
      params: z.object({ contestId: z.string().uuid() }),
      response: {
        200: z.object({ contest: contestResponseSchema })
      }
    }
  }, async (request, reply) => {
    const { contestId } = request.params;
    const body = request.body;
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

  fastify.post('/contests/:contestId/prompts', {
    preHandler: fastify.authorizeAdmin,
    schema: {
      params: z.object({ contestId: z.string().uuid() }),
      body: updatePromptsBodySchema,
      response: {
        204: z.null()
      }
    }
  }, async (request, reply) => {
    const { contestId } = request.params;
    const { prisma } = fastify.deps;
    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) {
      return reply.code(404).send({ message: 'コンテストが見つかりません。' });
    }
    await prisma.$transaction(async (tx) => {
      await tx.contestPrompt.deleteMany({ where: { contestId } });
      await tx.contestPrompt.createMany({
        data: request.body.prompts.map((prompt, index) => ({
          contestId,
          promptId: prompt.promptId,
          orderIndex: prompt.orderIndex ?? index
        }))
      });
    });
    return reply.code(204).send();
  });

  fastify.post('/contests/:contestId/join', {
    preHandler: fastify.authenticate,
    schema: {
      params: z.object({ contestId: z.string().uuid() }),
      body: joinContestBodySchema,
      response: {
        204: z.null()
      }
    }
  }, async (request, reply) => {
    const { contestId } = request.params;
    const { prisma } = fastify.deps;
    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) {
      return reply.code(404).send({ message: 'コンテストが見つかりません。' });
    }
    const domainContest = toDomainContest(contest);
    if (requiresJoinCode(domainContest)) {
      if (!request.body.joinCode || request.body.joinCode !== contest.joinCode) {
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

  fastify.get('/contests/:contestId/leaderboard', {
    preHandler: fastify.authenticate,
    schema: {
      params: z.object({ contestId: z.string().uuid() }),
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
        })
      }
    }
  }, async (request, reply) => {
    const { contestId } = request.params;
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

  fastify.get('/contests/:contestId/live', {
    preHandler: fastify.authorizeAdmin,
    schema: {
      params: z.object({ contestId: z.string().uuid() }),
      response: {
        200: z.object({
          contestId: z.string().uuid(),
          totalEntries: z.number(),
          runningSessions: z.number(),
          flaggedSessions: z.number()
        })
      }
    }
  }, async (request, reply) => {
    const { contestId } = request.params;
    const { prisma } = fastify.deps;
    const contest = await prisma.contest.findUnique({ where: { id: contestId } });
    if (!contest) {
      return reply.code(404).send({ message: 'コンテストが見つかりません。' });
    }
    const totalEntries = await prisma.entry.count({ where: { contestId } });
    const runningSessions = await prisma.session.count({ where: { contestId, status: 'RUNNING' } });
    const flaggedSessions = await prisma.session.count({ where: { contestId, status: 'DQ' } });
    return reply.send({
      contestId,
      totalEntries,
      runningSessions,
      flaggedSessions
    });
  });
};
