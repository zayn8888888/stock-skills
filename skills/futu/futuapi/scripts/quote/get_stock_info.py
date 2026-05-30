#!/usr/bin/env python3
"""
获取股票基本信息（含估值字段）

功能：获取指定股票的静态信息 + 估值字段，包含 PE-TTM / PB / 股息率 /
      总市值 / 流通市值 / 52 周高低 / 换手率
用法：python get_stock_info.py US.AAPL,HK.00700

接口限制：
- 每 30 秒内最多请求 10 次（get_market_snapshot 限制）
- 每次最多返回 200 个

参数说明：
- codes: 股票代码，逗号分隔

返回字段说明：
- pe_ttm_ratio / pe_ratio: TTM PE / 静态 PE（N/A 时为 0）
- pb_ratio: 市净率
- dividend_ratio: 近 12 个月股息率(TTM)，百分比形式（20 表示 20%）
- total_market_val / circular_market_val: 总市值 / 流通市值，单位元
- high_price_52weeks / low_price_52weeks: 52 周最高 / 最低价
- turnover_rate: 换手率，百分比形式（20 表示 20%）
- listing_date: 此字段停止维护
"""
import argparse
import json
import sys
import os as _os
sys.path.insert(0, _os.path.normpath(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..")))
from common import (
    create_quote_context,
    check_ret,
    safe_close,
    is_empty,
    safe_get,
    safe_float,
    safe_int,
    format_enum,
    df_to_records,
)


def get_stock_info(codes_str, output_json=False):
    codes = [c.strip() for c in codes_str.split(",") if c.strip()]
    ctx = None
    try:
        ctx = create_quote_context()
        ret, data = ctx.get_market_snapshot(codes)
        check_ret(ret, data, ctx, "获取股票信息")

        if is_empty(data):
            if output_json:
                print(json.dumps({"data": []}))
            else:
                print("无数据")
            return

        records = []
        for i in range(len(data)):
            row = data.iloc[i] if hasattr(data, "iloc") else data[i]
            records.append({
                "code": safe_get(row, "code", default=""),
                "name": safe_get(row, "name", default=""),
                "lot_size": safe_int(safe_get(row, "lot_size", default=0)),
                "stock_type": format_enum(safe_get(row, "stock_type", "sec_type", default="")),
                "listing_date": safe_get(row, "listing_date", default=""),
                "last_price": safe_float(safe_get(row, "last_price", default=0)),
                # 估值字段（来自 get_market_snapshot，N/A 时为 0）
                "pe_ttm_ratio": safe_float(safe_get(row, "pe_ttm_ratio", default=0)),
                "pe_ratio": safe_float(safe_get(row, "pe_ratio", default=0)),
                "pb_ratio": safe_float(safe_get(row, "pb_ratio", default=0)),
                "dividend_ratio": safe_float(safe_get(row, "dividend_ratio", default=0)),
                # 市值（单位：元）
                "total_market_val": safe_float(safe_get(row, "total_market_val", default=0)),
                "circular_market_val": safe_float(safe_get(row, "circular_market_val", default=0)),
                # 52 周区间
                "high_price_52weeks": safe_float(safe_get(row, "high_price_52weeks", default=0)),
                "low_price_52weeks": safe_float(safe_get(row, "low_price_52weeks", default=0)),
                # 换手率（百分比形式，20 表示 20%）
                "turnover_rate": safe_float(safe_get(row, "turnover_rate", default=0)),
            })

        if output_json:
            print(json.dumps({"data": records}, ensure_ascii=False))
        else:
            print("=" * 70)
            print("股票基本信息")
            print("=" * 70)
            for r in records:
                print(f"\n  {r['code']}  {r['name']}")
                print(f"    每手: {r['lot_size']}  类型: {r['stock_type']}  上市日: {r['listing_date']}")
                print(f"    最新价: {r['last_price']}")
                print(f"    PE(TTM): {r['pe_ttm_ratio']}  PE(静态): {r['pe_ratio']}  PB: {r['pb_ratio']}  股息率: {r['dividend_ratio']}%")
                print(f"    总市值: {r['total_market_val']}  流通市值: {r['circular_market_val']}")
                print(f"    52周高: {r['high_price_52weeks']}  52周低: {r['low_price_52weeks']}  换手率: {r['turnover_rate']}%")
            print("\n" + "=" * 70)

    except Exception as e:
        if output_json:
            print(json.dumps({"error": str(e)}, ensure_ascii=False))
        else:
            print(f"错误: {e}")
        sys.exit(1)
    finally:
        safe_close(ctx)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="获取股票基本信息")
    parser.add_argument("codes", help="股票代码（逗号分隔），如 US.AAPL,HK.00700")
    parser.add_argument("--json", action="store_true", dest="output_json", help="输出 JSON 格式")
    args = parser.parse_args()
    get_stock_info(args.codes, args.output_json)
