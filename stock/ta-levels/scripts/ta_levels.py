#!/usr/bin/env python3
"""
确定性技术分析：支撑位与压力位计算器

用法:
    python ta_levels.py --code US.AAPL --method all
    python ta_levels.py --code HK.00700 --ktype 1d --num 100 --method pivot
    python ta_levels.py --file data.csv --method all
    python ta_levels.py --file data.csv --method swing --lookback 5

CSV 格式（列名大小写不敏感）:
    date, open, high, low, close[, volume]

退出码: 0=成功, 1=参数错误, 2=数据错误
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

import pandas as pd


# ---------------------------------------------------------------------------
# 计算方法
# ---------------------------------------------------------------------------


def pivot_classic(df: pd.DataFrame) -> dict[str, Any]:
    """经典枢轴点（上一周期 HLC 均值为 PP）。"""
    prev = df.iloc[-2] if len(df) > 1 else df.iloc[-1]
    H, L, C = float(prev["high"]), float(prev["low"]), float(prev["close"])
    PP = (H + L + C) / 3
    return {
        "method": "pivot_classic",
        "resistance": [round(2 * PP - L, 4), round(PP + (H - L), 4), round(H + 2 * (PP - L), 4)],
        "support":    [round(2 * PP - H, 4), round(PP - (H - L), 4), round(L - 2 * (H - PP), 4)],
        "detail": {
            "PP": round(PP, 4),
            "R1": round(2 * PP - L, 4),   "R2": round(PP + (H - L), 4),   "R3": round(H + 2 * (PP - L), 4),
            "S1": round(2 * PP - H, 4),   "S2": round(PP - (H - L), 4),   "S3": round(L - 2 * (H - PP), 4),
        },
    }


def pivot_fibonacci(df: pd.DataFrame) -> dict[str, Any]:
    """斐波那契枢轴点（以 HLC 均值为 PP，用斐波那契比例展开）。"""
    prev = df.iloc[-2] if len(df) > 1 else df.iloc[-1]
    H, L, C = float(prev["high"]), float(prev["low"]), float(prev["close"])
    PP = (H + L + C) / 3
    R = H - L
    return {
        "method": "pivot_fibonacci",
        "resistance": [round(PP + 0.382 * R, 4), round(PP + 0.618 * R, 4), round(PP + R, 4)],
        "support":    [round(PP - 0.382 * R, 4), round(PP - 0.618 * R, 4), round(PP - R, 4)],
        "detail": {
            "PP":  round(PP, 4),
            "R1": round(PP + 0.382 * R, 4), "R2": round(PP + 0.618 * R, 4), "R3": round(PP + R, 4),
            "S1": round(PP - 0.382 * R, 4), "S2": round(PP - 0.618 * R, 4), "S3": round(PP - R, 4),
        },
    }


def pivot_camarilla(df: pd.DataFrame) -> dict[str, Any]:
    """Camarilla 枢轴点（基于上一周期振幅 * 1.1 系数，日内短线最常用）。"""
    prev = df.iloc[-2] if len(df) > 1 else df.iloc[-1]
    H, L, C = float(prev["high"]), float(prev["low"]), float(prev["close"])
    R = H - L
    r4, r3, r2, r1 = C + R * 1.1 / 2, C + R * 1.1 / 4, C + R * 1.1 / 6, C + R * 1.1 / 12
    s1, s2, s3, s4 = C - R * 1.1 / 12, C - R * 1.1 / 6, C - R * 1.1 / 4, C - R * 1.1 / 2
    return {
        "method": "pivot_camarilla",
        "resistance": [round(r1, 4), round(r2, 4), round(r3, 4), round(r4, 4)],
        "support":    [round(s1, 4), round(s2, 4), round(s3, 4), round(s4, 4)],
        "detail": {
            "R4": round(r4, 4), "R3": round(r3, 4), "R2": round(r2, 4), "R1": round(r1, 4),
            "S1": round(s1, 4), "S2": round(s2, 4), "S3": round(s3, 4), "S4": round(s4, 4),
        },
    }


def swing_highs_lows(df: pd.DataFrame, lookback: int = 5) -> dict[str, Any]:
    """
    摆动高低点：以 lookback 为左右各 N 根 K 线窗口识别局部极值。
    返回最近 5 个摆动高点（压力）和最近 5 个摆动低点（支撑）。
    """
    highs: list[dict[str, Any]] = []
    lows:  list[dict[str, Any]] = []
    n = len(df)
    dates = df["date"].astype(str).tolist() if "date" in df.columns else [str(i) for i in range(n)]

    for i in range(lookback, n - lookback):
        window_h = df["high"].iloc[i - lookback: i + lookback + 1]
        window_l = df["low"].iloc[i - lookback: i + lookback + 1]
        val_h = float(df["high"].iloc[i])
        val_l = float(df["low"].iloc[i])

        if val_h == float(window_h.max()):
            highs.append({"bar": i, "date": dates[i], "price": round(val_h, 4), "type": "swing_high"})
        if val_l == float(window_l.min()):
            lows.append({"bar": i, "date": dates[i], "price": round(val_l, 4), "type": "swing_low"})

    recent_h = highs[-5:]
    recent_l = lows[-5:]
    current = float(df["close"].iloc[-1])
    resistance = sorted([x["price"] for x in recent_h if x["price"] > current])
    support    = sorted([x["price"] for x in recent_l if x["price"] <= current], reverse=True)
    return {
        "method": "swing_highs_lows",
        "params": {"lookback": lookback},
        "resistance": resistance,
        "support":    support,
        "detail": recent_h + recent_l,
    }


def fibonacci_retracement(df: pd.DataFrame, lookback: int = 50) -> dict[str, Any]:
    """
    斐波那契回调：在最近 lookback 根 K 线内找最高点和最低点，
    从高点向低点展开 0%/23.6%/38.2%/50%/61.8%/78.6%/100% 等位。
    """
    recent = df.iloc[-lookback:]
    actual_lookback = len(recent)
    swing_high = float(recent["high"].max())
    swing_low  = float(recent["low"].min())
    diff = swing_high - swing_low

    levels = {
        "0.0%":   round(swing_high, 4),
        "23.6%":  round(swing_high - 0.236 * diff, 4),
        "38.2%":  round(swing_high - 0.382 * diff, 4),
        "50.0%":  round(swing_high - 0.500 * diff, 4),
        "61.8%":  round(swing_high - 0.618 * diff, 4),
        "78.6%":  round(swing_high - 0.786 * diff, 4),
        "100%":   round(swing_low, 4),
    }
    current = float(df["close"].iloc[-1])
    resistance = sorted([v for v in levels.values() if v > current])
    support    = sorted([v for v in levels.values() if v <= current], reverse=True)
    return {
        "method": "fibonacci_retracement",
        "params": {"lookback": lookback, "actual_lookback": actual_lookback},
        "swing_high": swing_high,
        "swing_low":  swing_low,
        "resistance": resistance[:3],
        "support":    support[:3],
        "detail": levels,
    }


def moving_averages(df: pd.DataFrame) -> dict[str, Any]:
    """均线（MA5/10/20/60/120/250）动态支撑/压力：当前收盘价上方为压力，下方为支撑。"""
    close   = df["close"].astype(float)
    current = round(float(close.iloc[-1]), 4)
    periods = [5, 10, 20, 60, 120, 250]
    mas: dict[str, float] = {}
    for p in periods:
        if len(close) >= p:
            mas[f"MA{p}"] = round(float(close.rolling(p).mean().iloc[-1]), 4)

    resistance = sorted([v for v in mas.values() if v > current])
    support    = sorted([v for v in mas.values() if v <= current], reverse=True)
    return {
        "method": "moving_averages",
        "current_price": current,
        "resistance": resistance[:3],
        "support":    support[:3],
        "detail": mas,
    }


def volume_profile(df: pd.DataFrame, bins: int = 20) -> dict[str, Any]:
    """
    成交量剖面（Volume Profile）：
    将价格区间等分为 bins 个区间，统计每个区间的累计成交量，
    找出高成交量节点（HVN）作为支撑/压力，POC 为最大成交量价格。
    需要 volume 列。
    """
    if "volume" not in df.columns or df["volume"].isna().all():
        return {"method": "volume_profile", "error": "缺少 volume 列或全为空"}

    price_min = float(df["low"].min())
    price_max = float(df["high"].max())
    if price_max == price_min:
        return {"method": "volume_profile", "error": "价格无波动，无法分箱"}

    bin_size = (price_max - price_min) / bins
    vol_by_bin: dict[int, float] = {}

    for _, row in df.iterrows():
        idx = int((float(row["close"]) - price_min) / bin_size)
        idx = max(0, min(bins - 1, idx))
        vol_by_bin[idx] = vol_by_bin.get(idx, 0.0) + float(row["volume"])

    sorted_bins = sorted(vol_by_bin.items(), key=lambda x: x[1], reverse=True)
    poc_idx = sorted_bins[0][0]
    poc = round(price_min + (poc_idx + 0.5) * bin_size, 4)

    top_hvn = [
        {"price": round(price_min + (idx + 0.5) * bin_size, 4), "volume": round(vol, 0)}
        for idx, vol in sorted_bins[:5]
    ]
    current = float(df["close"].iloc[-1])
    hvn_prices = [x["price"] for x in top_hvn]

    return {
        "method": "volume_profile",
        "params": {"bins": bins},
        "poc": poc,
        "resistance": sorted([p for p in hvn_prices if p > current]),
        "support":    sorted([p for p in hvn_prices if p <= current], reverse=True),
        "detail": {"top_hvn": top_hvn, "bin_size": round(bin_size, 4)},
    }


# ---------------------------------------------------------------------------
# 工厂与 CLI
# ---------------------------------------------------------------------------

METHODS: dict[str, Any] = {
    "pivot_classic":    pivot_classic,
    "pivot_fibonacci":  pivot_fibonacci,
    "pivot_camarilla":  pivot_camarilla,
    "swing":            swing_highs_lows,
    "fibonacci":        fibonacci_retracement,
    "ma":               moving_averages,
    "vp":               volume_profile,
}

PIVOT_GROUP   = ["pivot_classic", "pivot_fibonacci", "pivot_camarilla"]
ALL_METHODS   = list(METHODS.keys())


def _run_method(name: str, df: pd.DataFrame, args: argparse.Namespace) -> dict[str, Any]:
    fn = METHODS[name]
    if name == "swing":
        return fn(df, lookback=args.lookback)
    if name == "fibonacci":
        return fn(df, lookback=args.fib_lookback)
    if name == "vp":
        return fn(df, bins=args.vp_bins)
    return fn(df)


def _text_output(results: list[dict[str, Any]], df: pd.DataFrame, source: str) -> None:
    current = round(float(df["close"].iloc[-1]), 4)
    print(f"\n{'='*60}")
    print(f"支撑/压力分析  |  来源: {source}  |  共 {len(df)} 根 K 线")
    print(f"当前价格: {current}")
    print(f"{'='*60}")
    for r in results:
        method = r.get("method", "unknown")
        print(f"\n[{method.upper()}]")
        if "error" in r:
            print(f"  ⚠  {r['error']}")
            continue
        res = r.get("resistance", [])
        sup = r.get("support",    [])
        if res:
            print(f"  压力位: {res}")
        if sup:
            print(f"  支撑位: {sup}")
        detail = r.get("detail", {})
        if isinstance(detail, dict):
            for k, v in detail.items():
                print(f"    {k:>10}: {v}")
        elif isinstance(detail, list):
            for item in detail:
                tag = "▲" if item.get("type") == "swing_high" else "▼"
                print(f"    {tag} {item['date']:>12}  {item['price']}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="确定性支撑/压力位计算器",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--code",        help="股票代码，富途格式（US.AAPL / HK.00700 / SH.600519）")
    group.add_argument("--file",        help="OHLCV CSV 文件路径")
    parser.add_argument("--ktype",      default="1d",
                        choices=["1m", "3m", "5m", "15m", "30m", "60m", "1d", "1w", "1M"],
                        help="K 线类型（默认 1d，仅 --code 模式）")
    parser.add_argument("--num",        type=int, default=100,
                        help="K 线根数（默认 100，仅 --code 模式）")
    parser.add_argument("--rehab",      default="forward",
                        choices=["none", "forward", "backward"],
                        help="复权类型（默认 forward，仅 --code 模式）")
    parser.add_argument("--method",     default="all",
                        choices=ALL_METHODS + ["all", "pivot"],
                        help="计算方法（默认 all）")
    parser.add_argument("--lookback",   type=int, default=5,  help="摆动高低点左右窗口（默认 5）")
    parser.add_argument("--fib-lookback", type=int, default=50, dest="fib_lookback",
                        help="斐波那契回调回看周期数（默认 50）")
    parser.add_argument("--vp-bins",    type=int, default=20, dest="vp_bins",
                        help="成交量剖面分箱数（默认 20）")
    parser.add_argument("--output",     default="text", choices=["json", "text"],
                        help="输出格式（默认 text）")
    args = parser.parse_args()

    # 读取数据
    if args.code:
        from futu_data import fetch_kline
        df = fetch_kline(args.code, ktype=args.ktype, num=args.num, rehab=args.rehab)
        source = f"{args.code} ({args.ktype}, {args.num}根, 复权={args.rehab})"
    elif args.file:
        try:
            df = pd.read_csv(args.file)
        except Exception as e:
            print(json.dumps({"error": f"读取文件失败: {e}"}))
            sys.exit(2)
        source = args.file
    else:
        parser.error("必须提供 --code 或 --file")

    df.columns = [c.strip().lower() for c in df.columns]
    required = {"open", "high", "low", "close"}
    missing  = required - set(df.columns)
    if missing:
        print(json.dumps({"error": f"缺少必要列: {sorted(missing)}"}))
        sys.exit(2)

    for col in ["open", "high", "low", "close"]:
        df[col] = pd.to_numeric(df[col], errors="coerce")
    if "volume" in df.columns:
        df["volume"] = pd.to_numeric(df["volume"], errors="coerce").fillna(0)

    df = df.dropna(subset=["open", "high", "low", "close"]).reset_index(drop=True)
    if len(df) < 2:
        print(json.dumps({"error": "有效数据行数不足 2 根"}))
        sys.exit(2)

    # 选择方法
    if args.method == "all":
        names = ALL_METHODS
    elif args.method == "pivot":
        names = PIVOT_GROUP
    else:
        names = [args.method]

    results = [_run_method(n, df, args) for n in names]

    if args.output == "json":
        payload = {
            "source": source,
            "bars":   len(df),
            "results": results,
        }
        print(json.dumps(payload, ensure_ascii=False, indent=2))
    else:
        _text_output(results, df, source)


if __name__ == "__main__":
    main()
