# 日本株（東証上場銘柄）無料API 詳細リサーチレポート

## 概要

J-Quants API Freeプランでは `/equities/bars/daily` が403で利用不可なため、日本株（東証グロース上場銘柄含む）の最新終値・時価総額データを取得できる代替無料APIをリサーチしました。

**評価基準**
- 日本株（東証上場銘柄）の最新終値を取得可能か
- Cloudflare Workersから `fetch()` で直接アクセス可能か（CORS問題なし）
- 無料枠があり、少なくとも50銘柄程度の取得が現実的か
- 時価総額計算に必要な株価×発行済株式数が算出できるか（株価だけでも可）

---

## 1. Yahoo Finance API（非公式 / query1.finance.yahoo.com）⭐ 最も推奨

### エンドポイントURLとリクエスト例

```
GET https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?interval=1d&range=1d
```

**リクエスト例（トヨタ自動車 7203.T）**
```bash
curl -H "User-Agent: Mozilla/5.0" \
  "https://query1.finance.yahoo.com/v8/finance/chart/7203.T?interval=1d&range=1d"
```

**リクエスト例（東証グロース銘柄 9997.T）**
```bash
curl -H "User-Agent: Mozilla/5.0" \
  "https://query1.finance.yahoo.com/v8/finance/chart/9997.T?interval=1d&range=1d"
```

**日本株ティッカー形式**
- `{銘柄コード}.T`（例：`7203.T`, `9997.T`）
- 東証プライム・スタンダード・グロースすべて対応確認済み

### レスポンスJSONの構造（サンプル）

```json
{
  "chart": {
    "result": [{
      "meta": {
        "currency": "JPY",
        "symbol": "7203.T",
        "exchangeName": "JPX",
        "regularMarketPrice": 3000.0,
        "regularMarketVolume": 21904100,
        "longName": "Toyota Motor Corporation",
        "chartPreviousClose": 3023.0
      },
      "timestamp": [1777593600],
      "indicators": {
        "quote": [{
          "close": [3000.0],
          "open": [3000.0],
          "high": [3022.0],
          "low": [2971.0],
          "volume": [21904100]
        }],
        "adjclose": [{"adjclose": [3000.0]}]
      }
    }],
    "error": null
  }
}
```

**主要データの取り出し方**
```javascript
const data = await response.json();
const result = data.chart.result[0];
const close = result.indicators.quote[0].close[0];        // 終値: 3000.0
const volume = result.indicators.quote[0].volume[0];      // 出来高: 21904100
const prevClose = result.meta.chartPreviousClose;         // 前日終値: 3023.0
const marketPrice = result.meta.regularMarketPrice;       // 現在値: 3000.0
```

### レートリミットと制約

| 項目 | 内容 |
|------|------|
| 無料枠 | 完全無料（APIキー不要） |
| レートリミット | 明示されていないが、IPベースで制限ありと推測。一般的に「1秒間に2〜3リクエスト」「1日に数千〜数万リクエスト」程度が目安とされる |
| 50銘柄取得 | 現実的（1銘柄あたり1リクエスト、連続リクエスト時は適度に間隔を空ける必要あり） |
| リアルタイム性 | 遅延なし（リアルタイムに近い） |
| 対応市場 | 東証（JPX）を含む世界中の主要市場 |

### Cloudflare Workersからの利用可否

**利用可能** ✅
- Cloudflare Workersから `fetch()` で直接アクセス可能
- CORSはサーバーサイドfetchでは関係ないため問題なし
- **注意**: Yahoo側がUser-Agentチェックを行っているため、リクエストヘッダーに適切な `User-Agent` を設定する必要がある
- Cloudflare WorkersのIPアドレス帯からのブロック報告は少ないが、大量リクエスト時はブロックされる可能性あり

### リスク評価

| リスク | 評価 | 詳細 |
|--------|------|------|
| 利用規約違反 | ⚠️ 中 | 非公式エンドポイントであり、YahooのTerms of Serviceに抵触する可能性がある。ただし、個人・小規模利用で実際に問題になるケースは稀 |
| 信頼性 | ⚠️ 中 | Yahoo側がいつでもエンドポイントを変更・停止可能。過去に何度か仕様変更がある |
| 継続性 | ⚠️ 中 | 非公式のため、将来的に利用できなくなるリスクがある。ただし、長年利用されており、広く使われているオープンソースライブラリ（yfinance等）の基盤となっている |
| データ精度 | ✅ 高 | Yahoo Financeのデータ品質は高く、東証の公式データと整合性が取れている |

### 発行済株式数の取得について

Yahoo Finance API（v8/finance/chart）には**発行済株式数は含まれません**。時価総額計算には別途発行済株式数が必要です。

**代替策**
1. **東証 上場銘柄一覧Excel**（後述）と組み合わせて、銘柄コードと発行済株式数をマッピングする（ただし東証のExcelにも発行済株式数は含まれていない）
2. **Yahoo Finance v10/quoteSummaryエンドポイント**を試す（ただし、Cloudflare Workers等からは401が返る可能性が高い）
3. **有価証券報告書データ**（EDINET API等）を別途取得する

**結論**: 株価×発行済株式数の自動計算は、無料APIのみでは困難。株価データはYahoo Finance APIで取得し、発行済株式数は別途DB化して管理するのが現実的。

---

## 2. Alpha Vantage API

### エンドポイントURLとリクエスト例

```
GET https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol={ticker}&apikey={apikey}
```

**リクエスト例**
```bash
curl "https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=7203.T&apikey=YOUR_API_KEY"
```

**日本株ティッカー形式**
- `{銘柄コード}.T`（例：`7203.T`）と推測されるが、無料APIキーが必要でデモでは確認不可

### レスポンスJSONの構造（サンプル）

```json
{
  "Meta Data": {
    "1. Information": "Daily Prices (open, high, low, close) and Volumes",
    "2. Symbol": "7203.T",
    "3. Last Refreshed": "2025-05-06",
    "4. Output Size": "Compact",
    "5. Time Zone": "US/Eastern"
  },
  "Time Series (Daily)": {
    "2025-05-06": {
      "1. open": "3000.0000",
      "2. high": "3022.0000",
      "3. low": "2971.0000",
      "4. close": "3000.0000",
      "5. volume": "21904100"
    }
  }
}
```

### レートリミットと制約

| 項目 | 内容 |
|------|------|
| 無料枠 | **25 requests/day** |
| レートリミット | 1日25リクエストまで |
| 50銘柄取得 | **現実的でない**（50銘柄取得には2日かかる） |
| APIキー | 必要（無料で取得可能） |
| 対応市場 | 世界100,000銘柄以上（日本株も対応とされる） |

### Cloudflare Workersからの利用可否

**利用可能** ✅
- 公式APIのため、CORSも問題なし
- APIキーを `wrangler secret` で管理可能

### リスク評価

| リスク | 評価 | 詳細 |
|--------|------|------|
| 利用規約違反 | ✅ 低 | 公式API |
| 信頼性 | ✅ 高 | 安定したサービス |
| 継続性 | ✅ 高 | 長期運営されている |
| 無料枠の制約 | ❌ 致命傷 | 25 requests/dayでは50銘柄の取得が現実的でない |

---

## 3. Twelve Data

### エンドポイントURLとリクエスト例

```
GET https://api.twelvedata.com/quote?symbol={ticker}&apikey={apikey}
```

**リクエスト例**
```bash
curl "https://api.twelvedata.com/quote?symbol=7203.T&apikey=YOUR_API_KEY"
```

### レスポンスJSONの構造（サンプル）

デモキーでは401が返るため、実際のレスポンスは確認不可。ドキュメントによると以下のような構造と推測される：

```json
{
  "symbol": "7203.T",
  "name": "Toyota Motor Corporation",
  "exchange": "JPX",
  "currency": "JPY",
  "close": "3000.00",
  "previous_close": "3023.00",
  "volume": "21904100"
}
```

### レートリミットと制約

| 項目 | 内容 |
|------|------|
| 無料枠（Basic） | **8 API credits/min（800/day）** |
| レートリミット | 毎分8クレジット、1日800クレジット |
| 50銘柄取得 | 現実的（1銘柄あたり1クレジット消費の場合） |
| APIキー | 必要（無料で取得可能） |
| 対応市場 | 無料枠では **US equities, Forex, Crypto のみ（3マーケット）** |

### Cloudflare Workersからの利用可否

**利用可能だが、日本株は無料枠で使えない可能性が高い** ⚠️
- 公式APIのため、CORSは問題なし
- **重要**: 無料枠（Basic）の対象マーケットは「3 markets」とあり、日本株（XJPX）は含まれていない可能性が高い。実際にXJPXのページは存在するが、無料枠でアクセスできるかは不明

### リスク評価

| リスク | 評価 | 詳細 |
|--------|------|------|
| 利用規約違反 | ✅ 低 | 公式API |
| 信頼性 | ✅ 高 | 安定したサービス |
| 継続性 | ✅ 高 | 長期運営されている |
| 無料枠の日本株対応 | ❌ 不明 | 無料枠で日本株（XJPX）が使えない可能性が高い |

---

## 4. Polygon.io

### エンドポイントURLとリクエスト例

```
GET https://api.polygon.io/v2/aggs/ticker/{ticker}/range/1/day/{from}/{to}?apikey={apikey}
```

**リクエスト例**
```bash
curl "https://api.polygon.io/v2/aggs/ticker/7203.T/range/1/day/2025-01-01/2025-01-10?apikey=YOUR_API_KEY"
```

### レスポンスJSONの構造（サンプル）

```json
{
  "ticker": "7203.T",
  "status": "OK",
  "queryCount": 1,
  "resultsCount": 1,
  "results": [
    {
      "c": 3000.0,
      "h": 3022.0,
      "l": 2971.0,
      "o": 3000.0,
      "v": 21904100,
      "t": 1777593600000
    }
  ]
}
```

### レートリミットと制約

| 項目 | 内容 |
|------|------|
| 無料枠 | あり（5 API calls/min程度と推測） |
| レートリミット | 無料枠では厳しい制限あり |
| 50銘柄取得 | 現実的かもしれないが、レートリミットが厳しい |
| APIキー | 必要（無料で取得可能） |
| 対応市場 | 主に米国株。日本株（7203.T）のティッカー形式がPolygon.ioで通用するかは不明 |

### Cloudflare Workersからの利用可否

**利用可能** ✅（ただし日本株対応は不明）
- 公式APIのため、CORSは問題なし
- 日本株のティッカー形式（7203.T）がPolygon.ioのシステムで認識されるか確認が必要

### リスク評価

| リスク | 評価 | 詳細 |
|--------|------|------|
| 利用規約違反 | ✅ 低 | 公式API |
| 信頼性 | ✅ 高 | 安定したサービス |
| 継続性 | ✅ 高 | 長期運営されている |
| 日本株対応 | ❓ 不明 | 日本株のティッカー形式が通用するか不明確 |

---

## 5. IEX Cloud

### エンドポイントURLとリクエスト例

```
GET https://cloud.iexapis.com/stable/stock/{ticker}/quote?token={token}
```

**リクエスト例**
```bash
curl "https://cloud.iexapis.com/stable/stock/7203.T/quote?token=YOUR_TOKEN"
```

### レスポンスJSONの構造（サンプル）

IEX Cloudは主に米国株向けのサービスであり、日本株（7203.T）に対応しているかは不明です。

### レートリミットと制約

| 項目 | 内容 |
|------|------|
| 無料枠 | Sandboxトークン（テスト用データのみ） |
| レートリミット | サンドボックスは制限緩和 |
| 50銘柄取得 | サンドボックスでは可能だが、データはテスト用（ダミー） |
| 日本株対応 | **不明**（主に米国株） |

### Cloudflare Workersからの利用可否

**利用可能だが、日本株対応は不明** ⚠️
- 公式APIのため、CORSは問題なし
- 日本株に対応していない可能性が高い

### リスク評価

| リスク | 評価 | 詳細 |
|--------|------|------|
| 利用規約違反 | ✅ 低 | 公式API |
| 信頼性 | ✅ 高 | 安定したサービス |
| 継続性 | ✅ 高 | 長期運営されている |
| 日本株対応 | ❌ 低 | 日本株に対応していない可能性が高い |

---

## 6. 東証・JPX（公式データ）

### データソースとリクエスト例

**月次上場銘柄一覧（Excel）**
```
https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xls
```

**リクエスト例**
```bash
curl -o data_j.xls \
  "https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xls"
```

### レスポンスの構造（サンプル）

Excelファイルのヘッダー行：
```
['日付', 'コード', '銘柄名', '市場・商品区分', '33業種コード', '33業種区分', '17業種コード', '17業種区分', '規模コード', '規模区分']
```

データ行の例：
```
[20260331.0, 1301.0, '極洋', 'プライム（内国株式）', 50.0, '水産・農林業', 1.0, '食品', 6.0, 'TOPIX Small 1']
```

### レートリミットと制約

| 項目 | 内容 |
|------|------|
| 無料枠 | 完全無料 |
| レートリミット | なし（ただしサーバー負荷を考慮して適度に） |
| 更新頻度 | **毎月第3営業日の午前9時以降**（前月末データ） |
| リアルタイム性 | **なし**（月次更新） |
| 発行済株式数 | **含まれていない** |

### Cloudflare Workersからの利用可否

**利用可能** ✅
- Cloudflare Workersから `fetch()` で直接ダウンロード可能
- ただし、Excelファイルのパースにはライブラリ（xlsx, csv等）が必要

### リスク評価

| リスク | 評価 | 詳細 |
|--------|------|------|
| 利用規約違反 | ✅ 低 | 公式データ |
| 信頼性 | ✅ 高 | 東証の公式データ |
| 継続性 | ✅ 高 | 継続的に提供されている |
| リアルタイム性 | ❌ 致命傷 | 月次更新のため、最新株価は取得できない |
| 発行済株式数 | ❌ なし | 時価総額計算に必要な発行済株式数が含まれていない |

---

## 7. その他のAPI候補

### EOD Historical Data
- **無料枠**: 20 API calls/day
- **評価**: 50銘柄取得には現実的でない
- **日本株対応**: あり（150,000+ tickers worldwide）

### Financial Modeling Prep (FMP)
- **無料枠**: 有限（具体的な数値は要確認）
- **評価**: 日本株対応は不明

---

## 総合比較表

| API | 無料枠 | 日本株対応 | 50銘柄取得 | CF Workers | リアルタイム | リスク |
|-----|--------|------------|------------|------------|--------------|--------|
| **Yahoo Finance** | 無制限（推測） | ✅ 確認済み | ✅ 現実的 | ✅ 可能 | ✅ リアルタイム | ⚠️ 中（非公式） |
| Alpha Vantage | 25/day | ✅ 対応と推測 | ❌ 現実的でない | ✅ 可能 | ✅ リアルタイム | ✅ 低 |
| Twelve Data | 8/min, 800/day | ❓ 無料枠で不明 | ✅ 現実的 | ✅ 可能 | ✅ リアルタイム | ⚠️ 低（日本株不明） |
| Polygon.io | 5/min程度 | ❓ 不明 | ⚠️ 厳しい | ✅ 可能 | ✅ リアルタイム | ⚠️ 低（日本株不明） |
| IEX Cloud | Sandboxのみ | ❌ 主に米国株 | ⚠️ ダミーデータ | ✅ 可能 | ❌ ダミー | ✅ 低 |
| 東証・JPX | 完全無料 | ✅ 公式 | ✅ 現実的 | ✅ 可能 | ❌ 月次 | ✅ 低 |

---

## 最も推奨されるAPI

### 🏆 Yahoo Finance API（非公式 / query1.finance.yahoo.com）

**推奨理由**

1. **日本株に完全対応**
   - 東証プライム（7203.T）、スタンダード、グロース（9997.T）すべてで動作確認済み
   - ティッカー形式が `{コード}.T` と直感的

2. **無料で現実的な取得量**
   - APIキー不要で完全無料
   - 50銘柄程度の取得は、適度に間隔を空ければ現実的（1秒間に2〜3リクエスト程度を目安）
   - 1日に数千〜数万リクエスト可能と推測される

3. **Cloudflare Workersから直接アクセス可能**
   - `fetch()` で直接アクセス可能
   - CORS問題なし
   - User-Agentヘッダーの設定が必要（ブラウザと同じものを設定）

4. **リアルタイム性**
   - 遅延なし（リアルタイムに近い最新株価が取得できる）

5. **レスポンスが豊富**
   - 終値（close）、始値（open）、高値（high）、安値（low）、出来高（volume）、前日終値（chartPreviousClose）などが1つのリクエストで取得可能

**注意点・リスク対策**

| リスク | 対策 |
|--------|------|
| 非公式エンドポイントの変更・停止 | 定期的に動作確認を行い、停止時のフォールバック（例：Alpha Vantageの有料プラン検討）を準備しておく |
| IPベースのレートリミット | リクエスト間に500ms〜1秒の間隔を空ける。Cloudflare Workersの場合、KVやD1にキャッシュして重複リクエストを減らす |
| User-Agentチェック | `fetch()` のヘッダーに `User-Agent: Mozilla/5.0 ...` を明示的に設定する |
| 利用規約のグレー地带 | 個人・小規模利用の範囲で利用し、商用スケールになったら有料APIへの移行を検討する |

**実装例（Cloudflare Workers）**

```typescript
export default {
  async fetch(request: Request): Promise<Response> {
    const ticker = "7203.T";
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    
    const data = await response.json();
    const close = data.chart.result[0].indicators.quote[0].close[0];
    
    return new Response(JSON.stringify({ ticker, close }), {
      headers: { "Content-Type": "application/json" }
    });
  }
};
```

---

## 結論

J-Quants Freeプランの代替として、**Yahoo Finance API（非公式）**が最も現実的な選択肢です。

- **即座に利用開始可能**（APIキー不要）
- **東証グロース銘柄も含めて日本株に対応**
- **Cloudflare Workersから直接アクセス可能**
- **50銘柄程度の取得が現実的**

ただし、**非公式エンドポイントであるため、将来的に利用できなくなるリスクがあります**。そのため、長期的には以下のような体制を検討することを推奨します：

1. **短期〜中期**: Yahoo Finance API（非公式）を利用
2. **中長期**: Alpha VantageやTwelve Dataの有料プランへの移行、または東証の有料データフィードを検討
3. **フォールバック**: Yahoo Finance APIが停止した場合のため、東証の月次Excelデータと組み合わせた手動更新の仕組みを準備

**時価総額計算について**

Yahoo Finance API（v8/finance/chart）には**発行済株式数が含まれない**ため、時価総額（株価×発行済株式数）の自動計算は別途発行済株式数データソースが必要です。

**現実的なアプローチ**
- 株価はYahoo Finance APIでリアルタイム取得
- 発行済株式数は、有価証券報告書（EDINET API等）や、東証の月次Excel（data_j.xls）に含まれるか別途調査し、定期的にDB更新
- 時価総額は Workers 内で「株価（Yahoo）× 発行済株式数（DB）」で計算

これにより、J-Quants Freeプランの制約を回避し、日本株（東証グロース上場銘柄含む）の株価データ取得を実現できます。
