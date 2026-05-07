-- 有価証券報告書のLLM評価キャッシュ
CREATE TABLE IF NOT EXISTS company_evaluations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,                        -- 銘柄コード (4桁)
  doc_id TEXT NOT NULL,                      -- EDINET書類ID
  submitted_date TEXT NOT NULL,              -- 提出日 (YYYY-MM-DD)
  is_owner_company INTEGER NOT NULL,         -- 0 or 1
  management_score INTEGER NOT NULL,         -- 1-100
  reason TEXT NOT NULL,                      -- 評価理由
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(code, doc_id)
);

CREATE INDEX IF NOT EXISTS idx_company_evaluations_code ON company_evaluations(code);
CREATE INDEX IF NOT EXISTS idx_company_evaluations_doc_date ON company_evaluations(code, submitted_date);

-- 選定銘柄（Picks）
CREATE TABLE IF NOT EXISTS picks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                 -- 銘柄コード
  name TEXT NOT NULL,                        -- 銘柄名
  market_cap REAL NOT NULL,                  -- 時価総額（億円）
  net_cash REAL NOT NULL,                    -- ネットキャッシュ（億円）
  real_per REAL NOT NULL,                    -- 実質PER
  sales_growth REAL,                         -- 売上成長率（平均）
  profit_growth REAL,                        -- 営業利益成長率（平均）
  is_owner_company INTEGER NOT NULL,         -- オーナー企業フラグ
  management_score INTEGER NOT NULL,         -- 経営評価スコア
  picked_at TEXT DEFAULT CURRENT_TIMESTAMP,  -- 選定日
  initial_price REAL,                        -- 選定時株価
  initial_topix REAL,                        -- 選定時TOPIX
  status TEXT DEFAULT 'active'               -- active / closed
);

CREATE INDEX IF NOT EXISTS idx_picks_status ON picks(status);
CREATE INDEX IF NOT EXISTS idx_picks_picked_at ON picks(picked_at);

-- 日次トラッキング（Alpha計測）
CREATE TABLE IF NOT EXISTS daily_tracking (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,                        -- 銘柄コード
  date TEXT NOT NULL,                        -- 日付 (YYYY-MM-DD)
  price REAL NOT NULL,                       -- 終値
  topix REAL NOT NULL,                       -- TOPIX終値
  alpha REAL NOT NULL,                       -- 超過収益率 (%)
  cumulative_alpha REAL NOT NULL,            -- 累積超過収益率 (%)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(code, date)
);

CREATE INDEX IF NOT EXISTS idx_daily_tracking_code_date ON daily_tracking(code, date);
CREATE INDEX IF NOT EXISTS idx_daily_tracking_date ON daily_tracking(date);
