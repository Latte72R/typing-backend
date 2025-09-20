## typing-backend

e-typing 風タイピングゲームのバックエンドです。ドメインロジックと Fastify + Socket.IO + Prisma 製 API サーバーを提供します。詳細仕様・画面要件は `AGENTS.md` を参照してください。

## 必要環境

- Node.js 20 LTS
- PostgreSQL（`DATABASE_URL` で指定）

## セットアップ

```
npm install
npx prisma generate
npx prisma migrate deploy   # 初回は DB マイグレーションを適用
```

`.env` の例:
```
DATABASE_URL=postgres://user:pass@localhost:5432/typing
JWT_SECRET=change-me-please
PORT=3000
HOST=0.0.0.0
CORS_ORIGIN=http://localhost:5173
```

## Docker を利用したデータベースの起動

このリポジトリには PostgreSQL 16 (Alpine) ベースの Docker イメージを構築するための `Dockerfile` が含まれています。開発用途でローカルの
データベースを簡単に用意したい場合に利用してください。

### 1. イメージのビルド

```
docker build -t typing-backend-db .
```

### 2. 環境変数の準備

コンテナ起動時に利用するデータベース名・ユーザー名・パスワードを `.env.db` などのファイルで定義します。Dockerfile には開発向けの
デフォルト値（`typing` ユーザー／データベース／パスワード）が設定されていますが、以下のように上書きすることもできます。

```
POSTGRES_DB=typing
POSTGRES_USER=typing
POSTGRES_PASSWORD=typing
```

### 3. コンテナの起動

永続化用ボリュームを作成し、ポート 5432 をホストに公開した状態で PostgreSQL を起動します。

```
docker volume create typing-backend-db-data
docker run --name typing-backend-db \
  --env-file .env.db \
  -p 5432:5432 \
  -v typing-backend-db-data:/var/lib/postgresql/data \
  typing-backend-db
```

コンテナが起動したら、アプリケーション側の `DATABASE_URL` を `postgres://<ユーザー>:<パスワード>@localhost:5432/<データベース>` に設定
すれば接続できます。

### 4. 終了とログ確認

```
docker stop typing-backend-db
docker start typing-backend-db    # 再開
docker logs -f typing-backend-db  # ログを監視
```

ボリューム (`typing-backend-db-data`) を削除しない限り、データベースの内容は保持されます。

## 起動

```
npm run dev                # 開発モード（ts-node）
npm run build && npm start # 本番ビルド → 実行
```

## テスト・Lint

```
npm test
npm run lint
```

## 主なディレクトリ

- `src/domain/` — スコア計算やセッション検算などの純粋関数
- `src/services/` — Prisma 経由のドメインサービス
- `src/server/` — Fastify ルータ・認証・Socket.IO
- `prisma/` — スキーマ定義
- `tests/` — node:test ベースの単体テスト
