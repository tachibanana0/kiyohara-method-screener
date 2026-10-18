# 清原メソッドスクリーナー - プロジェクト状態

**2026-10-18 更新。** 詳細は README.md を参照。このファイルは要約と既知の未解決課題を記す。

## 現在の状態

- スクリーニング: 全市場 (Prime/Standard/Growth/JASDAQ 約3,100社) を 3時間毎 cron × 8 バッチ/日で走査。62 バッチで約 8 日間で全網羅
- 定量スコア制 (0-100) + 本のハード基準 (cap≤270億, 0<実質PER≤25, NC>0) を必須条件として 2-Tier 選定
- EDINET: 2026年8月末の API ホスト移行 (`api.edinet-fsa.go.jp`) に対応済み。旧 `disclosure.*` ホストは WAF チャレンジで使用不可
- LLM 評価: 定量スコア上位 15 銘柄のみ。Gemini 2.5 Flash (`LLM_MODEL` で変更可)
- Alpha トラッキング: yfinance 一括取得。ワークフローは 30 分タイムアウト
- フロントエンド: SSG (905ページ)。`fetch-picks` でビルド時に API から取得

## 既知の未解決課題

### 1. picks のクローズ運用がない
上場廃止・経営統合等で取引不可になった銘柄でも picks が `status='active'` のまま残る。
トラッキングで 404 が返る銘柄を自動 close するか、手動で `closePick()` を呼ぶ運用が必要。
現在 1,409 件の active picks 中、トラッキングで株価が取れないのは約 11 件。

### 2. company_evaluations キャッシュが未接続
D1 の `company_evaluations` テーブル (LLM 評価キャッシュ) は存在するが、
screening.ts から参照していない。同一企業の有報を LLM が毎サイクル再評価する
(コスト増)。接続する場合は docID をキーにキャッシュヒントを確認。

### 3. EDINET secCode 検索の到達率
`edinet_mappings` テーブルも運用されていない (0 行想定)。厳密一致 (edinetCode/secCode)
のみにしたため誤マッチは起きないが、書類が見つからない銘柄は定量データのみで保存される。

### 4. verify-screening.yml の死んだ入力
`min_net_cash_ratio` / `require_per_cap_ratio` の inputs が env に渡されていない
(screening.ts も読んでいない)。使うなら screening.ts に env 読み取りを追加。

### 5. Workers 内蔵 cron パスの未使用
`src/cron/alpha-tracker.ts` と `src/workflow.ts` は wrangler.jsonc に cron トリガー
が設定されていないため到達しない (実運用は GitHub Actions の tracking.yml)。

### 6. フロントエンドの文言
`東証グロース全250銘柄` 等の旧文言は修正済み。`/dashboard` に全 picks 1411 件を
表示するが、UI のスコープ (過去 n 件) については要検討。

## 運用上の注意

- EDINET メンテナンス: 2026-10-24 (土) 8:00-21:00。この時間帯の screening は 0 件
- GitHub Actions の scheduled workflow は 60 日間リポジトリ無アクティビティで自動停止。
  2026-09-03 に tracking が止まっていた例あり (2026-10-18 に再有効化)
- D1 Free tier: subrequest 上限 50/request。`getLatestCumulativeAlphas` は 90 銘柄ずつ分割
