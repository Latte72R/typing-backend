import { randomUUID } from 'node:crypto';
import {
  Prisma,
  PrismaClient,
  type Contest as PrismaContest,
  type ContestPrompt,
  type Entry as PrismaEntry,
  type Keystroke,
  type Prompt as PrismaPrompt,
  type Session as PrismaSession
} from '@prisma/client';

import { remainingAttempts, validateSessionStart, type Contest } from '../domain/contest.js';
import {
  evaluateSessionFinish,
  type SessionFinishPayload,
  type SessionFinishResult
} from '../domain/session.js';
import type { LeaderboardSession } from '../domain/leaderboard.js';
import type { TypingStats } from '../domain/scoring.js';

export interface UserRecord {
  id: string;
  username: string;
  email: string;
  passwordHash: string;
  role: 'user' | 'admin';
  createdAt: Date;
}

export interface CreateUserInput {
  id?: string;
  username: string;
  email: string;
  passwordHash: string;
  role?: 'user' | 'admin';
}

export interface PromptDto {
  id: string;
  displayText: string;
  typingTarget: string;
}

export interface StartSessionOptions {
  contestId: string;
  userId: string;
  now?: Date;
}

export interface StartSessionResult {
  sessionId: string;
  contestId: string;
  prompt: PromptDto;
  startedAt: string;
  attemptsUsed: number;
  attemptsRemaining: number;
}

export interface FinishSessionOptions {
  sessionId: string;
  userId: string;
  payload: SessionFinishPayload;
  now?: Date;
}

export interface FinishSessionResult extends SessionFinishResult {
  bestUpdated: boolean;
  attemptsUsed: number;
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

interface EntryRecord {
  id: string;
  attemptsUsed: number;
  bestScore: number | null;
  bestCpm: number | null;
  bestAccuracy: number | null;
}

function toContestVisibility(value: PrismaContest['visibility']): Contest['visibility'] {
  return value.toLowerCase() as Contest['visibility'];
}

function toLeaderboardVisibility(value: PrismaContest['leaderboardVisibility']): Contest['leaderboardVisibility'] {
  return value.toLowerCase() as Contest['leaderboardVisibility'];
}

function mapContest(row: PrismaContest): Contest {
  return {
    id: row.id,
    title: row.title,
    visibility: toContestVisibility(row.visibility),
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    timeLimitSec: row.timeLimitSec,
    maxAttempts: row.maxAttempts,
    allowBackspace: row.allowBackspace,
    leaderboardVisibility: toLeaderboardVisibility(row.leaderboardVisibility)
  };
}

function decimalToNumber(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return value;
  return value.toNumber();
}

function mapEntry(row: PrismaEntry): EntryRecord {
  return {
    id: row.id,
    attemptsUsed: row.attemptsUsed,
    bestScore: row.bestScore ?? null,
    bestCpm: decimalToNumber(row.bestCpm),
    bestAccuracy: decimalToNumber(row.bestAccuracy)
  };
}

function mapPrompt(row: PrismaPrompt): PromptDto {
  return {
    id: row.id,
    displayText: row.displayText,
    typingTarget: row.typingTarget
  };
}

function mapContestPrompt(row: ContestPrompt & { prompt: PrismaPrompt }): PromptDto {
  return mapPrompt(row.prompt);
}

function isBetterScore(existing: EntryRecord, candidate: { score: number; accuracy: number; cpm: number }): boolean {
  if (existing.bestScore === null) return true;
  if (candidate.score !== existing.bestScore) {
    return candidate.score > existing.bestScore;
  }
  if (existing.bestAccuracy === null) return true;
  if (candidate.accuracy !== existing.bestAccuracy) {
    return candidate.accuracy > (existing.bestAccuracy ?? 0);
  }
  if (existing.bestCpm === null) return true;
  if (candidate.cpm !== existing.bestCpm) {
    return candidate.cpm > (existing.bestCpm ?? 0);
  }
  return false;
}

function normalizeStats(stats: TypingStats): { cpm: number; wpm: number; accuracy: number; errors: number; score: number } {
  return {
    cpm: Number(stats.cpm),
    wpm: Number(stats.wpm),
    accuracy: Number(stats.accuracy),
    errors: Number(stats.mistakes),
    score: Number(stats.score)
  };
}

function toSessionStatus(value: 'finished' | 'expired' | 'dq'): Prisma.SessionStatus {
  switch (value) {
    case 'finished':
      return 'FINISHED';
    case 'expired':
      return 'EXPIRED';
    case 'dq':
      return 'DQ';
    default:
      return 'FINISHED';
  }
}

function toLeaderboardSession(row: PrismaSession & { user: { username: string | null } }): LeaderboardSession {
  return {
    sessionId: row.id,
    userId: row.userId,
    username: row.user.username ?? undefined,
    score: Number(row.score ?? 0),
    accuracy: Number(decimalToNumber(row.accuracy) ?? 0),
    cpm: Number(decimalToNumber(row.cpm) ?? 0),
    endedAt: row.endedAt ? row.endedAt.toISOString() : new Date(0).toISOString()
  };
}

async function replaceKeystrokes(prisma: PrismaClient | Prisma.TransactionClient, sessionId: string, keylog: SessionFinishPayload['keylog']): Promise<void> {
  await prisma.keystroke.deleteMany({ where: { sessionId } });
  if (!keylog || keylog.length === 0) {
    return;
  }
  const data: Omit<Keystroke, 'id'>[] = keylog.map((entry, index) => ({
    sessionId,
    idx: index,
    tMs: Math.trunc(entry.t),
    key: String(entry.k ?? ''),
    ok: entry.ok ?? (typeof entry.k === 'string' && entry.k.length === 1)
  }));
  await prisma.keystroke.createMany({ data });
}

export class TypingStore {
  constructor(private readonly prisma: PrismaClient) {}

  async createUser(input: CreateUserInput): Promise<UserRecord> {
    const user = await this.prisma.user.create({
      data: {
        id: input.id ?? randomUUID(),
        username: input.username,
        email: input.email,
        passwordHash: input.passwordHash,
        role: (input.role ?? 'user').toUpperCase() as Prisma.UserRole
      }
    });
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role.toLowerCase() as UserRecord['role'],
      createdAt: user.createdAt
    };
  }

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role.toLowerCase() as UserRecord['role'],
      createdAt: user.createdAt
    };
  }

  async findUserById(id: string): Promise<UserRecord | null> {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) return null;
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      passwordHash: user.passwordHash,
      role: user.role.toLowerCase() as UserRecord['role'],
      createdAt: user.createdAt
    };
  }

  async startSession(options: StartSessionOptions): Promise<StartSessionResult> {
    const now = options.now ?? new Date();
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const contestRow = await tx.contest.findUnique({ where: { id: options.contestId } });
      if (!contestRow) {
        throw new NotFoundError('指定したコンテストが見つかりません。');
      }
      const contest = mapContest(contestRow);
      let entryRow = await tx.entry.findUnique({
        where: {
          userId_contestId: {
            userId: options.userId,
            contestId: options.contestId
          }
        }
      });
      if (!entryRow) {
        entryRow = await tx.entry.create({
          data: {
            id: randomUUID(),
            userId: options.userId,
            contestId: options.contestId
          }
        });
      }
      const entry = mapEntry(entryRow);
      const validation = validateSessionStart(contest, { attemptsUsed: entry.attemptsUsed }, now);
      if (!validation.ok) {
        throw new ValidationError(validation.reason);
      }
      const promptRow = await tx.contestPrompt.findFirst({
        where: { contestId: options.contestId },
        orderBy: { orderIndex: 'asc' },
        include: { prompt: true }
      });
      if (!promptRow) {
        throw new NotFoundError('コンテストに紐づくプロンプトが設定されていません。');
      }
      const prompt = mapContestPrompt(promptRow);
      const sessionId = randomUUID();
      const startedAt = now.toISOString();
      await tx.session.create({
        data: {
          id: sessionId,
          userId: options.userId,
          contestId: options.contestId,
          promptId: prompt.id,
          startedAt: now,
          status: 'RUNNING'
        }
      });
      const updatedEntry = await tx.entry.update({
        where: { id: entry.id },
        data: {
          attemptsUsed: {
            increment: 1
          },
          lastAttemptAt: now
        },
        select: { attemptsUsed: true }
      });
      const attemptsUsed = updatedEntry.attemptsUsed;
      const attemptsRemaining = remainingAttempts(contest, { attemptsUsed });
      return {
        sessionId,
        contestId: options.contestId,
        prompt,
        startedAt,
        attemptsUsed,
        attemptsRemaining
      } satisfies StartSessionResult;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead
    });
    return result;
  }

  async finishSession(options: FinishSessionOptions): Promise<FinishSessionResult> {
    const now = options.now ?? new Date();
    const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const sessionRow = await tx.session.findUnique({
        where: { id: options.sessionId }
      });
      if (!sessionRow || sessionRow.userId !== options.userId) {
        throw new NotFoundError('セッションが見つかりません。');
      }
      if (sessionRow.status !== 'RUNNING') {
        throw new ConflictError('このセッションはすでに完了処理が行われています。');
      }
      const contestRow = await tx.contest.findUnique({ where: { id: sessionRow.contestId } });
      if (!contestRow) {
        throw new NotFoundError('コンテスト情報が見つかりません。');
      }
      const contest = mapContest(contestRow);
      const entryRow = await tx.entry.findUnique({
        where: {
          userId_contestId: {
            userId: options.userId,
            contestId: sessionRow.contestId
          }
        }
      });
      if (!entryRow) {
        throw new NotFoundError('エントリー情報が見つかりません。');
      }
      const entry = mapEntry(entryRow);
      const promptRow = await tx.prompt.findUnique({ where: { id: sessionRow.promptId } });
      if (!promptRow) {
        throw new NotFoundError('プロンプト情報が見つかりません。');
      }
      const evaluation = evaluateSessionFinish({
        contest,
        prompt: { typingTarget: promptRow.typingTarget },
        payload: options.payload,
        entry: { attemptsUsed: entry.attemptsUsed },
        now
      });
      const normalized = normalizeStats(evaluation.stats);
      const endedAt = now;
      await tx.session.update({
        where: { id: sessionRow.id },
        data: {
          status: toSessionStatus(evaluation.status),
          endedAt,
          cpm: normalized.cpm,
          wpm: normalized.wpm,
          accuracy: normalized.accuracy,
          errors: normalized.errors,
          score: normalized.score,
          defocusCount: evaluation.flags.defocus,
          pasteBlocked: evaluation.flags.pasteBlocked,
          anomalyScore: evaluation.flags.anomalyScore ?? null,
          dqReason: evaluation.status === 'dq' ? evaluation.issues.join(',') : null
        }
      });
      await replaceKeystrokes(tx, sessionRow.id, options.payload.keylog ?? []);
      await tx.entry.update({
        where: { id: entry.id },
        data: {
          lastAttemptAt: endedAt
        }
      });
      let bestUpdated = false;
      if (evaluation.status === 'finished' && isBetterScore(entry, evaluation.stats)) {
        await tx.entry.update({
          where: { id: entry.id },
          data: {
            bestScore: normalized.score,
            bestCpm: normalized.cpm,
            bestAccuracy: normalized.accuracy
          }
        });
        bestUpdated = true;
      }
      return {
        ...evaluation,
        bestUpdated,
        attemptsUsed: entry.attemptsUsed
      } satisfies FinishSessionResult;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead
    });
    return result;
  }

  async getLeaderboard(contestId: string, limit = 100): Promise<LeaderboardSession[]> {
    const sessions = await this.prisma.session.findMany({
      where: {
        contestId,
        status: 'FINISHED'
      },
      orderBy: [
        { score: 'desc' },
        { accuracy: 'desc' },
        { cpm: 'desc' },
        { endedAt: 'asc' }
      ],
      take: limit,
      include: {
        user: {
          select: {
            username: true
          }
        }
      }
    });
    if (sessions.length === 0) {
      return [];
    }
    return sessions.map(toLeaderboardSession);
  }
}
