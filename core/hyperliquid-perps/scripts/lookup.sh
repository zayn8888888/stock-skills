#!/usr/bin/env bash
# 按标的（ticker / 公司名片段）查 Hyperliquid 上所有 dex 的镜像合约
#
# 用法：
#   ./lookup.sh NVDA                # 列所有匹配 dex，按 OI 倒序
#   ./lookup.sh NVDA --best         # 仅返回 OI 最大的那一个（给 stock-analyzer 用）
#   ./lookup.sh NVDA --json         # JSON 输出，含 24h funding 历史摘要
#
# 输出 CSV 列：dex,coin,markPx,prevDayPx,chgPct,fundingHourly,fundingApr,oiNotionalUsd,dayNtlVlmUsd,premiumBp
# JSON 模式额外字段：funding24hAvgApr, funding24hMaxApr, funding24hMinApr, candle1hCount

set -euo pipefail
API='https://api.hyperliquid.xyz/info'

if [ $# -lt 1 ]; then
  echo "Usage: $0 <TICKER> [--best|--json]" >&2
  exit 1
fi

TICKER=$(echo "$1" | tr '[:lower:]' '[:upper:]')
MODE='all'
[ "${2:-}" = '--best' ] && MODE='best'
[ "${2:-}" = '--json' ] && MODE='json'

DIR="$(cd "$(dirname "$0")" && pwd)"
# snapshot.sh 第一行总是 CSV 表头，用 tail -n +2 丢掉——否则无镜像时 RAW 会等于表头行（非空），
# 导致下方判空失效、fallback 把表头当数据行，json 模式对 "markPx" 调 tonumber 报错
RAW=$("$DIR/snapshot.sh" --filter "$TICKER" | tail -n +2)

if [ -z "$RAW" ]; then
  echo "❌ Hyperliquid 上未找到 $TICKER 的镜像合约" >&2
  echo "   提示：可用 ./snapshot.sh 看全市场，确认拼写"  >&2
  exit 2
fi

# 严格匹配 coin 名后半段（避免 NVDA 误匹配到 BMNVDA 类标的；也兼容 USA500/SP500/US500 同义）
# 但实际 grep -i 已经做模糊匹配，这里再用 awk 精确清洗
FILTERED=$(echo "$RAW" | awk -F',' -v OFS=',' -v t="$TICKER" '
  {
    # coin 形如 "xyz:NVDA"，去引号后取冒号后部分；用临时变量避免重建 $0 时改 OFS
    coin_field = $2;
    gsub(/"/, "", coin_field);
    n = split(coin_field, parts, ":");
    coin_name = parts[n];
    if (toupper(coin_name) == t || index(toupper(coin_name), t) > 0) print $0
  }
')

if [ -z "$FILTERED" ]; then FILTERED="$RAW"; fi

case "$MODE" in
  best)
    echo "$FILTERED" | head -n 1
    ;;
  all)
    echo "dex,coin,maxLev,markPx,prevDayPx,chgPct,fundingHourly,fundingApr,oiBase,oiNotionalUsd,dayNtlVlmUsd,premiumBp"
    echo "$FILTERED"
    ;;
  json)
    BEST=$(echo "$FILTERED" | head -n 1)
    DEX=$(echo "$BEST"  | awk -F',' '{gsub(/"/,"",$1); print $1}')
    COIN=$(echo "$BEST" | awk -F',' '{gsub(/"/,"",$2); print $2}')
    MARK=$(echo "$BEST" | awk -F',' '{print $4}')
    PREV=$(echo "$BEST" | awk -F',' '{print $5}')
    CHG=$(echo "$BEST"  | awk -F',' '{print $6}')
    FH=$(echo "$BEST"   | awk -F',' '{print $7}')
    FAPR=$(echo "$BEST" | awk -F',' '{print $8}')
    OIN=$(echo "$BEST"  | awk -F',' '{print $10}')
    VOL=$(echo "$BEST"  | awk -F',' '{print $11}')
    PREM=$(echo "$BEST" | awk -F',' '{print $12}')

    # 拉过去 24h funding history
    START=$(($(date +%s) - 86400))000
    FH_JSON=$(curl -s -X POST "$API" -H 'Content-Type: application/json' \
      -d "$(jq -nc --arg c "$COIN" --argjson t "$START" '{type:"fundingHistory", coin:$c, startTime:$t}')")
    FH_STATS=$(echo "$FH_JSON" | jq '
      if type == "array" and length > 0 then
        [.[] | (.fundingRate | tonumber) * 24 * 365 * 100] as $aprs
        | { count: ($aprs | length),
            avgApr: ($aprs | add / length),
            maxApr: ($aprs | max),
            minApr: ($aprs | min) }
      else { count:0, avgApr:null, maxApr:null, minApr:null } end
    ')

    jq -nc \
      --arg dex "$DEX" --arg coin "$COIN" \
      --arg mark "$MARK" --arg prev "$PREV" --arg chg "$CHG" \
      --arg fh "$FH" --arg fapr "$FAPR" \
      --arg oin "$OIN" --arg vol "$VOL" --arg prem "$PREM" \
      --argjson fhStats "$FH_STATS" \
      '{
        dex: $dex,
        coin: $coin,
        markPx: ($mark | tonumber),
        prevDayPx: ($prev | tonumber),
        chgPct: ($chg | tonumber),
        fundingHourly: ($fh | tonumber),
        fundingAprNow: ($fapr | tonumber),
        oiNotionalUsd: ($oin | tonumber),
        dayNtlVlmUsd: ($vol | tonumber),
        premiumBp: ($prem | tonumber),
        funding24h: $fhStats
      }'
    ;;
esac
