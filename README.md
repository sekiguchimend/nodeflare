# Nodeflare

MCPサーバーをデプロイ・管理・スケールするプラットフォーム - MCP版Vercel

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────────┐
│                         Nodeflare                               │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │   Next.js   │  │  API Server │  │     Proxy Gateway       │  │
│  │  Frontend   │──│   (Axum)    │──│   (Rate Limit, Auth)    │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
│         │                │                      │               │
│         │                │                      │               │
│  ┌──────┴────────────────┴──────────────────────┴──────────┐   │
│  │                    PostgreSQL + Redis                    │   │
│  │                    (Neon + Upstash)                      │   │
│  └──────────────────────────────────────────────────────────┘   │
│         │                                                       │
│  ┌──────┴──────┐                                               │
│  │   Builder   │───────────────────────────────────────────────┤
│  │   Worker    │         Build & Deploy                        │
│  └─────────────┘                                               │
│         │                                                       │
│  ┌──────┴──────────────────────────────────────────────────┐   │
│  │              Fly.io Machines (Container Runtime)         │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │   │
│  │  │ MCP Srv │  │ MCP Srv │  │ MCP Srv │  │ MCP Srv │    │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 技術スタック

- **Backend**: Rust (Axum, SQLx, Tokio)
- **Frontend**: Next.js 15, TypeScript, Tailwind CSS
- **Database**: [Neon](https://neon.tech) (Serverless PostgreSQL)
- **Cache/Queue**: [Upstash](https://upstash.com) (Serverless Redis)
- **Container Runtime**: Fly.io Machines
- **Job Queue**: Apalis (Redis-backed)

## プロジェクト構成

```
nodeflare/
├── crates/
│   ├── api/            # メインAPIサーバー (Axum)
│   ├── auth/           # JWT, OAuth, APIキー, 暗号化
│   ├── builder/        # ビルドワーカー (Docker, Fly.io)
│   ├── common/         # 共通型, 設定, エラー
│   ├── container/      # コンテナランタイム抽象化
│   ├── db/             # データベースモデル & マイグレーション
│   ├── github/         # GitHub App連携
│   ├── mcp-runtime/    # MCPプロトコル型
│   ├── proxy/          # MCP Proxyゲートウェイ
│   └── queue/          # ジョブ定義
├── apps/
│   └── web/            # Next.js フロントエンド
├── migrations/         # データベースマイグレーション
├── docker/             # Dockerfiles
└── infra/              # インフラ設定
```

## はじめに

### 必要なもの

- Rust 1.75+
- Node.js 20+
- Docker & Docker Compose

### ローカル開発

1. **クローンとセットアップ**

```bash
git clone https://github.com/your-org/nodeflare.git
cd nodeflare
cp .env.example .env
```

2. **Neon (PostgreSQL) のセットアップ**

- [neon.tech](https://neon.tech) でアカウント作成
- 新しいプロジェクトを作成
- 接続文字列を `.env` にコピー:
  ```
  DATABASE_URL=postgresql://user:pass@ep-xxx.region.aws.neon.tech/dbname?sslmode=require
  ```

3. **Upstash (Redis) のセットアップ**

- [upstash.com](https://upstash.com) でアカウント作成
- 新しいRedisデータベースを作成
- 接続文字列を `.env` にコピー:
  ```
  REDIS_URL=rediss://default:xxx@xxx.upstash.io:6379
  ```

4. **その他の環境変数を設定**

`.env` にGitHub OAuth、Fly.io、暗号化キーを設定（下記の設定セクション参照）

5. **データベースマイグレーション実行**

```bash
cargo install sqlx-cli
sqlx migrate run
```

6. **バックエンドサービス起動**

```bash
# Terminal 1: APIサーバー
cargo run --bin mcp-api

# Terminal 2: Proxyゲートウェイ
cargo run --bin mcp-proxy

# Terminal 3: Builderワーカー
cargo run --bin mcp-builder
```

7. **フロントエンド起動**

```bash
cd apps/web
npm install
npm run dev
```

8. **ブラウザで開く**

http://localhost:3000 にアクセス

## 設定

### 必須設定

| 変数 | 説明 |
|------|------|
| `DATABASE_URL` | PostgreSQL接続文字列 |
| `REDIS_URL` | Redis接続文字列 |
| `JWT_SECRET` | JWT署名用シークレット (64バイト以上) |
| `ENCRYPTION_KEY` | シークレット暗号化用AES-256キー (32バイト, base64) |
| `GITHUB_CLIENT_ID` | GitHub OAuth AppのクライアントID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Appのクライアントシークレット |
| `GITHUB_APP_ID` | リポジトリアクセス用GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App秘密鍵 (PEM形式) |
| `FLY_API_TOKEN` | デプロイ用Fly.io APIトークン |

### キー生成

```bash
# JWT Secret
openssl rand -base64 64

# Encryption Key
openssl rand -base64 32
```

## デプロイ

### Docker Compose (開発用)

```bash
docker-compose up -d
```

### 本番環境 (Fly.io)

```bash
# API
fly deploy -c fly.api.toml

# Proxy
fly deploy -c fly.proxy.toml

# Web
fly deploy -c fly.web.toml
```

## APIエンドポイント

### 認証
- `GET /api/v1/auth/github` - GitHub OAuth開始
- `GET /api/v1/auth/github/callback` - OAuthコールバック
- `GET /api/v1/auth/me` - 現在のユーザー取得
- `POST /api/v1/auth/refresh` - トークンリフレッシュ
- `DELETE /api/v1/auth/account` - アカウント削除

### ワークスペース
- `GET /api/v1/workspaces` - ワークスペース一覧
- `POST /api/v1/workspaces` - ワークスペース作成
- `GET /api/v1/workspaces/:id` - ワークスペース取得
- `PATCH /api/v1/workspaces/:id` - ワークスペース更新
- `DELETE /api/v1/workspaces/:id` - ワークスペース削除

### サーバー
- `GET /api/v1/workspaces/:ws_id/servers` - サーバー一覧
- `POST /api/v1/workspaces/:ws_id/servers` - サーバー作成
- `GET /api/v1/workspaces/:ws_id/servers/:id` - サーバー取得
- `PATCH /api/v1/workspaces/:ws_id/servers/:id` - サーバー更新
- `DELETE /api/v1/workspaces/:ws_id/servers/:id` - サーバー削除
- `POST /api/v1/workspaces/:ws_id/servers/:id/deploy` - デプロイ実行
- `POST /api/v1/workspaces/:ws_id/servers/:id/stop` - 停止
- `POST /api/v1/workspaces/:ws_id/servers/:id/restart` - 再起動

### ツール
- `GET /api/v1/workspaces/:ws_id/servers/:id/tools` - ツール一覧
- `PATCH /api/v1/workspaces/:ws_id/servers/:id/tools/:tool_id` - ツール更新

### APIキー
- `GET /api/v1/workspaces/:ws_id/api-keys` - APIキー一覧
- `POST /api/v1/workspaces/:ws_id/api-keys` - APIキー作成
- `DELETE /api/v1/workspaces/:ws_id/api-keys/:id` - APIキー削除

### シークレット
- `GET /api/v1/workspaces/:ws_id/servers/:id/secrets` - シークレット一覧
- `POST /api/v1/workspaces/:ws_id/servers/:id/secrets` - シークレット設定
- `DELETE /api/v1/workspaces/:ws_id/servers/:id/secrets/:key` - シークレット削除

## MCP Proxy

Proxyゲートウェイは**サブドメインベースルーティング**でMCPリクエストを処理:

```
POST https://{server-slug}.mcp.run/mcp
Authorization: Bearer {api-key}
```

例: サーバースラッグが `my-notion-mcp` の場合:
```
https://my-notion-mcp.mcp.run/mcp
```

機能:
- **サブドメインベースルーティング** - VercelのようなクリーンなURL
- APIキー認証
- レート制限 (スライディングウィンドウ)
- リクエストログ
- ツールレベルの権限管理

## ライセンス

MIT
