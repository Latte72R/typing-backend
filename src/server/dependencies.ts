import { PrismaClient } from '@prisma/client';

import { TypingStore } from '../services/typingStore.js';
import type { ServerConfig } from './config.js';
import { AuthService } from './services/authService.js';

export interface ServerDependencies {
  prisma: PrismaClient;
  store: TypingStore;
  auth: AuthService;
}

export function createDependencies(config: ServerConfig): ServerDependencies {
  const prisma = new PrismaClient();
  const store = new TypingStore(prisma);
  const auth = new AuthService(prisma, config.refreshTokenTtlSec);
  return { prisma, store, auth };
}
