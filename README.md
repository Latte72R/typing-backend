## typing-backend

e-typing 風タイピングゲームのバックエンド（ドメインロジック）リポジトリです。現在は API サーバや DB には未接続で、コアとなるスコア計算・セッション検証・順位付けなどの純粋なロジックのみを提供します。全体仕様・API 仕様は `AGENTS.md` を参照してください。

- 目的: スコアリング・検算・ランキングなどのビジネスロジックを安定提供
- 将来: Fastify + PostgreSQL + Socket.IO による API/リアルタイム実装（別 PR で追加）

## 必要条件

- Node.js 20 LTS（必須）
- npm（同梱のスクリプト実行用）
- PostgreSQL（将来の API 実装時に使用。現状は不要）

## クイックスタート（ロジックの動作確認）

1) リポジトリ取得

```
git clone <your-fork-or-this-repo-url>
cd typing-backend
```

2) 依存関係インストール（現状は依存なし／npm の初期化のみ）

```
npm install
```

3) テスト実行（Node.js 標準の test ランナー）

```
npm test
```

4) 構文チェック（簡易 Lint）

```
npm run lint
```

5) REPL/ワンライナーでの関数利用例

```
node -e "import('./src/index.js').then(m=>console.log(m.calculateTypingStats(120,30,60000)))"
```

## 実装済みドメイン機能（抜粋）

- スコア計算: `calculateTypingStats`, `compareReportedStats`, `formatStats`
- コンテスト状態/公開制御: `getContestStatus`, `isLeaderboardVisible`, `validateSessionStart`, `remainingAttempts`, `requiresJoinCode`
- セッション検算・アンチチート: `replayKeylog`, `analyseIntervals`, `evaluateSessionFinish`
- リーダーボード: `buildLeaderboard`, `extractPersonalRank`

エクスポートは `src/index.js` を参照してください。

## ディレクトリ構成

```
.
├─ src/
│  ├─ domain/        # ドメインロジック（純粋関数）
│  └─ index.js       # 代表エクスポート
├─ tests/            # node:test による単体テスト
├─ scripts/lint.js   # 構文チェック（node --check）
└─ AGENTS.md         # 全体仕様・API/DB/Socket 設計
```

## 開発フロー（現段階）

- 実装: ドメインロジックは副作用を持たない関数で追加します。
- テスト: `tests/*.test.js` に追加し、`npm test` で実行します。
- Lint: `npm run lint`（構文チェック）で破壊的変更を検知します。

## 今後の API サーバ統合（予告）

このリポジトリは将来的に Fastify + Socket.IO + PostgreSQL と統合して以下を提供予定です。

- REST: `/api/v1`（認証、コンテスト、セッション、リーダーボード）
- Socket.IO: `contest:<id>:leaderboard` でランキング更新を <500ms で配信
- DB: PostgreSQL + Prisma/Knex。スキーマは `AGENTS.md` の SQL を参照

現時点で環境変数は不要ですが、API 実装時は以下が想定されます（例）。

```
# .env（予定）
NODE_ENV=development
PORT=3000
DATABASE_URL=postgres://user:pass@localhost:5432/typing
JWT_SECRET=change-me
CORS_ORIGIN=http://localhost:5173
TZ=Asia/Tokyo
```

PostgreSQL をローカル起動する簡易例（将来の開発向け）:

```
# docker compose v2 例（compose.yaml に保存して使用）
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: typing
      POSTGRES_PASSWORD: typing
      POSTGRES_DB: typing
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata: {}
```

## 仕様リファレンス

- 全体仕様・API/DB/Socket の詳細は `AGENTS.md` を参照してください。
- スコア定義（初期仕様）: `Score = floor( CPM * (Accuracy^2) / 2 )`、他は `AGENTS.md` に記載。

## トラブルシュート

- Node のバージョン不一致: `node -v` が v20 系であることを確認してください。
- `npm test` が動かない: Node 18 以下では `node --test` が未搭載です。Node 20 LTS に更新してください。

## ライセンス

- MIT（`package.json` 参照）。

---
この README は「セットアップと起動（現段階ではロジックのテスト・利用）」に焦点を当てています。API サーバ実装が追加され次第、手順を追記します。

