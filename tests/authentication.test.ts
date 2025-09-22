import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';

import type { PrismaClient } from '@prisma/client';

import { buildServer } from '../src/server/buildServer.js';
import type { ServerConfig } from '../src/server/config.js';
import type { ServerDependencies } from '../src/server/dependencies.js';
import type { AuthService } from '../src/server/services/authService.js';
import type { TypingStore } from '../src/services/typingStore.js';

const testConfig: ServerConfig = {
  env: 'test',
  port: 0,
  host: '127.0.0.1',
  jwtSecret: 'test_jwt_secret_for_auth_guard',
  refreshTokenTtlSec: 3600,
  corsOrigins: undefined,
  socketCorsOrigins: undefined
};

type DependencyStubs = {
  prisma: {
    contestCreateCalled: boolean;
    sessionFindUniqueCalled: boolean;
    $disconnect: () => Promise<void>;
    contest: {
      create: () => Promise<never>;
      findMany: () => Promise<[]>;
    };
    session: {
      findUnique: () => Promise<never>;
    };
  };
  store: {
    startSessionCalled: boolean;
    finishSessionCalled: boolean;
    startSession: () => Promise<never>;
    finishSession: () => Promise<never>;
    appendSessionPrompt: () => Promise<never>;
    getLeaderboard: () => Promise<[]>;
    createUser: () => Promise<never>;
    findUserByEmail: () => Promise<null>;
    findUserById: () => Promise<null>;
  };
  auth: {
    hashPassword: () => Promise<never>;
    verifyPassword: () => Promise<never>;
    issueRefreshToken: () => Promise<never>;
    rotateRefreshToken: () => Promise<null>;
    revokeRefreshToken: () => Promise<void>;
    revokeAll: () => Promise<void>;
  };
};

function createDependencyStubs(): { dependencies: ServerDependencies; stubs: DependencyStubs } {
  const stubs: DependencyStubs = {
    prisma: {
      contestCreateCalled: false,
      sessionFindUniqueCalled: false,
      async $disconnect() {
        // noop
      },
      contest: {
        async create() {
          stubs.prisma.contestCreateCalled = true;
          throw new Error('contest.create should not be invoked in authentication guard tests');
        },
        async findMany() {
          return [];
        }
      },
      session: {
        async findUnique() {
          stubs.prisma.sessionFindUniqueCalled = true;
          throw new Error('session.findUnique should not be invoked in authentication guard tests');
        }
      }
    },
    store: {
      startSessionCalled: false,
      finishSessionCalled: false,
      async startSession() {
        stubs.store.startSessionCalled = true;
        throw new Error('startSession should not be invoked in authentication guard tests');
      },
      async finishSession() {
        stubs.store.finishSessionCalled = true;
        throw new Error('finishSession should not be invoked in authentication guard tests');
      },
      async appendSessionPrompt() {
        throw new Error('appendSessionPrompt should not be invoked in authentication guard tests');
      },
      async getLeaderboard() {
        return [];
      },
      async createUser() {
        throw new Error('createUser should not be invoked in authentication guard tests');
      },
      async findUserByEmail() {
        return null;
      },
      async findUserById() {
        return null;
      }
    },
    auth: {
      async hashPassword() {
        throw new Error('hashPassword should not be invoked in authentication guard tests');
      },
      async verifyPassword() {
        throw new Error('verifyPassword should not be invoked in authentication guard tests');
      },
      async issueRefreshToken() {
        throw new Error('issueRefreshToken should not be invoked in authentication guard tests');
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
    }
  };

  const dependencies: ServerDependencies = {
    prisma: stubs.prisma as unknown as PrismaClient,
    store: stubs.store as unknown as TypingStore,
    auth: stubs.auth as unknown as AuthService
  };

  return { dependencies, stubs };
}

async function createTestServer(t: TestContext) {
  const { dependencies, stubs } = createDependencyStubs();
  const server = await buildServer({ config: testConfig, dependencies });
  t.after(async () => {
    await server.close();
  });
  return { server, stubs };
}

test('POST /api/v1/contests はトークン未付与で 401 を返す', async (t) => {
  const { server, stubs } = await createTestServer(t);
  const response = await server.inject({
    method: 'POST',
    url: '/api/v1/contests',
    payload: {
      title: 'テストコンテスト',
      description: '説明',
      visibility: 'public',
      startsAt: '2025-10-01T09:00:00+09:00',
      endsAt: '2025-10-02T09:00:00+09:00',
      timezone: 'Asia/Tokyo',
      timeLimitSec: 60,
      allowBackspace: false,
      leaderboardVisibility: 'during',
      language: 'romaji'
    }
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { message: '認証に失敗しました。' });
  assert.equal(stubs.prisma.contestCreateCalled, false);
});

test('POST /api/v1/contests は userId 欠落トークンで 401 を返す', async (t) => {
  const { server, stubs } = await createTestServer(t);
  const invalidToken = server.jwt.sign({ role: 'admin' } as any);

  const response = await server.inject({
    method: 'POST',
    url: '/api/v1/contests',
    headers: {
      authorization: `Bearer ${invalidToken}`
    },
    payload: {
      title: 'テストコンテスト',
      description: '説明',
      visibility: 'public',
      startsAt: '2025-10-01T09:00:00+09:00',
      endsAt: '2025-10-02T09:00:00+09:00',
      timezone: 'Asia/Tokyo',
      timeLimitSec: 60,
      allowBackspace: false,
      leaderboardVisibility: 'during',
      language: 'romaji'
    }
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { message: '認証に失敗しました。' });
  assert.equal(stubs.prisma.contestCreateCalled, false);
});

test('POST /api/v1/contests/:contestId/sessions はトークン未付与で 401 を返す', async (t) => {
  const { server, stubs } = await createTestServer(t);
  const response = await server.inject({
    method: 'POST',
    url: '/api/v1/contests/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/sessions'
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { message: '認証に失敗しました。' });
  assert.equal(stubs.store.startSessionCalled, false);
});

test('POST /api/v1/contests/:contestId/sessions は userId 欠落トークンで 401 を返す', async (t) => {
  const { server, stubs } = await createTestServer(t);
  const invalidToken = server.jwt.sign({ role: 'user' } as any);

  const response = await server.inject({
    method: 'POST',
    url: '/api/v1/contests/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa/sessions',
    headers: {
      authorization: `Bearer ${invalidToken}`
    }
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { message: '認証に失敗しました。' });
  assert.equal(stubs.store.startSessionCalled, false);
});
