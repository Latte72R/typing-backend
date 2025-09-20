export {
  calculateTypingStats,
  compareReportedStats,
  formatStats
} from './domain/scoring.js';
export type {
  TypingStats,
  ReportedStats,
  StatTolerance,
  ComparisonResult,
  FormattedStats
} from './domain/scoring.js';

export {
  getContestStatus,
  isLeaderboardVisible,
  validateSessionStart,
  requiresJoinCode,
  remainingAttempts
} from './domain/contest.js';
export type {
  Contest,
  ContestStatus,
  ContestEntry,
  ContestVisibility,
  LeaderboardVisibility,
  SessionStartValidation
} from './domain/contest.js';

export {
  replayKeylog,
  analyseIntervals,
  evaluateSessionFinish
} from './domain/session.js';
export type {
  KeylogEntry,
  ReplayResult,
  IntervalAnalysis,
  SessionFinishPayload,
  SessionFinishParams,
  SessionFinishResult
} from './domain/session.js';

export {
  buildLeaderboard,
  extractPersonalRank
} from './domain/leaderboard.js';
export type {
  LeaderboardSession,
  RankedSession,
  LeaderboardSummary,
  LeaderboardResult
} from './domain/leaderboard.js';

export {
  createPool,
  resolveDatabaseConfig,
  withTransaction
} from './db/client.js';
export type {
  DatabasePool,
  DatabaseClient,
  ResolvedDatabaseConfig
} from './db/client.js';
export { applyMigrations } from './db/migrations.js';

export {
  TypingStore,
  NotFoundError,
  ValidationError,
  ConflictError
} from './services/typingStore.js';
export type {
  UserRecord,
  CreateUserInput,
  PromptDto,
  StartSessionOptions,
  StartSessionResult,
  FinishSessionOptions,
  FinishSessionResult
} from './services/typingStore.js';

export { getServerConfig } from './server/config.js';
export { createDependencies } from './server/dependencies.js';
export { buildServer } from './server/buildServer.js';
