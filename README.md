# Kiyohara Method Screener

清原達郎『わが投資術 市場は誰に微笑むか』の投資手法を自動化する日本株スクリーニング & Alpha トラッキングシステム。

## 概要

全市場（Prime / Standard / Growth / JASDAQ）の全銘柄を PER・PBR・ネットキャッシュ比率・時価総額でスコアリング → 上位銘柄の EDINET 有価証券報告書を LLM で定性評価 → 適合/監視の 2 段階で選定し、日次で超過収益（Alpha）をトラッキングする。

### 選定基準（スコア制 + ハード基準）

本に一律の数値閾値が明記されていないため、定量スコアでソートし、**選定には本のハード基準を必須条件**とする。

**ハード基準（必須・Tier 1/2 共通）**
- 時価総額 ≤ 270 億円 (`MAX_MARKET_CAP`)
- 0 < 実質PER ≤ 25 倍 (`MAX_PER`)
- ネットキャッシュ > 0
- 投資法人・REIT・ETF・ファンドは除外

**定量スコアリング（0-100、通過ラインとソート順に使用）**
- PER: ≤5 倍=35pt / ≤10 倍=25pt / ≤15 倍=15pt / ≤25 倍=8pt / ≤40 倍=3pt
- PBR: ≤0.5 倍=25pt / ≤0.8 倍=20pt / ≤1.0 倍=15pt / ≤1.5 倍=5pt
- ネットキャッシュ比率: ≥100%=25pt / ≥50%=18pt / ≥20%=10pt / >0=5pt
- 小型株ボーナス: ≤100 億=15pt / ≤270 億=10pt / ≤500 億=5pt
- 定量スコア ≧ 20 で通過

**2-Tier 選定（ハード基準を満たした銘柄のみ）**

| Tier | 条件 |
|------|------|
| **Tier 1: 清原適合** | オーナー企業（有報の具体的な持株比率の記述が必要） + LLM スコア ≧ 40 |
| **Tier 2: 監視対象** | LLM スコア ≧ 10 |

**ネットキャッシュ比率**
`(流動資産 + 投資有価証券 × 70% − 負債) ÷ 時価総額`
yfinance で貸借対照表データを取得し計算。時価総額を超える現金性資産を持つ企業を「実質無借金の割安株」として評価。

**LLM 評価（上位 15 銘柄のみ）**
定量スコア上位 15 銘柄だけ EDINET 有価証券報告書を Gemini 2.5 Flash が分析。大株主構成・役員経歴・沿革・ガバナンスからオーナー企業判定と経営スコア（1-100）を算出。時間短縮のため全件評価しない。

**EDINET 書類の特定**
会社名の部分一致は廃止（別会社の有報を引く事故が起きたため）。`edinetCode`/`secCode` の厳密一致のみで書類を特定する。J-Quants 側に edinetCode 提供がないため、検索窓 365 日を粗密探索し `secCode` で照合する。

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

Cloudflare Pages (React 19 + Vite + Tailwind v4 + Recharts + vite-react-ssg)
  ├── /                ← ランディングページ（SSG）
  ├── /dashboard       ← 選定銘柄一覧 + パフォーマンスチャート（SSG）
  ├── /picks/:code     ← 個別銘柄詳細（SSG、900ページ）
  ├── /method          ← 清原メソッド詳細解説（SSG）
  ├── /faq             ← FAQ（SSG）
  ├── /about           ← 運営者情報（SSG）
  └── /sitemap.xml     ← 905 URLの静的サイトマップ（ビルド時生成）
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
cd frontend && npm run build:prerender && npx wrangler pages deploy dist --project-name=kiyohara-screener --branch=main --commit-dirty=true
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

### SSG（Static Site Generation）

2026年6月、SPAからSSGに移行し、SEOと初期表示速度を大幅改善。

**技術:**
- `vite-react-ssg` + `beasties` でビルド時に全ページをプリレンダリング
- 905ページ生成（index, dashboard, method, faq, about, picks, 900銘柄詳細）
- Tailwind CSSはインライン`<style>`と外部CSSファイルの両方で出力
- 各ページに動的メタタグ（銘柄名、PER、スコア等）を埋め込み

**ビルドプロセス:**
```bash
npm run build:prerender
# 1. scripts/fetch-picks.mjs でAPIから銘柄データ取得
# 2. tsc でTypeScriptチェック
# 3. vite-react-ssg build で905ページを生成
```

**成果:**
| 項目 | SPA（旧）| SSG（新）|
|------|---------|---------|
| トップページサイズ | 2.9KB | 43KB |
| プリレンダリングページ | 1 | 905 |
| sitemap.xml URL数 | ~4 | 905 |
| SEO | クライアント側のみ | 完全サーバーサイドHTML |
| 銘柄詳細ページ | JS生成 | 静的HTML（動的タイトル） |

**注意点:**
- `index.html`に`<script type="module" src="/src/main.tsx">`必須（vite-react-ssgがエントリー検出に使用）
- ないとCSS/JSが出力されない（manifestが空になる）

### 表示項目
- **KPI バー**: 総数 / 適合数 / 監視数 / オーナー企業数 / 平均 PER
- **スクリーニング条件**: 定量スコア基準・適合基準・監視基準を明示
- **選定銘柄一覧**: コード・銘柄名・Tier・オーナー企業・時価総額・NC 比率（%表示/色分け）・実質 PER・成長率・スコア・評価理由
- **ソート機能**: カラムヘッダクリックで昇降順ソート（デフォルト NC 比率降順）
- **個別銘柄ページ**: 全指標 + AI 評価理由 + パフォーマンスチャート
- **パフォーマンスチャート**: 株価（円）+ リターン率 + 日経平均 + Alpha（ComposedChart / 二重 Y 軸）
- **SEO**: meta description / OGP / JSON-LD / 905 URL sitemap / SSG 全ページプリレンダリング

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

### 4. 閾値制 → スコア制への移行 → ハード基準の復活
本に「PER < 25」のような一律閾値は明記されていないことが判明。PER 5/8/13 倍は「好例」であって「基準」ではない。当初は一律フィルタを撤廃し 0-100 スコア制のみにしたが、スコアだけで選ぶと負の実質PER（ネットキャッシュが時価総額を超えると (cap−nc)/利益 が負になる）や大型株（ブリヂストン 4.5兆円、トヨタ 350兆円）が Tier1 に混入した。スコアはソート用に残し、選定自体は本のハード基準（270億/PER25/NC>0）を必須条件に戻した。

### 5. LLM 評価の時間制限
定量通過が増えたことで LLM 評価に時間がかかるようになった。定量スコア上位 15 銘柄だけ LLM 評価し、残りは定量データのみ保存する方式で 70% 短縮。

### 6. Tailwind v4 の Vite プラグイン
`@tailwindcss/vite` プラグインが必須。ないと全ユーティリティクラスが生成されず真っ白になる。

### 7. React 19 + Recharts の互換性
SVG 要素の `fill`/`stroke` 属性に React 19 警告。Recharts v2 側の対応待ち。機能影響なし。

### 8. 全市場対応
当初 TSE Growth 限定だったが、本の対象市場制限はないため Prime/Standard を含む全市場に拡大。3,150 銘柄を 12 バッチに分割し、3 時間毎の cron で 1.5 日で全網羅。

### 9. EDINET 会社名部分一致の事故と廃止
「日本オラクル」の有報が「日本郵船」「日本車輌製造」等 12 社に、「プロロジスREIT」の有報が「日本精工」に紐付く事故が起きた（picks の 19% が誤マッチ文書由来の reason）。原因は normalize 後の会社名先頭 2〜3 文字での `startsWith` フォールバック。「日本」「アイ」「オー」等の共通 prefix が別会社に延々一致していた。会社名マッチングを全面廃止し、`edinetCode`/`secCode` 厳密一致のみにした。

### 10. EDINET API ホスト移行 (2026年8月末)
EDINET は 2026 年 8 月末に API を `disclosure.edinet-fsa.go.jp` → `api.edinet-fsa.go.jp` に移行した。旧ホストは `disclosure2` へリダイレクトされ、WAF（`wzek0130.aspx` エラー画面、200 ステータスで HTML を返す）が全クライアントをチャレンジする。8/18〜9/1 の間に定性評価が全滅した原因はこれ。旧ホストを呼んでいたコードを新ホストへ全面切替し、加えて `content-type` チェック（HTML 応答を JSON パースせず打ち切り）のガードも入れた。

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
├── frontend/               # React フロントエンド（SSG）
│   ├── index.html          # エントリーHTML（`<script type="module">`必須）
│   ├── vite.config.ts      # Vite + SSG設定
│   ├── src/
│   │   ├── main.tsx        # SSGエントリー（ViteReactSSG）
│   │   ├── App.tsx         # ルーティング（StaticRouter for SSG）
│   │   ├── Landing.tsx     # ランディングページ
│   │   ├── Dashboard.tsx   # ダッシュボード
│   │   ├── StockDetail.tsx # 個別銘柄詳細
│   │   ├── Method.tsx      # 清原メソッド解説
│   │   ├── FAQ.tsx         # FAQ
│   │   ├── About.tsx       # 運営者情報
│   │   └── components/
│   │       ├── PickList.tsx  # ソート可能銘柄一覧テーブル
│   │       └── PerformanceChart.tsx
│   └── dist/               # ビルド出力（905ページ + assets）
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
