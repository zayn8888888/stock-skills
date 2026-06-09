#!/usr/bin/env python3
"""
富途 OpenD K 线数据拉取模块。

连接本地 OpenD → 订阅实时K线 → 返回标准化 DataFrame。
如需指定日期范围则走历史K线接口（受数据权限限制）。
"""

from __future__ import annotations

import os
import re
import sys

import pandas as pd

from futu import OpenQuoteContext, KLType, SubType, AuType, RET_OK

FUTU_OPEND_HOST = os.getenv("FUTU_OPEND_HOST", "127.0.0.1")
FUTU_OPEND_PORT = int(os.getenv("FUTU_OPEND_PORT", "11111"))

KTYPE_MAP = {
    "1m": KLType.K_1M,
    "3m": KLType.K_3M,
    "5m": KLType.K_5M,
    "15m": KLType.K_15M,
    "30m": KLType.K_30M,
    "60m": KLType.K_60M,
    "1d": KLType.K_DAY,
    "1w": KLType.K_WEEK,
    "1M": KLType.K_MON,
}

KTYPE_TO_SUBTYPE = {
    KLType.K_1M: SubType.K_1M,
    KLType.K_3M: SubType.K_3M,
    KLType.K_5M: SubType.K_5M,
    KLType.K_15M: SubType.K_15M,
    KLType.K_30M: SubType.K_30M,
    KLType.K_60M: SubType.K_60M,
    KLType.K_DAY: SubType.K_DAY,
    KLType.K_WEEK: SubType.K_WEEK,
    KLType.K_MON: SubType.K_MON,
}

REHAB_MAP = {
    "none": AuType.NONE,
    "forward": AuType.QFQ,
    "backward": AuType.HFQ,
}

CODE_PATTERN = re.compile(r"^(US|HK|SH|SZ|SG)\.\w+$")


def fetch_kline(
    code: str,
    ktype: str = "1d",
    num: int = 100,
    rehab: str = "forward",
    start: str | None = None,
    end: str | None = None,
) -> pd.DataFrame:
    """
    从 OpenD 拉取 K 线数据。

    无 start/end 时走 subscribe + get_cur_kline（实时通道，数据最新）。
    有 start/end 时走 request_history_kline（历史通道，受数据权限限制）。

    Returns:
        DataFrame with columns: date, open, high, low, close, volume

    Raises:
        SystemExit(1): OpenD 连接失败或代码格式错误
        SystemExit(2): API 返回错误或数据不足
    """
    if not CODE_PATTERN.match(code):
        print(
            f"错误: 股票代码格式无效 '{code}'，正确格式: US.AAPL / HK.00700 / SH.600519",
            file=sys.stderr,
        )
        sys.exit(1)

    if ktype not in KTYPE_MAP:
        print(f"错误: 不支持的 K 线类型 '{ktype}'，可选: {list(KTYPE_MAP.keys())}", file=sys.stderr)
        sys.exit(1)

    if rehab not in REHAB_MAP:
        print(f"错误: 不支持的复权类型 '{rehab}'，可选: {list(REHAB_MAP.keys())}", file=sys.stderr)
        sys.exit(1)

    kl_type = KTYPE_MAP[ktype]
    au_type = REHAB_MAP[rehab]

    try:
        ctx = OpenQuoteContext(host=FUTU_OPEND_HOST, port=FUTU_OPEND_PORT)
    except Exception as e:
        print(
            f"错误: 无法连接 OpenD ({FUTU_OPEND_HOST}:{FUTU_OPEND_PORT})，请确认 OpenD 已启动。\n{e}",
            file=sys.stderr,
        )
        sys.exit(1)

    try:
        if start or end:
            ret, data, _ = ctx.request_history_kline(
                code, start=start, end=end,
                ktype=kl_type, autype=au_type, max_count=num,
            )
            if ret != RET_OK:
                print(f"错误: 历史K线接口返回失败 — {data}", file=sys.stderr)
                sys.exit(2)
        else:
            sub_type = KTYPE_TO_SUBTYPE.get(kl_type, SubType.K_DAY)
            ret, msg = ctx.subscribe([code], [sub_type], subscribe_push=False)
            if ret != RET_OK:
                print(f"错误: 订阅失败 — {msg}", file=sys.stderr)
                sys.exit(2)
            ret, data = ctx.get_cur_kline(code, num, kl_type, au_type)
            if ret != RET_OK:
                print(f"错误: 获取实时K线失败 — {data}", file=sys.stderr)
                sys.exit(2)

        if len(data) < 2:
            print(f"错误: 返回数据不足 2 根 K 线（仅 {len(data)} 根）", file=sys.stderr)
            sys.exit(2)

        df = data[["time_key", "open", "high", "low", "close", "volume"]].copy()
        df.rename(columns={"time_key": "date"}, inplace=True)
        return df
    finally:
        ctx.close()
