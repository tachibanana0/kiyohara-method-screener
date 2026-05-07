# 環境変数セットアップ

## GitHub Actions Secrets

リポジトリの Settings → Secrets and variables → Actions に以下を追加：

| シークレット名 | 説明 | 例 |
|---------------|------|-----|
| `JQUANTS_API_KEY` | J-Quants APIキー | `your-jquants-api-key` |
| `EDINET_SUBSCRIPTION_KEY` | EDINET APIサブスクリプションキー | `your-edinet-key` |
| `OPENROUTER_API_KEY` | OpenRouter APIキー | `sk-or-v1-...` |
| `SCREENING_API_URL` | WorkerのURL | `https://kiyohara-screener.hikakunavi360.com` |
| `SCREENING_API_TOKEN` | Worker認証用トークン（任意の文字列） | `your-secret-token` |

## Cloudflare Workers Secrets

`wrangler secret put` で以下を設定：

```bash
wrangler secret put SCREENING_API_TOKEN
```

GitHub Actionsの `SCREENING_API_TOKEN` と同じ値を設定すること。

## 既存のシークレット

以下は既に設定済み：

- `JQUANTS_API_KEY`
- `EDINET_SUBSCRIPTION_KEY`
- `OPENROUTER_API_KEY`

## Cron不要について

Cloudflare WorkersのCronトリガーは削除しました。すべての定期実行はGitHub Actionsで処理します：

- **スクリーニング**: 月-金 15:00 JST（`.github/workflows/screening.yml`）
- **Alphaトラッキング**: 毎日 15:00 JST（`.github/workflows/tracking.yml`）

これにより、Cloudflare無料枠のCron制限（1日1回）を回避し、GitHub Actionsの無料枠（月2,000分）を活用できます。

## 実行確認

手動でワークフローを実行するには：

```bash
gh workflow run screening.yml
gh workflow run tracking.yml
```

または GitHub Actions の画面から "Run workflow" をクリック。

## ローカルテスト

環境変数を設定してローカルでスクリプトを実行可能：

```bash
# .envファイルを作成
cp .env.example .env
# .envを編集してAPIキーを設定

# スクリーニング実行
npm run screening

# トラッキング実行
npm run tracking
```
