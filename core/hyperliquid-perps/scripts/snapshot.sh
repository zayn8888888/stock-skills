#!/usr/bin/env bash
# Hyperliquid HIP-3 全 dex × 全合约快照
#
# 输出 CSV：dex,coin,maxLev,markPx,prevDayPx,chgPct,fundingHourly,fundingApr,oiBase,oiNotionalUsd,dayNtlVlmUsd,premiumBp
#
# 用法：
#   ./snapshot.sh                              # 全部 dex
#   ./snapshot.sh xyz                          # 仅 TradeXYZ
#   ./snapshot.sh xyz km cash                  # 指定多个 dex
#   ./snapshot.sh --filter NVDA TSLA SP500     # 过滤合约名（不区分大小写）
#   ./snapshot.sh --top 30                     # 仅输出 OI 名义敞口前 30
#
# 依赖：curl + jq
set -euo pipefail

API='https://api.hyperliquid.xyz/info'

# ---------- 参数解析 ----------
DEXES=()
FILTERS=()
TOP=0
mode='dex'
for arg in "$@"; do
  case "$arg" in
    --filter) mode='filter' ;;
    --top)    mode='top' ;;
    --help|-h)
      grep -E '^# ' "$0" | sed 's/^# //'
      exit 0 ;;
    *)
      case "$mode" in
        dex)    DEXES+=("$arg") ;;
        filter) FILTERS+=("$(echo "$arg" | tr '[:lower:]' '[:upper:]')") ;;
        top)    TOP="$arg"; mode='dex' ;;
      esac ;;
  esac
done

# ---------- 拉 dex 清单 ----------
DEXES_JSON=$(curl -s -X POST "$API" -H 'Content-Type: application/json' -d '{"type":"perpDexs"}')
if [ -z "$DEXES_JSON" ] || [ "$(echo "$DEXES_JSON" | jq 'type')" != '"array"' ]; then
  echo "❌ perpDexs 拉取失败" >&2; exit 1
fi

if [ ${#DEXES[@]} -eq 0 ]; then
  # 默认跳过主加密 dex（null）和纯加密 dex（hyna/para），只跑跑传统资产相关的
  # 兼容 bash 3.x（macOS 默认）：用 while read 代替 mapfile
  while IFS= read -r line; do
    DEXES+=("$line")
  done < <(echo "$DEXES_JSON" | jq -r '.[] | select(. != null) | .name' \
            | grep -Ev '^(hyna|para|abcd)$')
fi

# ---------- 输出表头 ----------
echo "dex,coin,maxLev,markPx,prevDayPx,chgPct,fundingHourly,fundingApr,oiBase,oiNotionalUsd,dayNtlVlmUsd,premiumBp"

# ---------- 逐 dex 拉 metaAndAssetCtxs ----------
TMPALL=$(mktemp)
trap 'rm -f "$TMPALL"' EXIT

for dex in "${DEXES[@]}"; do
  PAYLOAD=$(jq -nc --arg d "$dex" '{type:"metaAndAssetCtxs", dex:$d}')
  RESP=$(curl -s -X POST "$API" -H 'Content-Type: application/json' -d "$PAYLOAD")

  # 校验
  if [ "$(echo "$RESP" | jq 'type')" != '"array"' ]; then
    echo "⚠️ dex=$dex 响应异常，跳过" >&2; continue
  fi
  uniLen=$(echo "$RESP" | jq '.[0].universe | length')
  ctxLen=$(echo "$RESP" | jq '.[1] | length')
  if [ "$uniLen" != "$ctxLen" ]; then
    echo "⚠️ dex=$dex universe($uniLen) vs ctxs($ctxLen) 长度不一致" >&2; continue
  fi

  # 合并 universe + ctx 输出 CSV 行
  echo "$RESP" | jq -r --arg dex "$dex" '
    [.[0].universe, .[1]]
    | transpose
    | .[]
    | . as [$u,$c]
    | ($c.markPx        | tonumber? // 0)         as $mark
    | ($c.prevDayPx     | tonumber? // 0)         as $prev
    | ($c.funding       | tonumber? // 0)         as $fh
    | ($c.openInterest  | tonumber? // 0)         as $oi
    | ($c.dayNtlVlm     | tonumber? // 0)         as $vol
    | ($c.premium       | tonumber? // 0)         as $prem
    | (if $prev > 0 then ($mark - $prev) / $prev * 100 else 0 end)  as $chg
    | ($fh * 24 * 365 * 100)                       as $fapr
    | ($oi * $mark)                                as $oiNtl
    | ($prem * 10000)                              as $premBp
    | [
        $dex,
        ($u.name // ""),
        ($u.maxLeverage // 0),
        $mark,
        $prev,
        ($chg     | . * 100 | round / 100),
        $fh,
        ($fapr    | . * 100 | round / 100),
        $oi,
        ($oiNtl   | round),
        ($vol     | round),
        ($premBp  | . * 100 | round / 100)
      ]
    | @csv
  ' >> "$TMPALL"
done

# ---------- 过滤 ----------
RESULT="$TMPALL"
if [ ${#FILTERS[@]} -gt 0 ]; then
  TMPF=$(mktemp)
  PATTERN=$(IFS='|'; echo "${FILTERS[*]}")
  grep -iE "($PATTERN)" "$TMPALL" > "$TMPF" || true
  RESULT="$TMPF"
fi

# ---------- 排序（按 oiNotionalUsd 第10列倒序） ----------
sort -t',' -k10 -nr "$RESULT" | {
  if [ "$TOP" -gt 0 ]; then head -n "$TOP"; else cat; fi
}

[ -f "${TMPF:-}" ] && rm -f "$TMPF" || true
