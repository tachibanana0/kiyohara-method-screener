#!/usr/bin/env python3
"""Yahoo Finance data fetcher for Kiyohara Method.
Combines price, TOPIX, and balance sheet in one call.
Usage: python3 yfinance_data.py <code1> <code2> ...
Output: JSON { "topix": number, "stocks": [...] }
"""
import sys, json

try:
    import yfinance as yf
except ImportError:
    print(json.dumps({"error": "yfinance not installed. Run: pip install yfinance"}))
    sys.exit(0)


def get_stock_data(code: str) -> dict:
    """Get price, market cap, and balance sheet for one stock."""
    try:
        ticker = yf.Ticker(f"{code}.T")
        info = ticker.info
        price = (info.get("regularMarketPrice") or
                 info.get("currentPrice") or
                 info.get("previousClose") or 0)
        market_cap = info.get("marketCap", 0) or 0
        shares = info.get("sharesOutstanding", 0) or 0

        bs = ticker.balance_sheet
        if bs is None or bs.empty:
            bsq = ticker.quarterly_balance_sheet
            bs = bsq if (bsq is not None and not bsq.empty) else None

        net_cash_ratio = 0
        net_cash = 0
        if bs is not None and not bs.empty:
            latest = bs.iloc[:, 0]

            def val(key: str) -> float:
                try:
                    v = latest.get(key, 0)
                    return float(v) if v and v > 0 else 0.0
                except (KeyError, IndexError, TypeError):
                    return 0.0

            current_assets = val("Current Assets")
            securities = val("Available For Sale Securities")
            if securities == 0:
                securities = val("Investmentin Financial Assets")
            if current_assets == 0:
                current_assets = val("Total Assets")

            total_liabilities = val("Total Liabilities Net Minority Interest")

            net_cash = current_assets + (securities * 0.70) - total_liabilities
            net_cash_ratio = round(net_cash / market_cap, 4) if market_cap > 0 else 0

        return {
            "code": code,
            "price": float(price),
            "market_cap": float(market_cap),
            "shares": int(shares),
            "net_cash": net_cash,
            "net_cash_ratio": net_cash_ratio,
        }
    except Exception as e:
        return {"code": code, "error": str(e), "price": 0, "net_cash_ratio": 0}


def get_topix() -> float:
    try:
        t = yf.Ticker("^N225")
        info = t.info
        return float(info.get("regularMarketPrice") or info.get("currentPrice") or 0)
    except Exception:
        return 0


if __name__ == "__main__":
    codes = sys.argv[1:] if len(sys.argv) > 1 else []
    if not codes:
        print(json.dumps({"error": "no codes provided"}))
        sys.exit(1)

    topix = get_topix()
    stocks = []
    for code in codes:
        stocks.append(get_stock_data(code))

    result = {"topix": topix, "stocks": stocks}
    print(json.dumps(result, ensure_ascii=False))
