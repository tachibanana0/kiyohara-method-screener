-- EDINETコードマッピングキャッシュ
-- J-Quants v2 /equities/master から取得した EdinetCode を保存
CREATE TABLE IF NOT EXISTS edinet_mappings (
  code TEXT NOT NULL PRIMARY KEY,            -- 銘柄コード (5桁)
  edinet_code TEXT NOT NULL,                 -- EDINET企業コード (例: E35303)
  company_name TEXT NOT NULL,                -- 会社名
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_edinet_mappings_edinet_code ON edinet_mappings(edinet_code);
