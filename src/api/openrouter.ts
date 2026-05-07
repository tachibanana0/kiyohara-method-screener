// ============================================
// OpenRouter API Client (Gemini 2.5 Flash)
// Structured Outputs (JSON Schema) 対応
// ============================================

import type { LlmEvaluation } from '../types';

const MODEL = 'google/gemini-2.5-flash';

export class OpenRouterClient {
  constructor(private apiKey: string, private baseUrl: string) {}

  async evaluateCompany(input: string | { companyName: string; marketCap: number; realPER: number; salesGrowth: number; profitGrowth: number }): Promise<LlmEvaluation> {
    const url = `${this.baseUrl}/chat/completions`;

    let systemPrompt: string;
    let userContent: string;

    if (typeof input === 'string') {
      // 従来: EDINET書類テキスト
      systemPrompt = `あなたは日本の株式投資アナリストです。有価証券報告書の抜粋テキストを読み、清原達郎氏の「わが投資術」の観点から評価してください。

【評価基準】
1. is_owner_company: 社長またはその親族・資産管理会社が大株主上位にいるか（オーナー企業か）。
2. management_score (1-100): 
   - 「経営環境及び対処すべき課題等」「業績等の概要」から、外部環境のせいにせず成長意欲や具体的な対策が語られているかを評価。
   - 景気悪化などを言い訳にしているだけの場合は低スコア（30点以下）。
   - 具体的な数値目標や事業計画が明確で前向きな場合は高スコア（70点以上）。
3. reason: スコアリングの理由と社長の保有状況の根拠を簡潔に記述（200文字程度）。

出力は必ずJSON形式で、指定されたスキーマに厳密に従ってください。`;
      userContent = `以下は有価証券報告書の抜粋です:\n\n${input.slice(0, 15000)}`;
    } else {
      // 新方式: 定量データのみ
      systemPrompt = `あなたは日本の株式投資アナリストです。清原達郎氏の「わが投資術」の観点から、与えられた企業の定量データに基づき評価してください。

【評価基準】
1. is_owner_company: この企業がオーナー企業である確率が高いか（創業者・大株主が経営に関与していると推定されるか）。小型成長株で実質PERが低い企業は、創業者が経営しているオーナー企業である可能性が高い傾向があります。
2. management_score (1-100): 
   - 売上・利益の成長性、実質PERの低さ、時価総額の小ささから経営の質を推定。
   - 高成長かつ実質PERが低い場合は、経営陣が効率的に資本を運用していると評価できます（70点以上）。
   - 成長性が低い、またはPERが高い場合は低スコア（30点以下）。
3. reason: 定量データに基づく推論と、オーナー企業と推定する根拠を簡潔に記述（200文字程度）。

出力は必ずJSON形式で、指定されたスキーマに厳密に従ってください。`;
      userContent = `以下は${input.companyName}の定量データです:
- 時価総額: ${input.marketCap.toFixed(1)}億円
- 実質PER: ${input.realPER.toFixed(1)}倍
- 売上成長率(3年): ${(input.salesGrowth * 100).toFixed(1)}%
- 営業利益成長率(3年): ${(input.profitGrowth * 100).toFixed(1)}%

このデータに基づき評価してください。`;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://kiyohara-screener.hikakunavi360.com',
        'X-Title': 'Kiyohara Method Screener',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'company_evaluation',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                is_owner_company: {
                  type: 'boolean',
                  description: '社長または親族・資産管理会社が大株主上位にいるか',
                },
                management_score: {
                  type: 'number',
                  description: '経営評価スコア (1-100)',
                },
                reason: {
                  type: 'string',
                  description: '評価理由と社長保有状況の根拠',
                },
              },
              required: ['is_owner_company', 'management_score', 'reason'],
              additionalProperties: false,
            },
          },
        },
        temperature: 0.2,
        max_tokens: 1024,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`OpenRouter API error: ${res.status} ${text}`);
    }

    const data = await res.json() as {
      choices: { message: { content: string } }[];
    };

    const rawContent = data.choices?.[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(rawContent) as LlmEvaluation;

    // スコア範囲のクリップ
    parsed.management_score = Math.max(1, Math.min(100, Math.round(parsed.management_score)));

    return parsed;
  }
}
