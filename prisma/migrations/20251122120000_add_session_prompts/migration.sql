CREATE TABLE "session_prompts" (
  "session_id" TEXT NOT NULL REFERENCES "sessions"("id") ON DELETE CASCADE,
  "prompt_id" TEXT NOT NULL REFERENCES "prompts"("id") ON DELETE RESTRICT,
  "order_index" INTEGER NOT NULL,
  CONSTRAINT "session_prompts_pkey" PRIMARY KEY ("session_id", "order_index")
);

CREATE UNIQUE INDEX "session_prompts_session_prompt_idx"
  ON "session_prompts" ("session_id", "prompt_id");

CREATE INDEX "session_prompts_session_idx"
  ON "session_prompts" ("session_id");
