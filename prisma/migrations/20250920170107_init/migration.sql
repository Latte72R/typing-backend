-- CreateEnum
CREATE TYPE "public"."UserRole" AS ENUM ('user', 'admin');

-- CreateEnum
CREATE TYPE "public"."ContestVisibility" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "public"."LeaderboardVisibility" AS ENUM ('during', 'after', 'hidden');

-- CreateEnum
CREATE TYPE "public"."ContestLanguage" AS ENUM ('romaji', 'english', 'kana');

-- CreateEnum
CREATE TYPE "public"."SessionStatus" AS ENUM ('running', 'finished', 'dq', 'expired');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "public"."UserRole" NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contests" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "public"."ContestVisibility" NOT NULL,
    "join_code" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    "time_limit_sec" INTEGER NOT NULL,
    "max_attempts" INTEGER NOT NULL,
    "allow_backspace" BOOLEAN NOT NULL DEFAULT false,
    "leaderboard_visibility" "public"."LeaderboardVisibility" NOT NULL,
    "language" "public"."ContestLanguage" NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."prompts" (
    "id" TEXT NOT NULL,
    "language" "public"."ContestLanguage" NOT NULL,
    "display_text" TEXT NOT NULL,
    "typing_target" TEXT NOT NULL,
    "tags" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."contest_prompts" (
    "contest_id" TEXT NOT NULL,
    "prompt_id" TEXT NOT NULL,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "contest_prompts_pkey" PRIMARY KEY ("contest_id","prompt_id")
);

-- CreateTable
CREATE TABLE "public"."entries" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "attempts_used" INTEGER NOT NULL DEFAULT 0,
    "best_score" INTEGER,
    "best_cpm" DECIMAL(10,4),
    "best_accuracy" DECIMAL(10,4),
    "last_attempt_at" TIMESTAMP(3),

    CONSTRAINT "entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "prompt_id" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "status" "public"."SessionStatus" NOT NULL,
    "cpm" DECIMAL(10,4),
    "wpm" DECIMAL(10,4),
    "accuracy" DECIMAL(10,4),
    "errors" INTEGER,
    "score" INTEGER,
    "defocus_count" INTEGER NOT NULL DEFAULT 0,
    "paste_blocked" BOOLEAN NOT NULL DEFAULT true,
    "anomaly_score" DECIMAL(10,4),
    "dq_reason" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."keystrokes" (
    "id" BIGSERIAL NOT NULL,
    "session_id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL,
    "t_ms" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,

    CONSTRAINT "keystrokes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "public"."users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE INDEX "entries_contest_best_score_idx" ON "public"."entries"("contest_id", "best_score");

-- CreateIndex
CREATE UNIQUE INDEX "entries_user_id_contest_id_key" ON "public"."entries"("user_id", "contest_id");

-- CreateIndex
CREATE INDEX "sessions_contest_score_idx" ON "public"."sessions"("contest_id", "score");

-- CreateIndex
CREATE INDEX "keystrokes_session_id_idx" ON "public"."keystrokes"("session_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_hash_idx" ON "public"."refresh_tokens"("token_hash");

-- AddForeignKey
ALTER TABLE "public"."contests" ADD CONSTRAINT "contests_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contest_prompts" ADD CONSTRAINT "contest_prompts_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."contest_prompts" ADD CONSTRAINT "contest_prompts_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."entries" ADD CONSTRAINT "entries_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."entries" ADD CONSTRAINT "entries_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_prompt_id_fkey" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."keystrokes" ADD CONSTRAINT "keystrokes_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
