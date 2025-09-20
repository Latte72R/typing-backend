export type {
  DatabaseClient,
  DatabasePool,
  ResolvedDatabaseConfig
} from './db/client.js';
export {
  createPool,
  resolveDatabaseConfig,
  withTransaction
} from './db/client.js';
export { applyMigrations } from './db/migrations.js';
export type {
  Contest,
  ContestEntry,
  ContestStatus,
  ContestVisibility,
  LeaderboardVisibility,
  SessionStartValidation
} from './domain/contest.js';
export {
  getContestStatus,
  isLeaderboardVisible,
  remainingAttempts, 
  requiresJoinCode,
  validateSessionStart
} from './domain/contest.js';
export type {
  LeaderboardResult, 
  LeaderboardSession,
  LeaderboardSummary,
  RankedSession
} from './domain/leaderboard.js';

export {
  buildLeaderboard,
  extractPersonalRank
} from './domain/leaderboard.js';
export type {
  ComparisonResult,
  FormattedStats, 
  ReportedStats,
  StatTolerance,
  TypingStats
} from './domain/scoring.js';
export {
  calculateTypingStats,
  compareReportedStats,
  formatStats
} from './domain/scoring.js';
export type {
  IntervalAnalysis,
  KeylogEntry,
  ReplayResult,
  SessionFinishParams,
  SessionFinishPayload,
  SessionFinishResult
} from './domain/session.js';
export {
  analyseIntervals,
  evaluateSessionFinish, 
  replayKeylog
} from './domain/session.js';
export { buildServer } from './server/buildServer.js';
export { getServerConfig } from './server/config.js';
export { createDependencies } from './server/dependencies.js';
export type {
  CreateUserInput,
  FinishSessionOptions,
  FinishSessionResult, 
  PromptDto,
  StartSessionOptions,
  StartSessionResult,
  UserRecord
} from './services/typingStore.js';
export {
  ConflictError, 
  NotFoundError,
  TypingStore,
  ValidationError
} from './services/typingStore.js';
