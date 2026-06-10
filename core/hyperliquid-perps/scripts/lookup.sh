#!/usr/bin/env bash
# 按标的（ticker / 公司名片段）查 Hyperliquid 上所有 dex 的镜像合约
#
# 用法：
#   ./lookup.sh NVDA                # 列所有匹配 dex，按 OI 倒序
#   ./lookup.sh NVDA --best         # 仅返回 OI 最大的那一个（给 stock-analyzer 用）
#   ./lookup.sh NVDA --json         # JSON 输出，含 24h funding 历史摘要
#
# 输出 CSV 列：dex,coin,maxLev,markPx,prevDayPx,chgPct,fundingHourly,fundingApr,oiBase,oiNotionalUsd,dayNtlVlmUsd,premiumBp
# JSON 模式额外字段：funding24hAvgApr, funding24hMaxApr, funding24hMinApr, candle1hCount
#
# 查找优先级：
#   1. Hyperliquid 主平台（原生加密资产 BTC/ETH/SOL 等，OI>1M USD）
#   2. HIP-3 DEX 镜像（传统资产 NVDA/TSLA/SP500 等）

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

# ---------- Step 1：先查主平台（原生加密，OI 显著大于 HIP-3）----------
MAIN_CTX=$(curl -sf -X POST "$API" -H 'Content-Type: application/json' \
  -d '{"type":"metaAndAssetCtxs"}' 2>/dev/null || echo "")

MAIN_RAW=""
IS_MAIN=false

if [ -n "$MAIN_CTX" ]; then
  MAIN_RAW=$(echo "$MAIN_CTX" | python3 -c "
import json, sys
ticker = '${TICKER}'.upper()
data = json.load(sys.stdin)
meta, ctxs = data[0], data[1]
for i, asset in enumerate(meta.get('universe', [])):
    if asset['name'].upper() == ticker:
        ctx = ctxs[i]
        fh       = float(ctx.get('funding', 0) or 0)
        mark     = float(ctx.get('markPx', 0) or 0)
        prev     = float(ctx.get('prevDayPx', 0) or 0)
        oi_base  = float(ctx.get('openInterest', 0) or 0)
        oi_ntl   = oi_base * mark
        if oi_ntl < 1e6:   # OI < 1M USD：无真实市场，不用主平台
            break
        vol      = float(ctx.get('dayNtlVlm', 0) or 0)
        prem     = float(ctx.get('premium', 0) or 0) * 10000
        fapr     = fh * 24 * 365 * 100
        chg      = (mark - prev) / prev * 100 if prev > 0 else 0
        max_lev  = asset.get('maxLeverage', 0) or 0
        # 输出与 snapshot.sh 相同的 CSV 格式（dex 列用 'hl' 标识主平台）
        print(f'hl,{ticker},{max_lev},{mark},{prev},{chg:.2f},{fh},{fapr:.2f},{oi_base},{oi_ntl:.0f},{vol:.0f},{prem:.2f}')
        break
" 2>/dev/null || echo "")
fi

if [ -n "$MAIN_RAW" ]; then
  IS_MAIN=true
  FILTERED="$MAIN_RAW"
else
  # ---------- Step 2：HIP-3 fallback（传统资产镜像）----------
  # snapshot.sh 第一行总是 CSV 表头，用 tail -n +2 丢掉
  RAW=$("$DIR/snapshot.sh" --filter "$TICKER" | tail -n +2)

  if [ -z "$RAW" ]; then
    echo "❌ Hyperliquid 上未找到 $TICKER 的镜像合约" >&2
    echo "   提示：可用 ./snapshot.sh 看全市场，确认拼写"  >&2
    exit 2
  fi

  # 严格匹配 coin 名后半段（避免 NVDA 误匹配到 BMNVDA 类标的）
  FILTERED=$(echo "$RAW" | awk -F',' -v OFS=',' -v t="$TICKER" '
    {
      coin_field = $2;
      gsub(/"/, "", coin_field);
      n = split(coin_field, parts, ":");
      coin_name = parts[n];
      if (toupper(coin_name) == t || index(toupper(coin_name), t) > 0) print $0
    }
  ')

  if [ -z "$FILTERED" ]; then FILTERED="$RAW"; fi
fi

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

    # 主平台用原始 TICKER 查 fundingHistory；HIP-3 用 dex:COIN 格式
    if [ "$IS_MAIN" = "true" ]; then
      FH_COIN="$TICKER"
    else
      FH_COIN="$COIN"
    fi

    # 拉过去 24h funding history
    START=$(($(date +%s) - 86400))000
    FH_JSON=$(curl -s -X POST "$API" -H 'Content-Type: application/json' \
      -d "$(jq -nc --arg c "$FH_COIN" --argjson t "$START" '{type:"fundingHistory", coin:$c, startTime:$t}')")
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
