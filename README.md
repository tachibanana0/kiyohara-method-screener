# Kiyohara Method Screener

清原メソッドに基づく日本株自動スクリーニング & Alpha トラッキングシステム。

## 概要

清原メソッド（割安小型成長株 × オーナー企業 × 高経営品質）に従い、東証グロース市場の全銘柄を定量スクリーニング → EDINET 有価証券報告書を LLM で定性評価 → 適合/監視の 2 段階で選定し、日次で超過収益（Alpha）をトラッキングする。

### 選定基準

**Tier 1: 清原適合**
- オーナー企業（創業者/創業家が経営支配権を保持）
- 経営スコア ≧ 50（LLM が EDINET 有報から評価）
- 実質 PER ≦ 10 倍

**Tier 2: 監視対象**
- 経営スコア ≧ 10
- 実質 PER ≦ 80 倍

## アーキテクチャ

```
GitHub Actions (平日 15:00 JST / cron)
  ├── scripts/screening.ts  ← J-Quants + EDINET + Yahoo Finance + OpenRouter LLM
  │   └── POST /api/screening/receive → Cloudflare Workers
  │
  └── scripts/tracking.ts   ← Yahoo Finance
      └── POST /api/tracking/receive → Cloudflare Workers

Cloudflare Workers (Hono v4)
  ├── GET  /api/picks            ← 選定銘柄一覧
  ├── GET  /api/tracking/:code   ← 日次トラッキングデータ
  ├── POST /api/screening/receive ← GitHub Actions からの受信
  ├── POST /api/tracking/receive  ← GitHub Actions からの受信
  └── D1 Database (kiyohara-screener-db)

Cloudflare Pages (React + Vite + Recharts)
  └── API: Workers を同一ドメインから CORS 経由で呼出
```

## 技術スタック

| 層 | 技術 | 用途 |
|----|------|------|
| バックエンド | Cloudflare Workers + Hono v4 | REST API、データ永続化 |
| データベース | Cloudflare D1 (SQLite) | 選定銘柄・トラッキング・評価キャッシュ |
| バッチ処理 | GitHub Actions + tsx | 毎日のスクリーニング・トラッキング実行 |
| フロントエンド | React 19 + Vite + Tailwind v4 + Recharts | ダッシュボード表示 |
| ホスティング | Cloudflare Pages | フロントエンド配信 |
| LLM | OpenRouter (Gemini 2.5 Flash) | 有価証券報告書の定性評価 |
| 外部 API | J-Quants v2, EDINET v2, Yahoo Finance | 株価・財務・開示書類取得 |

## セットアップ

### 前提条件
- Node.js 20+
- Cloudflare アカウント（Workers + D1 + Pages）
- GitHub アカウント（Actions 用）
- J-Quants API キー（[j-quants.com](https://j-quants.com)）
- EDINET サブスクリプションキー（[disclosure.edinet-fsa.go.jp](https://disclosure.edinet-fsa.go.jp)）
- OpenRouter API キー（[openrouter.ai](https://openrouter.ai)）

### インストール
```bash
git clone https://github.com/tachibanana0/kiyohara-method-screener.git
cd kiyohara-method-screener
npm install
cd frontend && npm install && cd ..
```

### 環境変数

`.env.example` を参考に設定：

| 変数 | 説明 |
|------|------|
| `JQUANTS_API_KEY` | J-Quants API キー |
| `EDINET_SUBSCRIPTION_KEY` | EDINET API サブスクリプションキー |
| `OPENROUTER_API_KEY` | OpenRouter API キー |
| `SCREENING_API_URL` | Worker API のベース URL |
| `SCREENING_API_TOKEN` | スクリーニング結果受信用トークン |

ローカル実行時は `.env` を作成。GitHub Actions では Secrets として設定。

### D1 データベース
```bash
# リモートにマイグレーション適用
npm run db:migrate:remote

# エクスポート（バックアップ）
npm run db:export
```

### ローカル実行
```bash
# スクリーニング
BATCH_SIZE=3 MAX_PER=30 npm run screening

# トラッキング
npm run tracking

# Worker 開発サーバー
npm run dev

# フロントエンド開発サーバー
cd frontend && npm run dev
```

### デプロイ
```bash
# Worker
npm run deploy

# フロントエンド
cd frontend && npm run build && npx wrangler pages deploy dist --project-name=kiyohara-screener --branch=main --commit-dirty=true
```

## 使用 API 詳細

### J-Quants API v2

| エンドポイント | 用途 | レート制限 |
|---------------|------|-----------|
| `/listed/info` | 全銘柄マスター取得（市場区分、33業種等） | 50 req/min (無料枠は事実上 3 req/min) |
| `/fins/statements` | 財務諸表（売上・営業利益・純利益・現金同等物・発行済株式数） | 同上 |

**制約**: 無料プランでは多くの銘柄で 403 エラーが返り、EDINET フォールバックに頼る必要がある。J-Quants v2 の equities/master には `EdinetCode` フィールドが存在しない。

### EDINET API v2

| エンドポイント | 用途 |
|---------------|------|
| `GET /documents.json?date=YYYY-MM-DD&type=2` | 提出書類一覧取得（type=2: 有価証券報告書等） |
| `GET /documents/{docID}?type=1` | 書類 ZIP ダウンロード・XBRL 解析 |

**制約**: 
- `date` と `type` 以外のパラメータ（secCode, edinetCode, filerName, date range）は**完全に無視される**
- 1 日単位の検索しかできないため、365 日分の反復検索が必要
- secCode は多くの企業で null

### Yahoo Finance (非公式 API)

| エンドポイント | 用途 |
|---------------|------|
| `v8/finance/chart/{code}.T` | 株価データ（終値・前日比） |
| `v8/finance/chart/^N225` | 日経平均（TOPIX の代替） |

**制約**: 非公式 API のため安定性に欠ける。TOPIX データが取得できないため日経平均で代用。

### OpenRouter (LLM)

| 設定 | 値 |
|------|-----|
| モデル | `google/gemini-2.5-flash` |
| Temperature | 0.1 |
| 用途 | 有価証券報告書の定性評価（オーナー企業判定 + 経営スコア） |

## スクリーニングパイプライン

```
Step 1: J-Quants から全銘柄マスター取得
  ↓ 東証グロース（Mkt=0113）に絞る。250 銘柄を 5 バッチに分割
Step 2: Yahoo Finance で株価取得（100ms 間隔）
Step 3: Yahoo Finance で日経平均取得
Step 4: J-Quants 財務データ取得 → 定量スクリーニング
  ├── 時価総額 < 2,000 億円
  ├── 実質 PER < 50 倍
  └── J-Quants 403 時は EDINET フォールバック（高コストのため skip）
Step 5: EDINET 有価証券報告書取得 → LLM 定性評価
  ├── 365 日間の書類検索（3 フェーズ: 毎日/週次/隔週）
  ├── 会社名正規化 + 複数マッチング戦略
  ├── 訂正報告書をスキップ
  └── 大株主・役員・沿革・ガバナンスのセクションを抽出 → LLM へ
Step 6: 2-Tier 選定
  ├── Tier 1: オーナー企業 && スコア ≧ 50 && PER ≦ 10
  └── Tier 2: スコア ≧ 10 && PER ≦ 80
```

## データベーススキーマ

### picks（選定銘柄）
```sql
code             TEXT    -- 銘柄コード（4桁）
name             TEXT    -- 銘柄名
market_cap       REAL    -- 時価総額（億円）
net_cash         REAL    -- ネットキャッシュ（億円）
real_per         REAL    -- 実質PER
sales_growth     REAL    -- 売上成長率 3年平均
profit_growth    REAL    -- 営業利益成長率 3年平均
is_owner_company INTEGER -- オーナー企業フラグ (LLM判定)
management_score INTEGER -- 経営評価スコア 1-100 (LLM判定)
reason           TEXT    -- 評価理由 (LLM出力・日本語)
kiyohara_compliant INTEGER -- 清原適合フラグ (1=適合, 0=監視)
initial_price    REAL    -- 選定時株価
initial_topix    REAL    -- 選定時日経平均
picked_at        TEXT    -- 選定日時
status           TEXT    -- active / closed
```

### daily_tracking（日次トラッキング）
```sql
code             TEXT    -- 銘柄コード
date             TEXT    -- 日付
price            REAL    -- 終値
topix            REAL    -- 日経平均終値
alpha            REAL    -- 超過収益率 (%)
cumulative_alpha REAL    -- 累積超過収益率 (%)
```

### company_evaluations（LLM 評価キャッシュ）
```sql
code             TEXT    -- 銘柄コード
doc_id           TEXT    -- EDINET 書類 ID
submitted_date   TEXT    -- 提出日
is_owner_company INTEGER
management_score INTEGER
reason           TEXT
```

### edinet_mappings（EDINET コードキャッシュ）
```sql
code             TEXT    -- 銘柄コード
edinet_code      TEXT    -- EDINET コード
company_name     TEXT    -- EDINET 上の提出者名
```

## フロントエンド

React 19 + Vite + Tailwind v4 + Recharts で構築。

### 表示項目
- **KPI バー**: 総銘柄数 / 適合数 / 監視数 / 平均 PER / 前回更新日時
- **スクリーニング条件**: 対象市場・定量フィルター・適合基準・監視基準を明示
- **選定銘柄一覧（テーブル）**: コード・銘柄名・Tier バッジ（緑:適合 / 琥珀:監視）・オーナー企業・時価総額・純現金・実質 PER・売上成長・営利成長・スコア・評価理由
- **パフォーマンスチャート**: 株価推移（円）+ リターン率 + 日経平均 + Alpha の複合グラフ（ComposedChart / 二重 Y 軸）
- **レスポンシブ**: モバイル対応、ローディング中のスケルトン表示

### デプロイ先
- Workers: `kiyohara-method-screener.tachibanananana.workers.dev`
- Pages: `kiyohara-screener.hikakunavi360.com`

## 実装で試行錯誤したこと

### 1. EDINET API の罠
EDINET API v2 のドキュメントには `secCode` や `filerName` などのパラメータが記載されているが、実際には `date` と `type` 以外の**全パラメータが無視される**。このため API 側でフィルタできず、365 日分の日次リクエストを送ってクライアント側でフィルタする必要があった。

### 2. J-Quants 無料プランの制限
無料プランでは約 60% の銘柄で 403 が返る。当初はこのフォールバックとして EDINET から財務データを XBRL パースしていたが、1 銘柄あたり 60-90 秒かかるため断念。J-Quants がデータを返さない銘柄はスキップするようにした。

### 3. Tailwind v4 の Vite プラグイン
Tailwind v4 では `@import "tailwindcss"` だけで CSS が適用されると思われがちだが、実際には `@tailwindcss/vite` プラグインが必須。これがないと全ユーティリティクラスが生成されず、画面が真っ白になる。

### 4. React 19 と Recharts の互換性
React 19 では SVG 要素の `fill`/`stroke` 属性が deprecated 扱い。Recharts は内部的にこれらを SVG 要素に渡すためコンソール警告が出るが、Recharts v2 側の対応を待つしかなく、アプリコードでは回避不能。機能には影響なし。

### 5. LLM のオーナー企業判定
当初のプロンプトは「会社名と同じ名字ならオーナー企業」という単純な判定基準で、全銘柄が非オーナーと誤判定された。改善後は「大株主の状況」「役員の状況」「沿革」のセクションを有報から抽出して LLM に渡し、創業者経営・大株主持分・家族経営の証拠を探すよう指示。これにより 250 銘柄中 7 件のオーナー企業を正しく検出できた。

### 6. EDINET カバレッジ改善
当初 90 日間の検索では約 60% の銘柄で EDINET 書類が見つからなかった。検索期間を 365 日に拡大し、会社名の正規化（ホールディングス→HD、株式会社除去、空白正規化等）と複数マッチング戦略（完全一致・相互包含・先頭 2-3 文字一致・提出者名の部分一致）により、カバレッジを大幅に改善した。

### 7. 速度最適化
50 銘柄のスクリーニングが当初 17 分かかっていたのを 7 分に短縮。最大の改善は J-Quants 403 時の EDINET フォールバック省略。その他、Yahoo Finance 取得間隔（500ms→100ms）、J-Quants 待機（5s→3s）、EDINET 検索間隔削除、LLM 評価待機（2s→0.5s）の最適化を実施。

## GitHub Actions ワークフロー

| ワークフロー | スケジュール | 内容 |
|-------------|-------------|------|
| `screening.yml` | 平日 15:00 JST | 1 日 50 銘柄のスクリーニング（月〜金で全 250 銘柄をカバー） |
| `tracking.yml` | 毎日 15:00 JST | 全アクティブ pick の株価・日経平均を取得し Alpha を計算 |
| `verify-screening.yml` | 手動 (`workflow_dispatch`) | 条件をカスタマイズ可能な検証用スクリーニング |
| `deploy-frontend.yml` | master ブランチの frontend/ 変更時 | Cloudflare Pages に自動デプロイ |

## ディレクトリ構成

```
kiyohara-method-screener/
├── src/                    # Cloudflare Workers (Hono API)
│   ├── index.ts            # エントリーポイント・API ルート
│   ├── types/index.ts      # 共通型定義
│   ├── db/schema.ts        # D1 データベースアクセス層
│   ├── api/                # API クライアント（Workers 用）
│   │   ├── jquants.ts
│   │   ├── edinet.ts
│   │   ├── yahoo-finance.ts
│   │   └── openrouter.ts
│   ├── workflow.ts         # Cloudflare Workflows（未使用）
│   └── cron/alpha-tracker.ts
├── scripts/                # GitHub Actions 用バッチスクリプト
│   ├── screening.ts        # メインスクリーニング
│   ├── tracking.ts         # Alpha トラッキング
│   └── debug-*.ts          # デバッグ用スクリプト群
├── frontend/               # React フロントエンド
│   └── src/
│       ├── App.tsx
│       ├── main.tsx
│       ├── index.css
│       └── components/
│           ├── PickList.tsx
│           └── PerformanceChart.tsx
├── migrations/             # D1 マイグレーション
│   ├── 0001_initial_schema.sql
│   ├── 0002_edinet_mappings.sql
│   ├── 0003_add_kiyohara_compliant.sql
│   └── 0004_add_reason_to_picks.sql
├── .github/workflows/      # GitHub Actions
│   ├── screening.yml
│   ├── tracking.yml
│   ├── verify-screening.yml
│   └── deploy-frontend.yml
├── wrangler.jsonc          # Workers 設定
└── package.json
```
