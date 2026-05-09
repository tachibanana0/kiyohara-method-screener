# 清原メソッドスクリーナー - プロジェクト引き継ぎ資料

## 最終的なゴール

日本株投資のための**清原メソッド**を自動化するスクリーニングシステムを構築する。

### 清原メソッドの基準
1. **時価総額 < 270億円**（小型株）
2. **実質PER < 25倍**（割安）
3. **PER < 時価総額/100**（PERが時価総額より十分に小さい）
4. **ネットキャッシュ > 0**（財務健全）
5. **売上高成長率 > 0**（成長中）
6. **営業利益成長率 > 0**（利益も成長）
7. **オーナー企業**（創業家経営、同族企業）
8. **経営スコア 50点以上**（LLM評価）

### システムの構成
- **Cloudflare Workers**: 軽量API + D1データベース（ストレージ）
- **GitHub Actions**: 重いスクリーニング処理（J-Quants, EDINET, OpenRouter API呼び出し）
- **フロントエンド**: 選定銘柄一覧 + Alphaトラッキングチャート（開発中）

---

## これまでにできたこと

### 1. アーキテクチャ移行
- ✅ Cloudflare Workers → GitHub Actionsへのスクリーニング処理移行
- ✅ WorkersはAPIエンドポイント + D1ストレージのみに
- ✅ `waitUntil` 30秒制限の回避

### 2. GitHub Actions ワークフロー
- ✅ `screening.yml`: 平日毎日 15:00 JST に定量スクリーニング → LLM評価 → D1保存
- ✅ `tracking.yml`: 毎日 15:00 JST に選定銘柄のAlphaトラッキング
- ✅ `debug-edinet.yml`: EDINET検索のデバッグ用

### 3. スクリーニングスクリプト (`scripts/screening.ts`)
- ✅ **J-Quants API v2 クライアント**
  - 銘柄一覧取得（グロース市場のみ）
  - 財務データ取得（売上高、営業利益、純利益、キャッシュ、発行済株式数）
  - 定量スクリーニング実装
- ✅ **Yahoo Finance API クライアント**
  - 株価取得（終値）
  - TOPIX取得
- ✅ **EDINET API v2 クライアント**
  - 有価証券報告書検索（365日以内）
  - docType: 有価証券報告書のみ
- ✅ **OpenRouter クライアント**
  - LLM評価（gemini-2.5-flash）
  - オーナー企業判定 + 経営スコア
- ✅ **スクリーニング結果をWorker APIに送信**
  - `/api/screening/receive` エンドポイント

### 4. トラッキングスクリプト (`scripts/tracking.ts`)
- ✅ 選定銘柄の株価をYahoo Financeから取得
- ✅ Alpha（超過収益率）計算: `(株価収益率 - TOPIX収益率) * 100`
- ✅ 結果をWorker APIに送信

### 5. Cloudflare Workers API (`src/index.ts`)
- ✅ `/api/picks`: 現在の選定銘柄一覧
- ✅ `/api/tracking/:code`: 特定銘柄のトラッキング系列
- ✅ `/api/screening/receive`: スクリーニング結果受信
- ✅ `/api/tracking/receive`: トラッキング結果受信
- ✅ 各種デバッグエンドポイント

### 6. D1 データベース
- ✅ `company_evaluations`: LLM評価キャッシュ
- ✅ `picks`: 選定銘柄
- ✅ `daily_tracking`: 日次Alphaトラッキング

### 7. フロントエンド（開発中）
- ✅ `frontend/` ディレクトリ作成
- ✅ Vite + React + TypeScript
- ✅ Honoバックエンド（`frontend/server/index.ts`）
- ✅ 選定銘柄一覧ページ
- ✅ Alphaトラッキングチャートページ

---

## できていないこと・未解決の問題

### 🔴 問題1: EDINET検索が失敗する（最重要）

**症状:**
定量スクリーニングを通過した銘柄（21730博展, 29810ランディックス, 29830アールプランナー, 33000アンビションDX, 34770フォーライフ）のEDINET検索が**すべて失敗**（0件）

**原因の特定:**
1. **edinetCodeが取得できない** — J-Quants API v1（上場銘柄一覧）が403エラー
2. **secCodeマッチングが失敗** — EDINET API v2が`secCode=null`を返す（79件中73件）
3. **会社名マッチングのみ**に依存しているが、これも不安定

**現在の検索ロジック:**
```typescript
if (edinetCode) {
  params.set('edinetCode', edinetCode);  // ← 常にスキップ
} else if (secCode) {
  params.set('secCode', secCode);        // ← secCodeがnullなのでスキップ
}
// 結果: 会社名マッチングのみ
```

**試したこと:**
- ✅ 検索期間を180日→365日に拡張
- ✅ 決算期末日から検索ウィンドウを計算
- ✅ 半期報告書・四半期報告書も検索対象に
- ✅ EDINET API v1/v2の動作確認

**未解決:**
- edinetCodeの代替取得方法
- secCodeがnullになる理由
- 会社名マッチングの精度向上

### 🔴 問題2: LLM評価が完了しない

**症状:**
定量スクリーニングを通過した5銘柄中、LLM評価が完了したのは2銘柄のみ。残り3銘柄はEDINET検索失敗によりスキップ。

**追加の問題:**
- LLMがJSONを返さないことがある（日本語プロンプトのパース問題）
- 英語プロンプトに改善済みだが、EDINET検索が失敗するため意味なし

### 🟡 問題3: J-Quants API v1 が403エラー

**症状:**
`https://api.jquants.com/v1/edinetCode` が403 Forbiddenを返す

**影響:**
- 銘柄コード → edinetCode の変換ができない
- EDINET検索の精度が大幅に低下

### 🟡 問題4: フロントエンド未完成

**現状:**
- Vite + React + Honoの構成は作成済み
- 選定銘柄一覧ページとAlphaトラッキングチャートページの基本的な実装あり
- デプロイ方法未設定

### 🟢 問題5: GitHub Actionsの`npm install`不足

**修正済み:**
- `tracking.yml`に`npm install`ステップを追加済み

---

## 環境変数・シークレット

### GitHub Actions Secrets
- `JQUANTS_API_KEY`: J-Quants APIキー
- `EDINET_SUBSCRIPTION_KEY`: EDINET APIサブスクリプションキー
- `OPENROUTER_API_KEY`: OpenRouter APIキー
- `SCREENING_API_URL`: WorkerのURL（`https://kiyohara-screener.hikakunavi360.com`）
- `SCREENING_API_TOKEN`: Worker認証用トークン

### Cloudflare Workers Secrets
- `JQUANTS_API_KEY`
- `EDINET_SUBSCRIPTION_KEY`
- `OPENROUTER_API_KEY`
- `SCREENING_API_TOKEN`

---

## 主要ファイル

```
kiyohara-method-screener/
├── .github/workflows/
│   ├── screening.yml          # 定量スクリーニング + LLM評価
│   ├── tracking.yml           # Alphaトラッキング
│   └── debug-edinet.yml       # EDINETデバッグ
├── scripts/
│   ├── screening.ts           # GitHub Actions用スクリーニングスクリプト
│   └── tracking.ts            # GitHub Actions用トラッキングスクリプト
├── src/
│   ├── index.ts               # Cloudflare Workersエントリーポイント
│   ├── api/
│   │   ├── jquants.ts         # J-Quants APIクライアント
│   │   ├── edinet.ts          # EDINET APIクライアント
│   │   ├── yahoo-finance.ts   # Yahoo Finance APIクライアント
│   │   └── openrouter.ts      # OpenRouter APIクライアント
│   └── db/
│       └── schema.ts          # D1データベーススキーマ
├── migrations/
│   └── 0001_initial_schema.sql # D1マイグレーション
├── frontend/                  # フロントエンド（開発中）
├── wrangler.jsonc             # Cloudflare Workers設定
└── package.json
```

---

## 次の開発者がやるべきこと

### 最優先: EDINET検索の修正
1. edinetCodeの代替取得方法を調査
   - EDINETの別API（`/api/v1/corporates.json`）は403でブロック済み
   - 静的なedinetCodeマッピングファイルの作成を検討
2. secCodeがnullになる原因を特定
   - EDINET API v2の仕様を確認
3. 会社名マッチングの精度向上
   - 部分一致＋正規化（「株式会社」除去、全角半角統一）
   - 旧社名・別名も検索対象に

### 二次優先: LLM評価の改善
1. EDINET検索成功後に、LLM評価が正しく動作するか確認
2. JSONパースの安定性向上
3. プロンプトの改善（英語→日本語、またはその逆）

### 三次優先: フロントエンド完成
1. 選定銘柄一覧ページの完成
2. Alphaトラッキングチャートの完成
3. Cloudflare Pagesへのデプロイ設定

---

## 参考情報

### EDINET API
- v2: `https://disclosure.edinet-fsa.go.jp/api/v2/documents.json`
- パラメータ: `type=2`, `date=YYYY-MM-DD~YYYY-MM-DD`, `docTypeList=["2"]`
- docTypeList: 1=臨時報告書, 2=有価証券報告書, 3=半期・四半期報告書

### J-Quants API
- v2: `https://api.jquants.com/v2`
- 銘柄一覧: `/listed`
- 財務データ: `/fins/statements`
- v1 edinetCode: `/v1/edinetCode`（403エラー）

### 清原メソッド
- 小型株（時価総額 < 270億円）
- 割安（実質PER < 25倍）
- 成長（売上高・営業利益成長率 > 0）
- オーナー企業（創業家経営）
- 財務健全（ネットキャッシュ > 0）
