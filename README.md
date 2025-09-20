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
