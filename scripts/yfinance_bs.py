#!/usr/bin/env python3
"""Yahoo Finance Balance Sheet fetcher for Kiyohara Method net cash ratio.
Usage: python3 yfinance_bs.py <code> [<code2> ...]
Output: JSON array of balance sheet data per code
"""
import sys, json
try:
    import yfinance as yf
except ImportError:
    print(json.dumps({"error": "yfinance not installed. Run: pip install yfinance"}))
    sys.exit(0)

def get_net_cash(code: str) -> dict:
    try:
        ticker = yf.Ticker(f"{code}.T")
        bs = ticker.balance_sheet
        if bs is None or bs.empty:
            bsq = ticker.quarterly_balance_sheet
            if bsq is None or bsq.empty:
                return {"code": code, "error": "no balance sheet data"}
            bs = bsq

        latest = bs.iloc[:, 0]

        def val(key: str) -> float:
            try:
                v = latest.get(key, 0)
                return float(v) if v and v > 0 else 0.0
            except (KeyError, IndexError, TypeError):
                return 0.0

        current_assets = val("Current Assets")
        securities = val("Available For Sale Securities")
        # Try alternative field names
        if securities == 0:
            securities = val("Investmentin Financial Assets")
        if current_assets == 0:
            current_assets = val("Total Assets")

        total_liabilities = val("Total Liabilities Net Minority Interest")
        if total_liabilities == 0:
            total_liabilities = val("Total Debt") + val("Current Liabilities")

        net_cash = current_assets + (securities * 0.70) - total_liabilities
        market_cap_raw = ticker.info.get("marketCap", 0) or 0
        market_cap = float(market_cap_raw) if market_cap_raw else 0

        # Also get basic financial data for screening
        info = ticker.info
        shares = info.get("sharesOutstanding", 0) or 0

        return {
            "code": code,
            "current_assets": current_assets,
            "securities": securities,
            "total_liabilities": total_liabilities,
            "net_cash": net_cash,
            "market_cap": market_cap,
            "shares_outstanding": int(shares),
            "net_cash_ratio": round(net_cash / market_cap, 4) if market_cap > 0 else 0,
        }
    except Exception as e:
        return {"code": code, "error": str(e)}


if __name__ == "__main__":
    codes = sys.argv[1:] if len(sys.argv) > 1 else []
    if not codes:
        print(json.dumps({"error": "no codes provided"}))
        sys.exit(1)

    results = []
    for code in codes:
        r = get_net_cash(code)
        results.append(r)
        # Avoid rate limiting, but skip delay for single queries
        if len(codes) > 1:
            import time
            time.sleep(0.5)

    print(json.dumps(results, ensure_ascii=False))
