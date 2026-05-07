// ============================================
// Shared Types for Kiyohara Method Screener
// ============================================

/** J-Quants API V2: 銘柄情報 */
export interface JQuantsSymbol {
  Code: string;
  CoName: string;
  CoNameEn?: string;
  S17?: string;
  S33?: string;
  ScaleCat?: string;
  Mkt?: string;
}

/** J-Quants API V2: 財務データ（レスポンスは文字列のため、変換が必要） */
export interface JQuantsStatement {
  Code: string;
  CurPerEn: string; // YYYY-MM-DD
  CurFYSt: string;
  CurFYEn: string;
  Sales: number | string;           // 売上高
  OP: number | string;              // 営業利益
  OdP: number | string;             // 経常利益
  NP: number | string;              // 当期純利益
  TA: number | string;              // 総資産
  Eq: number | string;              // 純資産
  CashEq: number | string;          // 現金及び預金
  ShOutFY: number | string;         // 発行済株式数
}

/** J-Quants API V2: 株価情報 */
export interface JQuantsPrice {
  Code: string;
  Date: string;
  C: number;               // Close
  O: number;
  H: number;
  L: number;
  Vo: number;              // Volume
  Va: number;              // TurnoverValue
  AdjC?: number;           // Adjustment Close
}

/** 定量スクリーニング結果 */
export interface QuantScreenedStock {
  code: string;
  name: string;
  marketCap: number;      // 億円
  netCash: number;        // 億円
  realPER: number;
  salesGrowth3Y: number;  // 平均成長率
  profitGrowth3Y: number; // 平均成長率
  latestPrice: number;
  latestTopix: number;
}

/** EDINET API: 書類一覧アイテム */
export interface EdinetDocument {
  docID: string;
  edinetCode: string;
  secCode: string;
  filerName: string;
  submitDateTime: string;
  docDescription: string;
}

/** EDINET API: 書類一覧レスポンス */
export interface EdinetDocumentListResponse {
  metadata: {
    resultset: {
      count: number;
    };
  };
  results: EdinetDocument[];
}

/** LLM評価結果 (Structured Output) */
export interface LlmEvaluation {
  is_owner_company: boolean;
  management_score: number; // 1-100
  reason: string;
}

/** D1: company_evaluations 行 */
export interface CompanyEvaluationRow {
  id: number;
  code: string;
  doc_id: string;
  submitted_date: string;
  is_owner_company: number;
  management_score: number;
  reason: string;
  created_at: string;
  updated_at: string;
}

/** D1: picks 行 */
export interface PickRow {
  id: number;
  code: string;
  name: string;
  market_cap: number;
  net_cash: number;
  real_per: number;
  sales_growth: number | null;
  profit_growth: number | null;
  is_owner_company: number;
  management_score: number;
  picked_at: string;
  initial_price: number | null;
  initial_topix: number | null;
  status: string;
}

/** D1: daily_tracking 行 */
export interface DailyTrackingRow {
  id: number;
  code: string;
  date: string;
  price: number;
  topix: number;
  alpha: number;
  cumulative_alpha: number;
  created_at: string;
}

/** Workflow payload */
export interface ScreeningWorkflowParams {
  dryRun?: boolean;
}

/** Alpha tracking payload */
export interface AlphaTrackingParams {
  date?: string; // YYYY-MM-DD, defaults to today
}
