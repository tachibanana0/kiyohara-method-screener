# Kiyohara Method Screener

清原達郎『わが投資術 市場は誰に微笑むか』の投資手法を自動化する日本株スクリーニング & Alpha トラッキングシステム。

## 概要

全市場（Prime / Standard / Growth / JASDAQ）の全銘柄を PER・PBR・ネットキャッシュ比率・時価総額でスコアリング → 上位銘柄の EDINET 有価証券報告書を LLM で定性評価 → 適合/監視の 2 段階で選定し、日次で超過収益（Alpha）をトラッキングする。

### 選定基準（スコア制）

本に一律の数値閾値が明記されていないため、スコア制を採用。

**定量スコアリング（0-100）**
- PER: ≤5 倍=35pt / ≤10 倍=25pt / ≤15 倍=15pt / ≤25 倍=8pt / ≤40 倍=3pt
- PBR: ≤0.5 倍=25pt / ≤0.8 倍=20pt / ≤1.0 倍=15pt / ≤1.5 倍=5pt
- ネットキャッシュ比率: ≥100%=25pt / ≥50%=18pt / ≥20%=10pt / >0=5pt
- 小型株ボーナス: ≤100 億=15pt / ≤270 億=10pt / ≤500 億=5pt
- 定量スコア ≧ 20 で通過

**2-Tier 選定**

| Tier | 条件 |
|------|------|
| **Tier 1: 清原適合** | オーナー企業 + LLM スコア ≧ 40 |
| **Tier 2: 監視対象** | LLM スコア ≧ 10 |

**ネットキャッシュ比率**
`(流動資産 + 投資有価証券 × 70% − 負債) ÷ 時価総額`
yfinance で貸借対照表データを取得し計算。時価総額を超える現金性資産を持つ企業を「実質無借金の割安株」として評価。

**LLM 評価（上位 15 銘柄のみ）**
定量スコア上位 15 銘柄だけ EDINET 有価証券報告書を Gemini 2.5 Flash が分析。大株主構成・役員経歴・沿革・ガバナンスからオーナー企業判定と経営スコア（1-100）を算出。時間短縮のため全件評価しない。

## アーキテクチャ

```
GitHub Actions (3 時間毎 / 1 日 8 回)
  ├── scripts/screening.ts  ← J-Quants + yfinance (BS/株価/TOPIX) + EDINET + OpenRouter
  │   └── POST /api/screening/receive → Cloudflare Workers
  │
  └── scripts/tracking.ts   ← yfinance (株価/TOPIX)
      └── POST /api/tracking/receive → Cloudflare Workers

Cloudflare Workers (Hono v4)
  ├── GET  /api/picks            ← 選定銘柄一覧
  ├── GET  /api/tracking/:code   ← 日次トラッキング
  ├── GET  /picks/:code          ← SEO 用個別銘柄ページ (SSR)
  ├── GET  /sitemap.xml          ← 動的サイトマップ
  ├── POST /api/screening/receive ← スクリーニング結果受信
  ├── POST /api/tracking/receive  ← トラッキング結果受信
  └── D1 Database (kiyohara-screener-db)

Cloudflare Pages (React 19 + Vite + Tailwind v4 + Recharts)
  ├── /                ← ランディングページ
  ├── /dashboard       ← 選定銘柄一覧 + パフォーマンスチャート
  ├── /picks/:code     ← 個別銘柄詳細
  ├── /method          ← 清原メソッド詳細解説
  ├── /faq             ← FAQ
  └── /about           ← 運営者情報
```

## 技術スタック

| 層 | 技術 | 用途 |
|----|------|------|
| バックエンド | Cloudflare Workers + Hono v4 | REST API、データ永続化 |
| データベース | Cloudflare D1 (SQLite) | 選定銘柄・トラッキング・評価キャッシュ |
| バッチ処理 | GitHub Actions + tsx | 3 時間毎スクリーニング・毎日トラッキング |
| フロントエンド | React 19 + Vite + Tailwind v4 + Recharts | ダッシュボード・LP |
| ホスティング | Cloudflare Pages | フロントエンド配信 |
| LLM | OpenRouter (Gemini 2.5 Flash) | 有価証券報告書定性評価 |
| 財務 BS データ | yfinance (Python) | ネットキャッシュ比率・PBR計算 |
| 財務 PL データ | J-Quants API v2 | 売上・営業利益・純利益・発行済株式数 |
| 株価 | yfinance (Python) | 株価・TOPIX（日経平均） |
| 開示書類 | EDINET API v2 | 有価証券報告書取得 |

## セットアップ

### 前提条件
- Node.js 20+, Python 3
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
pip install yfinance
```

### 環境変数

`.env.example` を参考に設定。GitHub Actions では Secrets として設定。

| 変数 | 説明 |
|------|------|
| `JQUANTS_API_KEY` | J-Quants API キー |
| `EDINET_SUBSCRIPTION_KEY` | EDINET API キー |
| `OPENROUTER_API_KEY` | OpenRouter API キー |
| `SCREENING_API_URL` | Worker API のベース URL |
| `SCREENING_API_TOKEN` | 認証用トークン |

### スクリーニング環境変数

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `BATCH_SIZE` | 50 | 1 回の処理銘柄数 |
| `ALL_MARKETS` | false | 全市場対象 (Prime/Standard/Growth/JASDAQ) |
| `MIN_QUANT_SCORE` | 20 | 定量スコア最低ライン (0-100) |
| `MIN_SCORE` | 40 | Tier 1 LLM スコア下限 |
| `WATCH_SCORE` | 10 | Tier 2 LLM スコア下限 |
| `MAX_LLM_EVAL` | 15 | LLM 評価の上限数 |
| `REQUIRE_PROFIT` | true | 当期純利益 > 0 必須 |
| `SKIP_LOW_GROWTH` | true | 成長率 > 0 必須 |
| `BATCH_INDEX` | - | 強制 batch index（空=自動） |

### ローカル実行
```bash
BATCH_SIZE=3 ALL_MARKETS=true npm run screening
npm run tracking
```

### デプロイ
```bash
npm run deploy  # Worker
cd frontend && npm run build && npx wrangler pages deploy dist --project-name=kiyohara-screener --branch=main --commit-dirty=true
```

## スクリーニングパイプライン

```
Step 1: J-Quants → 全銘柄マスター取得
  ↓ 全市場 + S33 業種フィルタ（銀行・証券・保険 etc 除外）
  ↓ 12 バッチに分割（Growthのみなら 5 バッチ）
Step 2: yfinance → 株価・TOPIX・BS データ一括取得
  ↓ ネットキャッシュ比率・PBRを本の計算式で算出
Step 3: J-Quants → 財務データ取得 → 定量スコアリング
  ├── computeQuantScore(PER, PBR, ncRatio, cap) → 0-100
  └── 定量スコア ≧ MIN_QUANT_SCORE で通過
Step 4: EDINET + LLM 定性評価（上位 15 銘柄のみ）
  ├── 365 日間の書類検索（3 フェーズ: 毎日/週次/隔週）
  ├── 大株主・役員・沿革・ガバナンスのセクション抽出 → LLM へ
  └── 訂正報告書スキップ
Step 5: 2-Tier 選定
Step 6: Worker API へ POST
```

## データベーススキーマ

### picks（選定銘柄）
```sql
code             TEXT    -- 銘柄コード (4桁)
name             TEXT    -- 銘柄名
market_cap       REAL    -- 時価総額（億円）
net_cash         REAL    -- ネットキャッシュ（億円）
net_cash_ratio   REAL    -- ネットキャッシュ比率（本の計算式）
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

### daily_tracking
```sql
code, date, price, topix, alpha, cumulative_alpha
```

### company_evaluations
```sql
code, doc_id, submitted_date, is_owner_company, management_score, reason
```

## フロントエンド

React 19 + Vite + Tailwind v4 + Recharts + react-helmet-async + react-router-dom。

### 表示項目
- **KPI バー**: 総数 / 適合数 / 監視数 / オーナー企業数 / 平均 PER
- **スクリーニング条件**: 定量スコア基準・適合基準・監視基準を明示
- **選定銘柄一覧**: コード・銘柄名・Tier・オーナー企業・時価総額・NC 比率（%表示/色分け）・実質 PER・成長率・スコア・評価理由
- **ソート機能**: カラムヘッダクリックで昇降順ソート（デフォルト NC 比率降順）
- **個別銘柄ページ**: 全指標 + AI 評価理由 + パフォーマンスチャート
- **パフォーマンスチャート**: 株価（円）+ リターン率 + 日経平均 + Alpha（ComposedChart / 二重 Y 軸）
- **SEO**: meta description / OGP / JSON-LD / dynamic sitemap / SSR pick pages

### ページ
- `/` — ランディングページ
- `/dashboard` — 選定銘柄一覧 + パフォーマンス
- `/picks/:code` — 個別銘柄詳細
- `/method` — 清原メソッド解説
- `/faq` — FAQ
- `/about` — 運営者情報

## 実装で試行錯誤したこと

### 1. Yahoo Finance ブロック問題
GitHub Actions の共有 IP から `fetch()` で直接 Yahoo Finance API を叩くと即ブロックされる。yfinance (Python ライブラリ) 経由に完全移行することで解決。`import('child_process')` で Python スクリプトを呼び、株価・TOPIX・BS データをまとめて JSON で取得。二度と直接 fetch しない。

### 2. ネットキャッシュ比率の正しい計算
当初 J-Quants の `CashEq` で近似していたが、本の定義は `(流動資産 + 投資有価証券 × 70% − 負債) ÷ 時価総額` だった。yfinance で貸借対照表を取得し正確に計算できるようになった。

### 3. EDINET API の罠
`secCode` `filerName` `docTypeList` `edinetCode` の全パラメータが無視される。`date` と `type` だけが有効。365 日分の日次リクエストを送ってクライアント側フィルタが必要。

### 4. 閾値制 → スコア制への移行
本に「PER < 25」のような一律閾値は明記されていないことが判明。PER 5/8/13 倍は「好例」であって「基準」ではない。一律フィルタを撤廃し、PER + PBR + NC比率 + 時価総額を統合した 0-100 スコア制に変更した。

### 5. LLM 評価の時間制限
定量通過が増えたことで LLM 評価に時間がかかるようになった。定量スコア上位 15 銘柄だけ LLM 評価し、残りは定量データのみ保存する方式で 70% 短縮。

### 6. Tailwind v4 の Vite プラグイン
`@tailwindcss/vite` プラグインが必須。ないと全ユーティリティクラスが生成されず真っ白になる。

### 7. React 19 + Recharts の互換性
SVG 要素の `fill`/`stroke` 属性に React 19 警告。Recharts v2 側の対応待ち。機能影響なし。

### 8. 全市場対応
当初 TSE Growth 限定だったが、本の対象市場制限はないため Prime/Standard を含む全市場に拡大。3,150 銘柄を 12 バッチに分割し、3 時間毎の cron で 1.5 日で全網羅。

## GitHub Actions ワークフロー

| ワークフロー | スケジュール | 内容 |
|-------------|-------------|------|
| `screening.yml` | 3 時間毎（8 回/日） | 全市場 50 銘柄ずつスクリーニング（1.5 日で全網羅） |
| `tracking.yml` | 毎日 15:00 JST | 全アクティブ pick の株価・日経平均を取得し Alpha 計算 |
| `verify-screening.yml` | 手動 | 条件カスタマイズ可能な検証用スクリーニング |
| `deploy-frontend.yml` | master の frontend/ 変更時 | Cloudflare Pages に自動デプロイ |

## ディレクトリ構成

```
kiyohara-method-screener/
├── src/                    # Cloudflare Workers (Hono API)
│   ├── index.ts            # エントリーポイント・API ルート
│   ├── types/index.ts      # 共通型定義
│   ├── db/schema.ts        # D1 データベースアクセス層
│   ├── api/                # API クライアント
│   │   ├── jquants.ts
│   │   ├── edinet.ts
│   │   └── openrouter.ts
│   └── workflow.ts
├── scripts/                # GitHub Actions 用バッチスクリプト
│   ├── screening.ts        # メインスクリーニング（スコア制 + yfinance + LLM）
│   ├── tracking.ts         # Alpha トラッキング
│   ├── yfinance_data.py    # yfinance 統合スクリプト（株価+TOPIX+BS）
│   └── debug-*.ts          # デバッグ用スクリプト群
├── frontend/               # React フロントエンド
│   └── src/
│       ├── App.tsx          # ルーティング（BrowserRouter）
│       ├── Landing.tsx      # ランディングページ
│       ├── Dashboard.tsx    # ダッシュボード
│       ├── StockDetail.tsx  # 個別銘柄詳細
│       ├── Method.tsx       # 清原メソッド解説
│       ├── FAQ.tsx          # FAQ
│       ├── About.tsx        # 運営者情報
│       └── components/
│           ├── PickList.tsx  # ソート可能銘柄一覧テーブル
│           └── PerformanceChart.tsx
├── migrations/             # D1 マイグレーション
│   ├── 0001_initial_schema.sql
│   ├── 0002_edinet_mappings.sql
│   ├── 0003_add_kiyohara_compliant.sql
│   ├── 0004_add_reason_to_picks.sql
│   └── 0005_add_net_cash_ratio.sql
├── .github/workflows/
│   ├── screening.yml       # 3時間毎 cron
│   ├── tracking.yml        # 毎日 cron
│   ├── verify-screening.yml # 手動検証用
│   └── deploy-frontend.yml  # 自動 Pages デプロイ
├── wrangler.jsonc
└── package.json
```
