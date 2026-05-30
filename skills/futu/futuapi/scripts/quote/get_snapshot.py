#!/usr/bin/env python3
"""
获取股票市场快照

功能：获取指定股票的快照数据（最新价、开高低收、成交量等），无需订阅
用法：python get_snapshot.py US.AAPL HK.00700

接口限制：
- 每 30 秒内最多请求 60 次
- 每次请求股票代码上限 400 个
- 港股 BMP 权限下，单次请求香港证券快照数量上限 20 个
- 港股期权期货 BMP 权限下，单次请求快照数量上限 20 个

返回字段说明：
- update_time: 格式 yyyy-MM-dd HH:mm:ss，港股/A 股北京时间，美股美东时间
- turnover_rate/amplitude/bid_ask_ratio: 百分比字段，20 实际对应 20%
- pe_ratio/pb_ratio/pe_ttm_ratio/ey_ratio: 比例字段，默认不展示 %
- total_market_val/circular_market_val: 单位：元
- equity_valid: 为 True 时正股相关字段才有合法数值
- wrt_valid: 为 True 时窝轮相关字段才有合法数值
- option_valid: 为 True 时期权相关字段才有合法数值
- lot_size: 指数期权无该字段
- price_spread: 即卖一价相邻档位的报价差
- suspension: True 表示停牌
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
)


_SNAPSHOT_BATCH_SIZE = 400  # 接口限制：每次请求最多 400 个代码


def _parse_snapshot_row(row):
    """解析单条快照行为字典"""
    rec = {
        "code": safe_get(row, "code", default="N/A"),
        "name": safe_get(row, "name", default=""),
        "last_price": safe_float(safe_get(row, "last_price", default=0)),
        "open": safe_float(safe_get(row, "open_price", default=0)),
        "high": safe_float(safe_get(row, "high_price", default=0)),
        "low": safe_float(safe_get(row, "low_price", default=0)),
        "prev_close": safe_float(safe_get(row, "prev_close_price", default=0)),
        "volume": safe_int(safe_get(row, "volume", default=0)),
        "turnover": safe_float(safe_get(row, "turnover", default=0)),
        "change_rate": safe_float(safe_get(row, "change_rate", default=0)),
        "bid": safe_float(safe_get(row, "bid_price", default=0)),
        "ask": safe_float(safe_get(row, "ask_price", default=0)),
        "price_spread": safe_float(safe_get(row, "price_spread", default=0)),
        "update_time": safe_get(row, "update_time", default=""),
        "suspension": bool(safe_get(row, "suspension", default=False)),
    }
    # 盘前（pre-market）—— 仅美股；有数据时 pre_price 非零
    pre_price = safe_float(safe_get(row, "pre_price", default=0))
    if pre_price:
        rec["pre_price"] = pre_price
        rec["pre_high_price"] = safe_float(safe_get(row, "pre_high_price", default=0))
        rec["pre_low_price"] = safe_float(safe_get(row, "pre_low_price", default=0))
        rec["pre_volume"] = safe_int(safe_get(row, "pre_volume", default=0))
        rec["pre_turnover"] = safe_float(safe_get(row, "pre_turnover", default=0))
        rec["pre_change_val"] = safe_float(safe_get(row, "pre_change_val", default=0))
        rec["pre_change_rate"] = safe_float(safe_get(row, "pre_change_rate", default=0))
        rec["pre_amplitude"] = safe_float(safe_get(row, "pre_amplitude", default=0))
    # 盘后（after-hours）—— 仅美股
    after_price = safe_float(safe_get(row, "after_price", default=0))
    if after_price:
        rec["after_price"] = after_price
        rec["after_high_price"] = safe_float(safe_get(row, "after_high_price", default=0))
        rec["after_low_price"] = safe_float(safe_get(row, "after_low_price", default=0))
        rec["after_volume"] = safe_int(safe_get(row, "after_volume", default=0))
        rec["after_turnover"] = safe_float(safe_get(row, "after_turnover", default=0))
        rec["after_change_val"] = safe_float(safe_get(row, "after_change_val", default=0))
        rec["after_change_rate"] = safe_float(safe_get(row, "after_change_rate", default=0))
    # 夜盘（overnight）—— 仅美股
    overnight_price = safe_float(safe_get(row, "overnight_price", default=0))
    if overnight_price:
        rec["overnight_price"] = overnight_price
        rec["overnight_high_price"] = safe_float(safe_get(row, "overnight_high_price", default=0))
        rec["overnight_low_price"] = safe_float(safe_get(row, "overnight_low_price", default=0))
        rec["overnight_volume"] = safe_int(safe_get(row, "overnight_volume", default=0))
        rec["overnight_turnover"] = safe_float(safe_get(row, "overnight_turnover", default=0))
        rec["overnight_change_val"] = safe_float(safe_get(row, "overnight_change_val", default=0))
        rec["overnight_change_rate"] = safe_float(safe_get(row, "overnight_change_rate", default=0))
        rec["overnight_amplitude"] = safe_float(safe_get(row, "overnight_amplitude", default=0))
    return rec


def get_snapshot(codes, output_json=False):
    ctx = None
    try:
        ctx = create_quote_context()

        # 自动分批：接口限制每次最多 400 个代码
        records = []
        for batch_start in range(0, len(codes), _SNAPSHOT_BATCH_SIZE):
            batch = codes[batch_start:batch_start + _SNAPSHOT_BATCH_SIZE]
            ret, data = ctx.get_market_snapshot(batch)
            check_ret(ret, data, ctx, "获取市场快照")
            if not is_empty(data):
                for i in range(len(data)):
                    row = data.iloc[i] if hasattr(data, "iloc") else data[i]
                    records.append(_parse_snapshot_row(row))

        if not records:
            if output_json:
                print(json.dumps({"data": []}))
            else:
                print("无数据")
            return

        if output_json:
            print(json.dumps({"data": records}, ensure_ascii=False))
        else:
            print("=" * 70)
            print("市场快照")
            print("=" * 70)
            for r in records:
                susp = "  [停牌]" if r.get("suspension") else ""
                print(f"\n  {r['code']}  {r['name']}{susp}  {r.get('update_time', '')}")
                print(f"    最新: {r['last_price']}  涨跌: {r['change_rate']:+.2f}%  开盘: {r['open']}  最高: {r['high']}  最低: {r['low']}  昨收: {r['prev_close']}")
                print(f"    成交量: {r['volume']}  成交额: {r['turnover']}  买一: {r['bid']}  卖一: {r['ask']}")
                if "pre_price" in r:
                    print(f"    盘前: {r['pre_price']}  ({r['pre_change_rate']:+.2f}%)  高: {r['pre_high_price']}  低: {r['pre_low_price']}  量: {r['pre_volume']}")
                if "after_price" in r:
                    print(f"    盘后: {r['after_price']}  ({r['after_change_rate']:+.2f}%)  高: {r['after_high_price']}  低: {r['after_low_price']}  量: {r['after_volume']}")
                if "overnight_price" in r:
                    print(f"    夜盘: {r['overnight_price']}  ({r['overnight_change_rate']:+.2f}%)  高: {r['overnight_high_price']}  低: {r['overnight_low_price']}  量: {r['overnight_volume']}")
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
    parser = argparse.ArgumentParser(description="获取股票市场快照（无需订阅）")
    parser.add_argument("codes", nargs="+", help="股票代码，如 US.AAPL HK.00700")
    parser.add_argument("--json", action="store_true", dest="output_json", help="输出 JSON 格式")
    args = parser.parse_args()
    get_snapshot(args.codes, args.output_json)
