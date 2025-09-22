## typing-backend

e-typing 風タイピングゲームのバックエンドです。ドメインロジックと Fastify + Socket.IO + Prisma 製 API サーバーを提供します。詳細仕様・画面要件は `AGENTS.md` を参照してください。

## 必要環境

- Node.js 20 LTS
- PostgreSQL（`DATABASE_URL` で指定）

## セットアップ

1. 依存関係をインストール
   ```bash
   npm install
   ```
2. 環境変数を設定（例）
   ```
   DATABASE_URL=postgres://user:pass@localhost:5432/typing
   JWT_SECRET=change-me-please
   PORT=3000
   HOST=0.0.0.0
   CORS_ORIGIN=http://localhost:5173
   ADMIN_USERNAME=admin           # 省略時は "admin"
   ADMIN_EMAIL=admin@example.com  # 省略時は "admin@example.com"
   ADMIN_PASSWORD=change-me       # 省略時は "change-me"
   ```
   - マイグレーション適用時に管理者ユーザーが存在しない場合、自動で `ADMIN_*` の値を使って1件作成します。
   - パスワードは初期化直後に必ず変更してください。
3. Prisma Client を生成
  ```bash
  npx prisma generate
  ```
  - サーバー起動時に `src/db/migrations.ts` が自動で実行され、テーブルが存在しない場合は作成されます。
  - 管理者ユーザーが存在しない場合は `ADMIN_*` の環境変数を元に1件自動作成されます。
  - Prisma のスキーマを変更した際は、必要に応じて `npx prisma migrate dev` などでマイグレーションファイルを作成してください。
4. （任意）サンプルプロンプトを投入
   ```bash
   npm run seed:prompts
   ```
   - 果物・野菜・花の日本語表示とローマ字キー列をまとめて登録します。重複は自動でスキップされます。

## Docker で PostgreSQL を使う

1. イメージをビルド
   ```bash
   docker build -t typing-backend-db .
   ```
2. 環境変数ファイルを用意（例）
   ```
   POSTGRES_DB=typing
   POSTGRES_USER=typing
   POSTGRES_PASSWORD=typing
   ```
3. ボリューム作成とコンテナ起動
   ```bash
   docker volume create typing-backend-db-data
   docker run --name typing-backend-db \
     --env-file .env.db \
     -p 5432:5432 \
     -v typing-backend-db-data:/var/lib/postgresql/data \
     typing-backend-db
   ```
   - `DATABASE_URL` は `postgres://<ユーザー>:<パスワード>@localhost:5432/<データベース>` を指定
4. 停止・再開・ログ
   ```bash
   docker stop typing-backend-db
   docker start typing-backend-db
   docker logs -f typing-backend-db
   ```

## 起動

```bash
npm run dev                # 開発モード（ts-node）
npm run build && npm start # 本番ビルド → 実行
```

## テスト・Lint

```bash
npm test
npm run lint
```

## 主なディレクトリ

- `src/domain/` — スコア計算やセッション検算などの純粋関数
- `src/services/` — Prisma 経由のドメインサービス
- `src/server/` — Fastify ルータ・認証・Socket.IO
- `prisma/` — スキーマ定義
- `tests/` — node:test ベースの単体テスト
