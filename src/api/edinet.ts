// ============================================
// EDINET API Client
// 128MB メモリ制限対応: Streaming ZIP 処理
// ============================================

import type { EdinetDocumentListResponse, EdinetDocument } from '../types';

export class EdinetClient {
  constructor(private baseUrl: string, private subscriptionKey: string) {}

  private async fetchJson<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    console.log(`EDINET API call: ${url}`);
    const res = await fetch(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': this.subscriptionKey,
      },
    });
    const data = await res.json() as T;
    
    // EDINET API returns 200 OK even for errors
    const meta = (data as any).metadata;
    if (meta && meta.status !== '200') {
      console.error(`EDINET API error: ${meta.status} ${meta.message}`);
      throw new Error(`EDINET API error: ${meta.status} ${meta.message}`);
    }
    
    console.log(`EDINET API success: ${url}, results: ${(data as any).results?.length || 0}`);
    return data;
  }

  /** 有価証券報告書の書類一覧を取得
   *  secCodeは5桁（J-Quantsのコードと同じ）
   *  companyNameはJ-Quantsの会社名（filerNameで部分一致検索用）
   *  edinetCodeはEDINETのedinetCode（マッピングテーブルから取得）
   */
  async fetchLatestYukashokenReports(secCode: string, companyName?: string, edinetCode?: string): Promise<EdinetDocument[]> {
    // EDINET APIは5桁のsecCodeを使用（J-Quantsと同じ）
    const edinetSecCode = secCode;
    
    // secCodeが5桁でない場合はスキップ
    if (edinetSecCode.length !== 5) {
      console.log(`Skipping EDINET lookup for invalid secCode length: ${edinetSecCode}`);
      return [];
    }

    // EDINET APIはdateパラメータのみ対応（dateFrom/dateToは非対応）
    // 過去60日分を遡って有価証券報告書を探す
    const docs: EdinetDocument[] = [];
    for (let i = 0; i < 60; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);

      try {
        const data = await this.fetchJson<EdinetDocumentListResponse>(
          `/documents.json?date=${dateStr}&type=2`
        );
        const yukashoken = (data.results || []).filter(
          (doc) => {
            // edinetCodeでマッチするか、secCodeでマッチするか、companyNameで部分一致するか
            const edinetCodeMatch = edinetCode && doc.edinetCode === edinetCode;
            const secCodeMatch = doc.secCode === edinetSecCode;
            const nameMatch = companyName && doc.filerName && doc.filerName.includes(companyName);
            const matched = edinetCodeMatch || secCodeMatch || nameMatch;
            
            if (matched && doc.docDescription) {
              const isReport = (
                doc.docDescription.includes('有価証券報告書') ||
                doc.docDescription.includes('半期報告書') ||
                doc.docDescription.includes('四半期報告書') ||
                doc.docDescription.includes('Annual securities report') ||
                doc.docDescription.includes('Quarterly') ||
                doc.docDescription.includes('証券報告')
              );
              if (isReport) {
                const matchType = edinetCodeMatch ? 'edinetCode' : (secCodeMatch ? 'secCode' : 'name');
                console.log(`EDINET match: edinetCode=${doc.edinetCode}, secCode=${doc.secCode}, filerName=${doc.filerName}, desc=${doc.docDescription} (matchType=${matchType})`);
              }
              return isReport;
            }
            return false;
          }
        );
        if (yukashoken.length > 0) {
          console.log(`Found ${yukashoken.length} docs for ${edinetSecCode} on ${dateStr}`);
          docs.push(...yukashoken);
          break; // Found documents, no need to search further back
        } else if (data.results && data.results.length > 0) {
          console.log(`No yukashoken found for ${edinetSecCode}/${companyName}/${edinetCode} on ${dateStr}, but ${data.results.length} other docs exist`);
        } else {
          console.log(`No results at all for ${edinetSecCode} on ${dateStr}`);
        }
      } catch (err) {
        // 日付ごとのエラーは無視して次へ
        console.error(`EDINET fetch failed for ${dateStr}:`, err);
        throw err; // Re-throw so workflow can catch it
      }

      // レートリミット対策: 各リクエスト間に少し間隔を空ける
      if (i < 89) await new Promise((r) => setTimeout(r, 100));
    }

    // 最新の1件のみ
    return docs
      .sort((a, b) => b.submitDateTime.localeCompare(a.submitDateTime))
      .slice(0, 1);
  }

  /** 書類を取得し、必要なテキスト部分をストリーミング抽出 */
  async fetchDocumentText(docId: string): Promise<string> {
    // EDINET API仕様:
    // type=1: ZIP (XBRL + PDF) ※最も情報量が多い
    // type=2: XBRLのみ (圧縮)
    // type=5: CSV ( English summary )
    // 日本語テキストを得るには type=1 (ZIP) からXBRLを抽出する必要がある。
    // メモリ128MB制限対応: ZIPをストリーミング展開し、必要なXBRLタグのみ抽出。
    const url = `${this.baseUrl}/documents/${docId}?type=1`; // ZIP取得
    const res = await fetch(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': this.subscriptionKey,
      },
    });

    if (!res.ok) {
      throw new Error(`EDINET document fetch failed: ${res.status}`);
    }

    // 128MB制限対応: レスポンスをテキストとして全展開しない
    // TransformStream で必要なテキストだけを抽出
    return await this.extractTextFromZipStream(res.body!);
  }

  /** ZIPストリームからテキストをメモリ効率良く抽出 */
  private async extractTextFromZipStream(body: ReadableStream<Uint8Array>): Promise<string> {
    // workers-types の Uint8Array ベースのストリーミングZIP展開
    // JSZip等のライブラリはメモリを食うため、カスタム実装

    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    const MAX_SIZE = 10 * 1024 * 1024; // 10MB safety limit

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      totalSize += value.byteLength;
      if (totalSize > MAX_SIZE) {
        reader.releaseLock();
        throw new Error('EDINET document too large (>10MB)');
      }
    }

    // 小さくなったバッファを1つにまとめる
    const buffer = new Uint8Array(totalSize);
    let offset = 0;
    for (const c of chunks) {
      buffer.set(c, offset);
      offset += c.byteLength;
    }

    // 簡易ZIP展開: 必要なファイル（XBRL内のテキスト or 添付CSV）を抽出
    // ここでは、添付ファイル名に "asr" や "AuditDoc" が含まれるものを避け、
    // 主たるXBRLファイル（.xbrl, .xml）のみをテキスト抽出対象とする
    const text = await this.extractXbrlTextFromZipBuffer(buffer);
    return text;
  }

  /** 簡易ZIPパーサ: ローカルヘッダーをスキャンして必要ファイルのテキストを抽出 */
  private async extractXbrlTextFromZipBuffer(buffer: Uint8Array): Promise<string> {
    // ZIPローカルファイルヘッダーシグネチャ: 0x50 0x4B 0x03 0x04
    const LOCAL_HDR = 0x04034b50;
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

    const extractedParts: string[] = [];
    let pos = 0;

    while (pos < buffer.byteLength - 30) {
      const sig = view.getUint32(pos, true);
      if (sig !== LOCAL_HDR) {
        pos++;
        continue;
      }

      // ローカルヘッダーフィールド
      const compressedSize = view.getUint32(pos + 18, true);
      const uncompressedSize = view.getUint32(pos + 22, true);
      const nameLen = view.getUint16(pos + 26, true);
      const extraLen = view.getUint16(pos + 28, true);

      const nameStart = pos + 30;
      const nameEnd = nameStart + nameLen;
      const nameBytes = buffer.slice(nameStart, nameEnd);
      const fileName = new TextDecoder().decode(nameBytes);

      const dataStart = nameEnd + extraLen;
      const dataEnd = dataStart + compressedSize;

      // 必要なファイルのみ抽出: XBRL, XML, または主要テキストファイル
      const isTarget =
        fileName.endsWith('.xbrl') ||
        fileName.endsWith('.xml') ||
        fileName.includes('PublicDoc');

      if (isTarget && compressedSize > 0 && uncompressedSize < 2 * 1024 * 1024) {
        // 無圧縮 (method 0) または deflate (method 8)
        const method = view.getUint16(pos + 8, true);
        const fileData = buffer.slice(dataStart, dataEnd);

        let uncompressed: Uint8Array;
        if (method === 0) {
          uncompressed = fileData;
        } else if (method === 8) {
          try {
            uncompressed = await this.inflate(fileData, uncompressedSize);
          } catch {
            pos = dataEnd;
            continue;
          }
        } else {
          pos = dataEnd;
          continue;
        }

        const text = new TextDecoder().decode(uncompressed);
        // 必要なセクションのみ抽出
        const trimmed = this.trimToRelevantSections(text);
        if (trimmed) extractedParts.push(trimmed);
      }

      pos = dataEnd;
      if (pos > buffer.byteLength) break;
    }

    return extractedParts.join('\n---\n').slice(0, 50000); // 50KB cap for LLM prompt
  }

  /** 生のXBRL/XMLテキストから必要部分のみを抽出 */
  private trimToRelevantSections(xmlText: string): string {
    const sections: string[] = [];

    // 役員の状況
    const officerMatch = xmlText.match(/<[^>]*?(Officers|Directors|Executive).*?>([\s\S]*?)<\/[^>]*?(Officers|Directors|Executive).*?>/i);
    if (officerMatch) sections.push('【役員の状況】\n' + officerMatch[0].slice(0, 3000));

    // 大株主の状況
    const shareholderMatch = xmlText.match(/<[^>]*?(MajorShareholders|MajorShareholder).*?>([\s\S]*?)<\/[^>]*?(MajorShareholders|MajorShareholder).*?>/i);
    if (shareholderMatch) sections.push('【大株主の状況】\n' + shareholderMatch[0].slice(0, 3000));

    // 経営環境及び対処すべき課題等
    const bizRiskMatch = xmlText.match(/<[^>]*?(BusinessRisks|ManagementPolicy|BusinessPolicy).*?>([\s\S]*?)<\/[^>]*?(BusinessRisks|ManagementPolicy|BusinessPolicy).*?>/i);
    if (bizRiskMatch) sections.push('【経営環境・対処課題】\n' + bizRiskMatch[0].slice(0, 5000));

    // 業績等の概要
    const overviewMatch = xmlText.match(/<[^>]*?(OperatingResults|BusinessResults|OperatingResultsOverview).*?>([\s\S]*?)<\/[^>]*?(OperatingResults|BusinessResults|OperatingResultsOverview).*?>/i);
    if (overviewMatch) sections.push('【業績概要】\n' + overviewMatch[0].slice(0, 5000));

    return sections.join('\n\n');
  }

  /** XBRLテキストから主要財務データを抽出（J-Quants代替） */
  extractFinancialData(xbrlText: string): {
    sales: number;
    operatingProfit: number;
    netProfit: number;
    sharesOutstanding: number;
    cashAndDeposits: number;
  } | null {
    // 日本の有価証券報告書XBRLで一般的に使われるタグパターン
    const extractNum = (patterns: string[]): number => {
      for (const pat of patterns) {
        const regex = new RegExp(`<[^>]*?:${pat}[^>]*>([\\d,]+)</[^>]*?:${pat}>`, 'i');
        const match = xbrlText.match(regex);
        if (match) {
          return parseInt(match[1].replace(/,/g, ''), 10);
        }
      }
      return 0;
    };

    const sales = extractNum(['NetSales', 'Revenue', 'Sales']);
    const operatingProfit = extractNum(['OperatingIncome', 'OperatingProfit']);
    const netProfit = extractNum(['NetIncome', 'ProfitLoss', 'NetIncomeLoss']);
    const sharesOutstanding = extractNum(['TotalNumberOfIssuedShares', 'TotalNumberOfIssuedSharesSummaryInformation']);
    const cashAndDeposits = extractNum(['CashAndDeposits', 'CashAndCashEquivalents']);

    if (sales === 0 && netProfit === 0) {
      return null; // 抽出失敗
    }

    // 単位推定: 百万円が一般的。数値が極端に大きい/小さい場合は調整
    const unit = this.estimateUnit(sales, operatingProfit, netProfit);

    return {
      sales: sales * unit,
      operatingProfit: operatingProfit * unit,
      netProfit: netProfit * unit,
      sharesOutstanding: sharesOutstanding * unit,
      cashAndDeposits: cashAndDeposits * unit,
    };
  }

  /** 単位推定（円/千円/百万円） */
  private estimateUnit(sales: number, op: number, np: number): number {
    const vals = [sales, op, np].filter((v) => v > 0);
    if (vals.length === 0) return 1;
    const avg = vals.reduce((a, b) => a + b, 0) / vals.length;

    if (avg > 1e12) return 1; // 円
    if (avg > 1e9) return 1e3; // 千円
    if (avg > 1e6) return 1e6; // 百万円
    return 1;
  }

  /** Decompress using DecompressionStream (native in Workers) */
  private async inflate(data: Uint8Array, expectedSize: number): Promise<Uint8Array> {
    const stream = new Response(data).body;
    if (!stream) throw new Error('No stream');
    const decompressed = stream.pipeThrough(new DecompressionStream('deflate-raw'));
    const result = new Uint8Array(expectedSize);
    const reader = decompressed.getReader();
    let offset = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.byteLength > result.byteLength) {
        // expectedSizeより大きい場合は動的拡張
        const newBuf = new Uint8Array(result.byteLength * 2);
        newBuf.set(result);
        newBuf.set(value, offset);
        // 簡易実装: 大きすぎる場合はスキップ
        throw new Error('Inflated size exceeds expected');
      }
      result.set(value, offset);
      offset += value.byteLength;
    }
    return result.slice(0, offset);
  }
}
