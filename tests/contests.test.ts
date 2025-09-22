import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import type {
  Contest as PrismaContest,
  ContestLanguage as PrismaContestLanguage,
  ContestVisibility as PrismaContestVisibility,
  LeaderboardVisibility as PrismaLeaderboardVisibility,
  Prompt as PrismaPrompt,
  PrismaClient
} from '@prisma/client';

import { buildServer } from '../src/server/buildServer.js';
import type { ServerConfig } from '../src/server/config.js';
import type { ServerDependencies } from '../src/server/dependencies.js';
import type { AuthService } from '../src/server/services/authService.js';
import type { TypingStore } from '../src/services/typingStore.js';

const testConfig: ServerConfig = {
  env: 'test',
  port: 0,
  host: '127.0.0.1',
  jwtSecret: 'get_contest_route_secret',
  refreshTokenTtlSec: 3600,
  corsOrigins: undefined,
  socketCorsOrigins: undefined
};

type PromptRecord = {
  id: string;
  displayText: string;
  typingTarget: string;
  language: PrismaContestLanguage;
};

type ContestPromptSeed = {
  promptId: string;
  orderIndex?: number;
};

type CreateServerOptions = {
  contest?: PrismaContest | null;
  prompts?: PromptRecord[];
  contestPrompts?: ContestPromptSeed[];
  sessions?: Array<{ id: string; contestId: string; promptId?: string }>;
  entries?: Array<{ id: string; contestId: string }>;
  keystrokes?: Array<{ id: number; sessionId: string }>;
};

type ContestPromptRecord = {
  contestId: string;
  promptId: string;
  orderIndex: number;
  prompt: PromptRecord;
};

type DependencyStubs = {
  getContestPrompts: () => ContestPromptRecord[];
  getSessions: () => Array<{ id: string; contestId: string; promptId?: string }>;
  getEntries: () => Array<{ id: string; contestId: string }>;
  getKeystrokes: () => Array<{ id: number; sessionId: string }>;
  getContest: () => PrismaContest | null;
  getPrompts: () => PromptRecord[];
};

function buildContestRecord(overrides: Partial<PrismaContest> = {}): PrismaContest {
  const now = Date.now();
  const baseStartsAt = new Date(now - 60_000);
  const baseEndsAt = new Date(now + 60_000);
  const base: PrismaContest = {
    id: '68166faa-6fb1-441a-bd9c-b59151a70ac5',
    title: '秋の腕試し',
    description: '秋のタイピング腕試しコンテスト',
    visibility: 'PRIVATE' as PrismaContestVisibility,
    joinCode: 'JOIN-CODE',
    startsAt: baseStartsAt,
    endsAt: baseEndsAt,
    timezone: 'Asia/Tokyo',
    timeLimitSec: 60,
    allowBackspace: false,
    leaderboardVisibility: 'DURING' as PrismaLeaderboardVisibility,
    language: 'ROMAJI' as PrismaContestLanguage,
    createdBy: 'creator-user-id',
    createdAt: new Date(now - 86_400_000)
  };
  return { ...base, ...overrides };
}

function buildPromptRecord(overrides: Partial<PromptRecord> = {}): PromptRecord {
  const base: PromptRecord = {
    id: '11111111-1111-4111-8111-111111111111',
    displayText: '今日は良い天気です',
    typingTarget: 'kyouhayiitenkidesu',
    language: 'ROMAJI' as PrismaContestLanguage
  };
  return { ...base, ...overrides };
}

function createDependencies(options: CreateServerOptions) {
  let contestRecord = options.contest ?? null;
  const promptCatalog = new Map<string, PromptRecord>();
  for (const prompt of options.prompts ?? []) {
    promptCatalog.set(prompt.id, prompt);
  }
  const promptRecords = new Map<string, PromptRecord>(promptCatalog);
  let contestPromptRecords: ContestPromptRecord[] = [];
  let sessionRecords = options.sessions ? [...options.sessions] : [];
  let entryRecords = options.entries ? [...options.entries] : [];
  let keystrokeRecords = options.keystrokes ? [...options.keystrokes] : [];
  if (contestRecord && options.contestPrompts) {
    contestPromptRecords = options.contestPrompts.map((seed, index) => {
      const prompt = promptRecords.get(seed.promptId);
      if (!prompt) {
        throw new Error(`Prompt ${seed.promptId} is not registered in catalog`);
      }
      return {
        contestId: contestRecord.id,
        promptId: seed.promptId,
        orderIndex: seed.orderIndex ?? index,
        prompt
      } satisfies ContestPromptRecord;
    });
  }
  const prismaStub = {
    async $transaction<T>(handler: (tx: typeof prismaStub) => Promise<T>): Promise<T> {
      return handler(this as unknown as typeof prismaStub);
    },
    async $disconnect() {
      // noop for tests
    },
    contest: {
      async findUnique(args: { where: { id: string }; include?: { prompts?: boolean | { include: { prompt: true }; orderBy?: { orderIndex: 'asc' | 'desc' } } } }) {
        if (!contestRecord) return null;
        if (args.where.id !== contestRecord.id) return null;
        if (args.include?.prompts) {
          const prompts = contestPromptRecords
            .filter((record) => record.contestId === contestRecord.id)
            .map((record) => ({
              contestId: record.contestId,
              promptId: record.promptId,
              orderIndex: record.orderIndex,
              prompt: record.prompt
            }));
          return { ...contestRecord, prompts };
        }
        return contestRecord;
      },
      async findMany() {
        return contestRecord ? [contestRecord] : [];
      },
      async create() {
        throw new Error('contest.create should not be invoked in these tests');
      },
      async update() {
        throw new Error('contest.update should not be invoked in these tests');
      },
      async delete({ where }: { where: { id: string } }) {
        if (!contestRecord || contestRecord.id !== where.id) {
          throw new Error('contest.delete should target existing contest in tests');
        }
        contestRecord = null;
        return { id: where.id } as PrismaContest;
      }
    },
    contestPrompt: {
      async deleteMany({ where }: { where: { contestId?: string; promptId?: string } }) {
        const before = contestPromptRecords.length;
        contestPromptRecords = contestPromptRecords.filter((record) => {
          if (where.contestId && record.contestId === where.contestId) {
            return false;
          }
          if (where.promptId && record.promptId === where.promptId) {
            return false;
          }
          return true;
        });
        return { count: before - contestPromptRecords.length };
      },
      async createMany({ data }: { data: Array<{ contestId: string; promptId: string; orderIndex?: number }> }) {
        for (const [index, item] of data.entries()) {
          const prompt = promptRecords.get(item.promptId);
          if (!prompt) {
            throw new Error(`Prompt ${item.promptId} is not registered in catalog`);
          }
          contestPromptRecords.push({
            contestId: item.contestId,
            promptId: item.promptId,
            orderIndex: item.orderIndex ?? index,
            prompt
          });
        }
        return { count: data.length };
      }
    },
    prompt: {
      async findUnique({ where }: { where: { id: string } }) {
        return promptRecords.get(where.id) ?? null;
      },
      async delete({ where }: { where: { id: string } }) {
        const existing = promptRecords.get(where.id);
        if (!existing) {
          throw new Error('prompt.delete should target existing prompt in tests');
        }
        promptRecords.delete(where.id);
        return existing as unknown as PrismaPrompt;
      }
    },
    entry: {
      async count() {
        return entryRecords.length;
      },
      async deleteMany({ where }: { where: { contestId: string } }) {
        const before = entryRecords.length;
        entryRecords = entryRecords.filter((entry) => entry.contestId !== where.contestId);
        return { count: before - entryRecords.length };
      }
    },
    session: {
      async count(args?: { where?: { contestId?: string; promptId?: string } }) {
        const contestId = args?.where?.contestId;
        const promptId = args?.where?.promptId;
        return sessionRecords.filter((session) => {
          if (contestId && session.contestId !== contestId) return false;
          if (promptId && session.promptId !== promptId) return false;
          return true;
        }).length;
      },
      async findMany(args: { where: { contestId: string }; select: { id: true } }) {
        const { where } = args;
        return sessionRecords
          .filter((session) => session.contestId === where.contestId)
          .map((session) => ({ id: session.id }));
      },
      async deleteMany({ where }: { where: { contestId: string } }) {
        const before = sessionRecords.length;
        const removed = sessionRecords.filter((session) => session.contestId === where.contestId);
        sessionRecords = sessionRecords.filter((session) => session.contestId !== where.contestId);
        if (removed.length > 0) {
          const removedIds = new Set(removed.map((session) => session.id));
          keystrokeRecords = keystrokeRecords.filter((record) => !removedIds.has(record.sessionId));
        }
        return { count: before - sessionRecords.length };
      }
    },
    keystroke: {
      async deleteMany({ where }: { where: { sessionId: { in: string[] } } }) {
        const before = keystrokeRecords.length;
        const targets = new Set(where.sessionId.in);
        keystrokeRecords = keystrokeRecords.filter((record) => !targets.has(record.sessionId));
        return { count: before - keystrokeRecords.length };
      }
    }
  } as const;

  const storeStub = {
    async startSession() {
      throw new Error('startSession should not be invoked in these tests');
    },
    async finishSession() {
      throw new Error('finishSession should not be invoked in these tests');
    },
    async appendSessionPrompt() {
      throw new Error('appendSessionPrompt should not be invoked in these tests');
    },
    async getLeaderboard() {
      return [];
    },
    async createUser() {
      throw new Error('createUser should not be invoked in these tests');
    },
    async findUserByEmail() {
      return null;
    },
    async findUserById() {
      return null;
    }
  };

  const authStub = {
    async hashPassword() {
      throw new Error('hashPassword should not be invoked in these tests');
    },
    async verifyPassword() {
      throw new Error('verifyPassword should not be invoked in these tests');
    },
    async issueRefreshToken() {
      throw new Error('issueRefreshToken should not be invoked in these tests');
    },
    async rotateRefreshToken() {
      return null;
    },
    async revokeRefreshToken() {
      // noop
    },
    async revokeAll() {
      // noop
    }
  };

  const dependencies: ServerDependencies = {
    prisma: prismaStub as unknown as PrismaClient,
    store: storeStub as unknown as TypingStore,
    auth: authStub as unknown as AuthService
  };

  const stubs: DependencyStubs = {
    getContestPrompts: () => contestPromptRecords.map((record) => ({ ...record, prompt: { ...record.prompt } })),
    getSessions: () => sessionRecords.map((record) => ({ ...record })),
    getEntries: () => entryRecords.map((record) => ({ ...record })),
    getKeystrokes: () => keystrokeRecords.map((record) => ({ ...record })),
    getContest: () => (contestRecord ? { ...contestRecord } : null),
    getPrompts: () => Array.from(promptRecords.values()).map((prompt) => ({ ...prompt }))
  };

  return { dependencies, stubs };
}

async function createTestServer(t: TestContext, options: CreateServerOptions) {
  const { dependencies, stubs } = createDependencies(options);
  const server = await buildServer({ config: testConfig, dependencies });
  t.after(async () => {
    await server.close();
  });
  return { server, stubs };
}

test('GET /api/v1/contests/:id は認証なしでもコンテスト詳細を返す', async (t) => {
  const contest = buildContestRecord();
  const { server } = await createTestServer(t, { contest });

  const response = await server.inject({
    method: 'GET',
    url: `/api/v1/contests/${contest.id}`
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json() as { contest: unknown };
  const contestPayload = payload.contest as Record<string, unknown>;
  assert.equal(contestPayload.id, contest.id);
  assert.equal(contestPayload.title, contest.title);
  assert.equal(contestPayload.visibility, 'private');
  assert.equal(contestPayload.language, 'romaji');
  assert.equal(contestPayload.status, 'running');
  assert.ok(!Object.hasOwn(contestPayload, 'joinCode'));
});

test('GET /api/v1/contests/:id は管理者に参加コードを含めて返す', async (t) => {
  const contest = buildContestRecord();
  const { server } = await createTestServer(t, { contest });
  const adminToken = server.jwt.sign({ userId: 'admin-user', role: 'admin' });

  const response = await server.inject({
    method: 'GET',
    url: `/api/v1/contests/${contest.id}`,
    headers: {
      authorization: `Bearer ${adminToken}`
    }
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json() as { contest: unknown };
  const contestPayload = payload.contest as Record<string, unknown>;
  assert.equal(contestPayload.joinCode, contest.joinCode);
});

test('GET /api/v1/contests/:id は作成者にも参加コードを含めて返す', async (t) => {
  const creatorId = 'creator-user-id';
  const contest = buildContestRecord({ createdBy: creatorId });
  const { server } = await createTestServer(t, { contest });
  const creatorToken = server.jwt.sign({ userId: creatorId, role: 'user' });

  const response = await server.inject({
    method: 'GET',
    url: `/api/v1/contests/${contest.id}`,
    headers: {
      authorization: `Bearer ${creatorToken}`
    }
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json() as { contest: unknown };
  const contestPayload = payload.contest as Record<string, unknown>;
  assert.equal(contestPayload.joinCode, contest.joinCode);
});

test('GET /api/v1/contests/:id は存在しない場合 404 を返す', async (t) => {
  const { server } = await createTestServer(t, { contest: null });

  const response = await server.inject({
    method: 'GET',
    url: '/api/v1/contests/68166faa-6fb1-441a-bd9c-b59151a70ac5'
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { message: 'コンテストが見つかりません。' });
});

test('GET /api/v1/contests/:id は不正なトークンで 401 を返す', async (t) => {
  const contest = buildContestRecord();
  const { server } = await createTestServer(t, { contest });

  const response = await server.inject({
    method: 'GET',
    url: `/api/v1/contests/${contest.id}`,
    headers: {
      authorization: 'Bearer invalid-token'
    }
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { message: '認証に失敗しました。' });
});

test('DELETE /api/v1/contests/:id は関連レコードごとコンテストを削除する', async (t) => {
  const contest = buildContestRecord();
  const prompt = buildPromptRecord({ id: '22222222-2222-4222-8222-222222222222' });
  const sessionId = 'session-1';
  const entryId = 'entry-1';
  const { server, stubs } = await createTestServer(t, {
    contest,
    prompts: [prompt],
    contestPrompts: [{ promptId: prompt.id }],
    sessions: [{ id: sessionId, contestId: contest.id }],
    entries: [{ id: entryId, contestId: contest.id }],
    keystrokes: [{ id: 1, sessionId }]
  });
  const adminToken = server.jwt.sign({ userId: 'admin-user', role: 'admin' });

  const response = await server.inject({
    method: 'DELETE',
    url: `/api/v1/contests/${contest.id}`,
    headers: {
      authorization: `Bearer ${adminToken}`
    }
  });

  assert.equal(response.statusCode, 204);
  assert.equal(stubs.getContest(), null);
  assert.equal(stubs.getContestPrompts().length, 0);
  assert.equal(stubs.getSessions().length, 0);
  assert.equal(stubs.getEntries().length, 0);
  assert.equal(stubs.getKeystrokes().length, 0);
});

test('DELETE /api/v1/contests/:id は存在しない場合 404 を返す', async (t) => {
  const { server } = await createTestServer(t, { contest: null });
  const adminToken = server.jwt.sign({ userId: 'admin-user', role: 'admin' });

  const response = await server.inject({
    method: 'DELETE',
    url: '/api/v1/contests/68166faa-6fb1-441a-bd9c-b59151a70ac5',
    headers: {
      authorization: `Bearer ${adminToken}`
    }
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { message: 'コンテストが見つかりません。' });
});

test('DELETE /api/v1/prompts/:id は紐付けを解除してプロンプトを削除する', async (t) => {
  const contest = buildContestRecord();
  const prompt = buildPromptRecord({ id: '77777777-7777-4777-8777-777777777777' });
  const { server, stubs } = await createTestServer(t, {
    contest,
    prompts: [prompt],
    contestPrompts: [{ promptId: prompt.id }],
    sessions: [],
    entries: [],
    keystrokes: []
  });
  const adminToken = server.jwt.sign({ userId: 'admin-user', role: 'admin' });

  const response = await server.inject({
    method: 'DELETE',
    url: `/api/v1/prompts/${prompt.id}`,
    headers: {
      authorization: `Bearer ${adminToken}`
    }
  });

  assert.equal(response.statusCode, 204);
  assert.equal(stubs.getPrompts().length, 0);
  assert.equal(stubs.getContestPrompts().length, 0);
});

test('DELETE /api/v1/prompts/:id は使用中の場合 409 を返す', async (t) => {
  const contest = buildContestRecord();
  const prompt = buildPromptRecord({ id: '88888888-8888-4888-8888-888888888888' });
  const { server } = await createTestServer(t, {
    contest,
    prompts: [prompt],
    contestPrompts: [{ promptId: prompt.id }],
    sessions: [{ id: 'session-using', contestId: contest.id, promptId: prompt.id }],
    entries: [],
    keystrokes: []
  });
  const adminToken = server.jwt.sign({ userId: 'admin-user', role: 'admin' });

  const response = await server.inject({
    method: 'DELETE',
    url: `/api/v1/prompts/${prompt.id}`,
    headers: {
      authorization: `Bearer ${adminToken}`
    }
  });

  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.json(), { message: 'このプロンプトは既存のセッションで使用されているため削除できません。' });
});

test('GET /api/v1/contests/:id/prompts は管理者に紐付けプロンプトを返す', async (t) => {
  const contest = buildContestRecord();
  const promptA = buildPromptRecord({ id: '22222222-2222-4222-8222-222222222222', displayText: 'A', typingTarget: 'a' });
  const promptB = buildPromptRecord({ id: '33333333-3333-4333-8333-333333333333', displayText: 'B', typingTarget: 'bb' });
  const { server } = await createTestServer(t, {
    contest,
    prompts: [promptA, promptB],
    contestPrompts: [
      { promptId: promptA.id, orderIndex: 2 },
      { promptId: promptB.id, orderIndex: 5 }
    ]
  });
  const adminToken = server.jwt.sign({ userId: 'admin-user', role: 'admin' });

  const response = await server.inject({
    method: 'GET',
    url: `/api/v1/contests/${contest.id}/prompts`,
    headers: {
      authorization: `Bearer ${adminToken}`
    }
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json() as { prompts: Array<Record<string, unknown>> };
  assert.equal(payload.prompts.length, 2);
  assert.deepEqual(payload.prompts[0], {
    promptId: promptA.id,
    displayText: promptA.displayText,
    typingTarget: promptA.typingTarget,
    language: 'romaji',
    orderIndex: 2
  });
  assert.deepEqual(payload.prompts[1], {
    promptId: promptB.id,
    displayText: promptB.displayText,
    typingTarget: promptB.typingTarget,
    language: 'romaji',
    orderIndex: 5
  });
});

test('GET /api/v1/contests/:id/prompts は作成者にも返す', async (t) => {
  const creatorId = 'creator-user-id';
  const contest = buildContestRecord({ createdBy: creatorId });
  const prompt = buildPromptRecord({ id: '44444444-4444-4444-8444-444444444444' });
  const { server } = await createTestServer(t, {
    contest,
    prompts: [prompt],
    contestPrompts: [{ promptId: prompt.id }]
  });
  const creatorToken = server.jwt.sign({ userId: creatorId, role: 'user' });

  const response = await server.inject({
    method: 'GET',
    url: `/api/v1/contests/${contest.id}/prompts`,
    headers: {
      authorization: `Bearer ${creatorToken}`
    }
  });

  assert.equal(response.statusCode, 200);
  const payload = response.json() as { prompts: Array<Record<string, unknown>> };
  assert.equal(payload.prompts.length, 1);
  assert.equal(payload.prompts[0]?.promptId, prompt.id);
});

test('GET /api/v1/contests/:id/prompts はトークン無しで 401', async (t) => {
  const contest = buildContestRecord();
  const prompt = buildPromptRecord({ id: '55555555-5555-4555-8555-555555555555' });
  const { server } = await createTestServer(t, {
    contest,
    prompts: [prompt],
    contestPrompts: [{ promptId: prompt.id }]
  });

  const response = await server.inject({
    method: 'GET',
    url: `/api/v1/contests/${contest.id}/prompts`
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { message: '認証に失敗しました。' });
});

test('GET /api/v1/contests/:id/prompts は無権限ユーザーで 403', async (t) => {
  const contest = buildContestRecord();
  const prompt = buildPromptRecord({ id: '66666666-6666-4666-8666-666666666666' });
  const { server } = await createTestServer(t, {
    contest,
    prompts: [prompt],
    contestPrompts: [{ promptId: prompt.id }]
  });
  const anotherUserToken = server.jwt.sign({ userId: 'someone-else', role: 'user' });

  const response = await server.inject({
    method: 'GET',
    url: `/api/v1/contests/${contest.id}/prompts`,
    headers: {
      authorization: `Bearer ${anotherUserToken}`
    }
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { message: 'このコンテストの問題を編集する権限がありません。' });
});

test('POST /api/v1/contests/:id/prompts は作成者が既存セットを置き換えられる', async (t) => {
  const creatorId = 'creator-user-id';
  const contest = buildContestRecord({ createdBy: creatorId });
  const promptA = buildPromptRecord({ id: '22222222-2222-4222-8222-222222222222', displayText: 'A', typingTarget: 'a' });
  const promptB = buildPromptRecord({ id: '33333333-3333-4333-8333-333333333333', displayText: 'B', typingTarget: 'bb' });
  const promptC = buildPromptRecord({ id: '44444444-4444-4444-8444-444444444444', displayText: 'C', typingTarget: 'ccc' });
  const { server, stubs } = await createTestServer(t, {
    contest,
    prompts: [promptA, promptB, promptC],
    contestPrompts: [{ promptId: promptA.id, orderIndex: 0 }]
  });
  const creatorToken = server.jwt.sign({ userId: creatorId, role: 'user' });

  const response = await server.inject({
    method: 'POST',
    url: `/api/v1/contests/${contest.id}/prompts`,
    headers: {
      authorization: `Bearer ${creatorToken}`
    },
    payload: {
      prompts: [
        { promptId: promptB.id, orderIndex: 3 },
        { promptId: promptC.id }
      ]
    }
  });

  assert.equal(response.statusCode, 204);
  const currentPrompts = stubs.getContestPrompts();
  assert.equal(currentPrompts.length, 2);
  assert.deepEqual(currentPrompts.map((record) => ({ promptId: record.promptId, orderIndex: record.orderIndex })), [
    { promptId: promptB.id, orderIndex: 3 },
    { promptId: promptC.id, orderIndex: 1 }
  ]);
});

test('POST /api/v1/contests/:id/prompts は管理者も利用できる', async (t) => {
  const contest = buildContestRecord();
  const promptA = buildPromptRecord({ id: '22222222-2222-4222-8222-222222222222' });
  const promptB = buildPromptRecord({ id: '33333333-3333-4333-8333-333333333333' });
  const { server, stubs } = await createTestServer(t, {
    contest,
    prompts: [promptA, promptB],
    contestPrompts: []
  });
  const adminToken = server.jwt.sign({ userId: 'admin-user', role: 'admin' });

  const response = await server.inject({
    method: 'POST',
    url: `/api/v1/contests/${contest.id}/prompts`,
    headers: {
      authorization: `Bearer ${adminToken}`
    },
    payload: {
      prompts: [
        { promptId: promptA.id },
        { promptId: promptB.id, orderIndex: 10 }
      ]
    }
  });

  assert.equal(response.statusCode, 204);
  const currentPrompts = stubs.getContestPrompts();
  assert.deepEqual(currentPrompts.map((record) => record.promptId), [promptA.id, promptB.id]);
});

test('POST /api/v1/contests/:id/prompts は無権限ユーザーで 403', async (t) => {
  const contest = buildContestRecord();
  const promptA = buildPromptRecord({ id: '22222222-2222-4222-8222-222222222222' });
  const promptB = buildPromptRecord({ id: '33333333-3333-4333-8333-333333333333' });
  const { server, stubs } = await createTestServer(t, {
    contest,
    prompts: [promptA, promptB],
    contestPrompts: [{ promptId: promptA.id }]
  });
  const otherUserToken = server.jwt.sign({ userId: 'other-user', role: 'user' });

  const response = await server.inject({
    method: 'POST',
    url: `/api/v1/contests/${contest.id}/prompts`,
    headers: {
      authorization: `Bearer ${otherUserToken}`
    },
    payload: {
      prompts: [{ promptId: promptB.id }]
    }
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), { message: 'このコンテストの問題を編集する権限がありません。' });
  const currentPrompts = stubs.getContestPrompts();
  assert.equal(currentPrompts.length, 1);
  assert.equal(currentPrompts[0]?.promptId, promptA.id);
});

test('POST /api/v1/contests/:id/prompts はトークン無しで 401', async (t) => {
  const contest = buildContestRecord();
  const prompt = buildPromptRecord({ id: '77777777-7777-4777-8777-777777777777' });
  const { server } = await createTestServer(t, {
    contest,
    prompts: [prompt],
    contestPrompts: []
  });

  const response = await server.inject({
    method: 'POST',
    url: `/api/v1/contests/${contest.id}/prompts`,
    payload: {
      prompts: [{ promptId: prompt.id }]
    }
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { message: '認証に失敗しました。' });
});

test('POST /api/v1/contests/:id/prompts は存在しないコンテストで 404', async (t) => {
  const prompt = buildPromptRecord({ id: '88888888-8888-4888-8888-888888888888' });
  const { server } = await createTestServer(t, {
    contest: null,
    prompts: [prompt]
  });
  const adminToken = server.jwt.sign({ userId: 'admin-user', role: 'admin' });

  const response = await server.inject({
    method: 'POST',
    url: '/api/v1/contests/68166faa-6fb1-441a-bd9c-b59151a70ac5/prompts',
    headers: {
      authorization: `Bearer ${adminToken}`
    },
    payload: {
      prompts: [{ promptId: prompt.id }]
    }
  });

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.json(), { message: 'コンテストが見つかりません。' });
});
