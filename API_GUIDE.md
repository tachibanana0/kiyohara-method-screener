# API 使用ガイド - 試行錯誤で得た知見

## J-Quants API

### 基本情報
- **v2 API（推奨）**: `https://api.jquants.com/v2`
- **v1 API**: `https://api.jquants.com/v1`
- **認証**: ヘッダー `x-api-key: {APIキー}`
- **レートリミット**: 1分間に50回まで（超過すると403/429エラー）

### 正常に動作するエンドポイント

#### 1. 銘柄一覧取得（v2）
```
GET /v2/equities/master
```
**レスポンス例:**
```json
{
  "data": [
    {
      "Code": "29810",
      "CoName": "ランディックス",
      "Mkt": "0113",
      "EdinetCode": "E35303"
    }
  ]
}
```
**注意点:**
- `Mkt: "0113"` がグロース市場
- `EdinetCode` フィールドは**存在するが空の場合がある**
- 全件取得可能（ページネーション不要）

#### 2. 財務データ取得（v2）
```
GET /v2/fins/summary?code={銘柄コード}
```
**レスポンス例:**
```json
{
  "data": [
    {
      "CurPerEn": "2024-12-31",
      "Sales": 10000000000,
      "OP": 500000000,
      "NP": 300000000,
      "CashEq": 2000000000,
      "ShOutFY": 5000000
    }
  ]
}
```
**注意点:**
- `CurPerEn`: 決算期末日（YYYY-MM-DD）
- `Sales`: 売上高（円）
- `OP`: 営業利益（円）
- `NP`: 純利益（円）
- `CashEq`: 現金及び現金同等物（円）
- `ShOutFY`: 発行済株式数（株）
- **データは2024年までしか入っていない**（2025年分は未登録）
- 配列は最新が最後（昇順）
- 銘柄コードは5桁（例: `29810`）

### 使用不可のエンドポイント

#### ❌ edinetCode取得（v1）
```
GET /v1/edinetCode?code={銘柄コード}
```
**結果:** 403 Forbidden
**原因:** J-Quants API v1は認証方式が異なる（Bearerトークンが必要）

#### ❌ 上場銘柄一覧（v1）
```
GET /v1/listed?code={銘柄コード}
```
**結果:** 403 Forbidden
**原因:** 同上

### 代替案
- v2 `/equities/master` の `EdinetCode` フィールドを使用
- ただし空の場合があるため、フォールバックが必要

### レートリミット対策
```typescript
async fetchStatements(code: string, retries = 2): Promise<JQuantsStatement[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // API呼び出し
    } catch (err) {
      if (err.message?.includes('403') || err.message?.includes('429')) {
        await sleep(30000); // 30秒待機
        continue;
      }
      throw err;
    }
  }
}
```

---

## EDINET API

### 基本情報
- **v2 API**: `https://disclosure.edinet-fsa.go.jp/api/v2`
- **認証**: ヘッダー `Ocp-Apim-Subscription-Key: {サブスクリプションキー}`
- **レートリミット**: 明示的な制限なし（常識的な範囲で）

### 主要エンドポイント

#### 1. 書類検索
```
GET /v2/documents.json?{パラメータ}
```

**必須パラメータ:**
| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `type` | `2` | 書類検索 |
| `date` | `YYYY-MM-DD~YYYY-MM-DD` | 検索期間 |
| `docTypeList` | `["1","2","3"]` | 書類タイプ（配列） |

**docTypeList の値:**
| 値 | 書類タイプ |
|----|-----------|
| `"1"` | 臨時報告書 |
| `"2"` | 有価証券報告書 |
| `"3"` | 半期報告書・四半期報告書 |

**フィルタリングパラメータ（いずれか1つ）:**
| パラメータ | 説明 | 注意点 |
|-----------|------|--------|
| `edinetCode` | EDINET企業コード（例: `E35303`） | **最も正確** |
| `secCode` | 証券コード（例: `2981`） | **nullが多い** |
| `filerName` | 提出者名（部分一致） | **不安定** |

**ソート・制限:**
| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `sort` | `descending` / `ascending` | 提出日順 |
| `limit` | `100` | 最大取得件数 |

**レスポンス例:**
```json
{
  "results": [
    {
      "docId": "S100XXXX",
      "submitDateTime": "2024-06-28 15:00",
      "filerName": "ランディックス株式会社",
      "edinetCode": "E35303",
      "secCode": null,
      "docDescription": "有価証券報告書－第25期(2024/04/01－2025/03/31)"
    }
  ]
}
```

### ⚠️ 重要な知見

#### secCode は null が多い
- 79件中73件が `secCode: null`
- 有価証券報告書でも null になる
- **secCode での検索は信頼できない**

#### edinetCode は有効だが事前取得が困難
- 検索結果の `edinetCode` フィールドは正常に返る
- J-Quants API からの変換が403エラーで不可
- EDINET API v1 `/corporates.json` も403エラー

#### 会社名マッチングの注意点
- `filerName` は提出者名（会社名と一致しない場合がある）
- 部分一致で検索可能
- 「株式会社」の位置が異なる場合がある（例: 「株式会社ランディックス」vs「ランディックス株式会社」）
- 旧社名・新社名の変更に対応が必要

#### 有価証券報告書の提出時期
- 決算期末から**3ヶ月以内**に提出義務
- 例: 3月決算 → 6月提出、12月決算 → 3月提出
- 3月決算（日本企業の約60%）は6月までに提出
- **180日検索では約半数の会社しかカバーできない**
- **365日検索でほぼ全カバー可能**

### 推奨検索戦略
```typescript
// 1. edinetCode が取得できればそれを使用
if (edinetCode) {
  params.set('edinetCode', edinetCode);
}
// 2. secCode は null の可能性があるので使用しない
// 3. 会社名で部分一致検索（フォールバック）
else {
  params.set('filerName', companyName);
}

// 検索期間は365日
const daysBack = 365;

// docTypeList は有価証券報告書のみ（品質重視）
docTypeList: '["2"]'
```

---

## Yahoo Finance API

### 基本情報
- **URL**: `https://query1.finance.yahoo.com/v8/finance/chart/{ticker}`
- **認証**: なし（User-Agent ヘッダー必須）
- **レートリミット**: 明示的な制限なし（500ms間隔推奨）

### ティッカー形式
| 市場 | 形式 | 例 |
|------|------|-----|
| 東証 | `{コード}.T` | `2981.T`（末尾0削除） |
| TOPIX | `^N225` | 日経平均（TOPIXではない） |

**注意:** Yahoo Finance に TOPIX のティッカーはない。`^N225` は日経平均株価。

### リクエスト例
```
GET /v8/finance/chart/2981.T?interval=1d&range=1d
Headers:
  User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36
  Accept: application/json
```

### レスポンス例
```json
{
  "chart": {
    "result": [{
      "indicators": {
        "quote": [{
          "close": [3500],
          "open": [3450],
          "high": [3520],
          "low": [3440],
          "volume": [100000]
        }]
      }
    }]
  }
}
```

### 注意点
- `close` 配列の最初の要素が終値
- 取引休場日はデータが返らない
- 5桁コード（例: `29810`）は末尾0を削除して `2981` に変換
- レートリミット対策: 500ms 間隔を空ける

---

## OpenRouter API

### 基本情報
- **URL**: `https://openrouter.ai/api/v1/chat/completions`
- **認証**: ヘッダー `Authorization: Bearer {APIキー}`
- **推奨モデル**: `google/gemini-2.5-flash`（高速・安価）

### リクエスト例
```json
POST /chat/completions
Headers:
  Content-Type: application/json
  Authorization: Bearer sk-or-...
  HTTP-Referer: https://your-domain.com
  X-Title: Your App Name

Body:
{
  "model": "google/gemini-2.5-flash",
  "messages": [
    {
      "role": "user",
      "content": "Evaluate this company..."
    }
  ],
  "temperature": 0.1
}
```

### レスポンス例
```json
{
  "choices": [{
    "message": {
      "content": "{\"is_owner_company\": 1, \"management_score\": 75, \"reason\": \"創業家経営\"}"
    }
  }]
}
```

### JSON パースの安定性
**問題:** 日本語プロンプトだとJSON以外に説明文が追加されることがある

**解決策:**
1. プロンプトを英語にする
2. 「ONLY JSON」を明示
3. 正規表現でJSON部分を抽出: `/\{[\s\S]*\}/`

```typescript
const content = data.choices[0]?.message?.content || '';
const jsonMatch = content.match(/\{[\s\S]*\}/);
if (jsonMatch) {
  return JSON.parse(jsonMatch[0]);
}
```

### レートリミット対策
- 1秒間隔を空ける
- `temperature: 0.1` で一貫性を高める

---

## 全体のパイプライン

```
1. J-Quants v2 /equities/master → 銘柄一覧取得
2. J-Quants v2 /fins/summary → 財務データ取得
3. 定量スクリーニング → 候補銘柄選定
4. Yahoo Finance → 株価・TOPIX取得
5. EDINET v2 /documents.json → 有価証券報告書検索
6. EDINET v2 /documents/{docId} → 書類ダウンロード（XBRL/ZIP）
7. JSZip でZIP解凍 → テキスト抽出
8. OpenRouter → LLM評価
9. Worker API /api/screening/receive → D1保存
```

### タイミング制約
| API | 間隔 | 理由 |
|-----|------|------|
| J-Quants | 12秒 | レートリミット（50回/分） |
| Yahoo Finance | 500ms | レートリミット対策 |
| EDINET | 1秒 | 常識的な範囲 |
| OpenRouter | 1秒 | レートリミット対策 |

### 全体の所要時間
- 定量スクリーニング: 約5分
- EDINET検索 + LLM評価: 約10-15分（銘柄数による）
- **合計: 約15-20分**

---

## 既知の問題と回避策

| 問題 | 回避策 |
|------|--------|
| J-Quants v1 が403 | v2 `/equities/master` の `EdinetCode` フィールドを使用 |
| EDINET secCode がnull | edinetCode または会社名で検索 |
| EDINET 会社名不一致 | 部分一致＋正規化（「株式会社」除去） |
| LLM JSONパース失敗 | 英語プロンプト＋正規表現抽出 |
| Yahoo Finance TOPIXなし | 日経平均（^N225）で代用 |
| J-Quants 財務データ2024まで | 2025年分は登録待ち |
