#!/usr/bin/env python3
"""Calculate HK IPO sponsor or underwriter sample performance metrics."""

from __future__ import annotations

import argparse
import csv
import json
import statistics
from pathlib import Path
from typing import Any


FIELD_ALIASES = {
    "company": ["company", "name", "公司"],
    "listing_date": ["listing_date", "list_date", "上市日"],
    "issue_price": ["issue_price", "offer_price", "发行价"],
    "first_day_close": ["first_day_close", "first_close", "首日收盘价"],
    "current_price": ["current_price", "latest_price", "当前价", "最近价格"],
    "source": ["source", "来源"],
}


def parse_number(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    text = str(value).strip()
    if not text or text.upper() in {"N/A", "NA", "NULL", "-"}:
        return None
    for token in ["HK$", "HKD", "$", ",", "港元"]:
        text = text.replace(token, "")
    text = text.strip()
    try:
        return float(text)
    except ValueError:
        return None


def pick(row: dict[str, Any], key: str) -> Any:
    for name in FIELD_ALIASES[key]:
        if name in row:
            return row[name]
    return None


def load_rows(path: Path) -> list[dict[str, Any]]:
    if path.suffix.lower() == ".json":
        data = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(data, dict) and "data" in data:
            data = data["data"]
        if not isinstance(data, list):
            raise SystemExit("JSON input must be a list or an object with a data list")
        return [dict(item) for item in data]

    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def pct(value: float) -> float:
    return round(value * 100, 2)


def median(values: list[float]) -> float | None:
    if not values:
        return None
    return round(statistics.median(values), 2)


def analyze(rows: list[dict[str, Any]]) -> dict[str, Any]:
    first_valid = []
    current_valid = []
    exclusions = []

    for index, row in enumerate(rows, start=1):
        company = pick(row, "company") or f"row_{index}"
        issue = parse_number(pick(row, "issue_price"))
        first_close = parse_number(pick(row, "first_day_close"))
        current = parse_number(pick(row, "current_price"))
        normalized = {
            "company": company,
            "listing_date": pick(row, "listing_date"),
            "issue_price": issue,
            "first_day_close": first_close,
            "current_price": current,
            "source": pick(row, "source"),
        }

        if issue is None or issue <= 0:
            exclusions.append({"company": company, "reason": "missing_or_invalid_issue_price"})
            continue

        if first_close is None:
            exclusions.append({"company": company, "reason": "missing_first_day_close"})
        else:
            first_return = (first_close / issue) - 1
            first_valid.append({**normalized, "first_day_return_pct": pct(first_return)})

        if current is None:
            exclusions.append({"company": company, "reason": "missing_current_price"})
        else:
            current_return = (current / issue) - 1
            current_valid.append({**normalized, "current_return_pct": pct(current_return)})

    first_returns = [item["first_day_return_pct"] for item in first_valid]
    current_returns = [item["current_return_pct"] for item in current_valid]
    result = {
        "input_rows": len(rows),
        "first_day_valid_samples": len(first_valid),
        "current_valid_samples": len(current_valid),
        "first_day_break_rate_pct": pct(sum(item["first_day_close"] < item["issue_price"] for item in first_valid) / len(first_valid)) if first_valid else None,
        "current_break_rate_pct": pct(sum(item["current_price"] < item["issue_price"] for item in current_valid) / len(current_valid)) if current_valid else None,
        "current_gain_rate_pct": pct(sum(item["current_price"] > item["issue_price"] for item in current_valid) / len(current_valid)) if current_valid else None,
        "first_day_median_return_pct": median(first_returns),
        "current_median_return_pct": median(current_returns),
        "exclusions": exclusions,
        "first_day_samples": first_valid,
        "current_samples": current_valid,
    }
    return result


def print_markdown(result: dict[str, Any]) -> None:
    print("## 保荐人 / 承销商样本统计")
    print()
    print(f"- 输入样本：{result['input_rows']}")
    print(f"- 首日有效样本：{result['first_day_valid_samples']}")
    print(f"- 当前有效样本：{result['current_valid_samples']}")
    print(f"- 首日破发率：{result['first_day_break_rate_pct']}")
    print(f"- 当前破发率：{result['current_break_rate_pct']}")
    print(f"- 当前上涨率：{result['current_gain_rate_pct']}")
    print(f"- 首日收益中位数：{result['first_day_median_return_pct']}")
    print(f"- 当前收益中位数：{result['current_median_return_pct']}")
    if result["exclusions"]:
        print()
        print("### 剔除 / 缺字段")
        for item in result["exclusions"]:
            print(f"- {item['company']}: {item['reason']}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Calculate sponsor or underwriter IPO sample break rates and median returns."
    )
    parser.add_argument("input", help="CSV or JSON file with IPO sample rows.")
    parser.add_argument("--json", action="store_true", help="Print JSON instead of Markdown.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    rows = load_rows(Path(args.input))
    result = analyze(rows)
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True))
    else:
        print_markdown(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
