#!/usr/bin/env python3
"""
PMCC (Poor Man's Covered Call) 可行性批量扫描器
用法:
  python3 scan_pmcc.py                                  # 用默认标的池
  python3 scan_pmcc.py --discover --capital 19000       # 发现模式: 大池粗筛找候选
  python3 scan_pmcc.py --codes US.SBUX,US.KO,US.AAPL    # 自定义标的
  python3 scan_pmcc.py --capital 19000                  # 账户资金(USD)
  python3 scan_pmcc.py --leaps-days 540 --near-days 45 # 调 LEAPS/近月期限

输出:每标的 Long 多 delta 档对比 + 安全 Short 选择 + 汇总表
依赖:富途 OpenD + futuapi(复用 futuapi skill 的 common.py)
"""
import sys, os, math, argparse, time

_SKILL_DIR = os.environ.get('CLAUDE_SKILLS_DIR', os.path.expanduser('~/.claude/skills'))
for _p in [f'{_SKILL_DIR}/futuapi/scripts', os.path.expanduser('~/.claude/skills/futuapi/scripts')]:
    if os.path.isdir(_p):
        sys.path.insert(0, _p); break
from common import create_quote_context, safe_close
import pandas as pd

# ============================================================
# Black-Scholes:反推 IV + 算 delta(富途接口对 LEAPS 常返回空,自己算)
# ============================================================
RISK_FREE = 0.045  # 无风险利率近似值,利率环境大变时手动更新

def _norm_cdf(x):
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))

def bs_call(S, K, T, r, sigma):
    if sigma <= 0 or T <= 0:
        return max(S - K, 0.0)
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    d2 = d1 - sigma * math.sqrt(T)
    return S * _norm_cdf(d1) - K * math.exp(-r * T) * _norm_cdf(d2)

def bs_delta(S, K, T, r, sigma):
    if sigma <= 0 or T <= 0:
        return 1.0 if S > K else 0.0
    d1 = (math.log(S / K) + (r + 0.5 * sigma ** 2) * T) / (sigma * math.sqrt(T))
    return _norm_cdf(d1)

def iv_from_price(S, K, T, r, price, lo=0.05, hi=3.0, iters=80):
    """二分法反推 IV。price 用 mid 价(公允)"""
    if price <= max(S - K, 0.0):
        return 0.0
    for _ in range(iters):
        mid = (lo + hi) / 2
        if bs_call(S, K, T, r, mid) < price:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2

# ============================================================
# 限频重试封装:futu 期权链 60次/30秒,批量跑会限频
# ============================================================
def _call(ctx, method, *args, retries=5, **kwargs):
    fn = getattr(ctx, method)
    for i in range(retries):
        ret, data = fn(*args, **kwargs)
        if ret == 0 or str(ret) == '0':
            return data
        time.sleep(2.0 * (i + 1))  # 递增等待:2s / 4s / 6s / 8s / 10s
    raise RuntimeError(f'{method} ret={ret} 重试{retries}次仍失败')

# ============================================================
# 过滤与推荐阈值(调参只改这里,print_one 与汇总表共用)
# ============================================================
MIN_SHORT_BID = 0.30      # Short 月租最低 bid(美元)
MAX_SPREAD_RATIO = 0.5    # Short spread 相对 bid 的最大比例
MIN_DELTA = 0.78          # Long delta 下限(以 0.80 档判定)
MAX_RECOVER_MONTHS = 24   # 回本月上限
MAX_CAP_PCT = 30.0        # 单张占资金百分比上限

# ============================================================
# 标的池
# ============================================================
# 精简默认池: 低 IV 低价蓝筹(PMCC 画像) + 几只高价股对照
DEFAULT_CODES = ('US.SBUX,US.KO,US.PFE,US.WFC,US.BAC,US.GILD,US.CVS,US.PYPL,US.UBER,US.SCHW,'
                 'US.AAPL,US.GOOG,US.MSFT,US.META')

# 发现模式大池(~180): 纳指100/标普100 主要成分 + 主流ETF, 均为有期权且流动性尚可的标的
# 与 iron-condor-scanner/scripts/scan_ic.py 的 LARGE_POOL 同一份, 改动需两边同步; 新晋热门股手动补
LARGE_POOL = (
    # 宽基/商品/债券/行业 ETF
    'US.SPY,US.QQQ,US.IWM,US.DIA,US.TLT,US.GLD,US.SLV,US.USO,US.HYG,US.LQD,'
    'US.EEM,US.EFA,US.ARKK,US.SOXX,US.SMH,US.XLF,US.XLK,US.XLE,US.XLV,US.XLY,'
    'US.XLP,US.XBI,US.IBB,US.GDX,US.KRE,US.OIH,US.XOP,US.KWEB,US.FXI,US.EWZ,'
    'US.TQQQ,US.SQQQ,'
    # 科技
    'US.AAPL,US.MSFT,US.NVDA,US.AMZN,US.GOOG,US.META,US.TSLA,US.AVGO,US.NFLX,US.AMD,'
    'US.INTC,US.CRM,US.ADBE,US.ORCL,US.CSCO,US.QCOM,US.TXN,US.AMAT,US.MU,US.LRCX,'
    'US.ASML,US.PANW,US.CRWD,US.DDOG,US.SNOW,US.NET,US.SHOP,US.UBER,US.ABNB,US.DASH,'
    'US.COIN,US.HOOD,US.PLTR,US.SMCI,US.ARM,US.MSTR,US.RBLX,US.AI,US.IONQ,US.RIVN,'
    'US.LCID,US.NOW,US.INTU,US.WDAY,US.OKTA,US.ZS,US.MDB,US.TWLO,US.DOCU,US.ZM,'
    # 金融
    'US.JPM,US.BAC,US.WFC,US.C,US.GS,US.MS,US.BLK,US.SCHW,US.AXP,US.V,'
    'US.MA,US.PYPL,US.XYZ,US.COF,US.SOFI,'
    # 能源
    'US.XOM,US.CVX,US.COP,US.SLB,US.OXY,US.EOG,US.MPC,US.VLO,US.HAL,US.DVN,'
    # 医药
    'US.JNJ,US.UNH,US.LLY,US.PFE,US.MRK,US.ABBV,US.TMO,US.ABT,US.BMY,US.AMGN,'
    'US.GILD,US.VRTX,US.REGN,US.ISRG,US.MDT,US.MRNA,US.CVS,US.CI,US.ELV,'
    # 消费
    'US.WMT,US.COST,US.HD,US.LOW,US.TGT,US.NKE,US.SBUX,US.MCD,US.CMG,US.PG,'
    'US.KO,US.PEP,US.PM,US.MO,US.DG,'
    # 通信/媒体 (EA 2026 已私有化退市, 勿加回)
    'US.DIS,US.CMCSA,US.T,US.VZ,US.TMUS,US.TTWO,US.ROKU,US.WBD,US.FOXA,'
    # 工业
    'US.BA,US.GE,US.HON,US.CAT,US.DE,US.LMT,US.RTX,US.UPS,US.FDX,US.UNP,'
    # 中概
    'US.BABA,US.JD,US.PDD,US.BIDU,US.BILI,US.NIO,US.XPEV,US.LI,US.FUTU,US.TCOM,'
    'US.NTES,US.BEKE,'
    # 其他
    'US.F,US.GM,US.MELI,US.SE,US.SPOT,US.RACE,US.AMT,US.PLD,US.EQIX')


# ============================================================
# 发现模式: 大池批量快照粗筛
# ============================================================
def discover(ctx, top_n, capital):
    """内置大池按成交额粗筛。成交额是期权链厚度的代理指标(正股没量期权链必然稀疏);
    现价 > capital/0.93 的单张 LEAPS 占资金必超 30%(买不起), <5 的链稀疏, 都剔除"""
    pool = [c.strip() for c in LARGE_POOL.split(',') if c.strip()]
    print(f'发现模式: 大池 {len(pool)} 标的批量快照粗筛 → 成交额 top {top_n} 入围')
    dfs = []
    for i in range(0, len(pool), 400):  # get_market_snapshot 单次最多 400 个代码
        dfs.append(_call(ctx, 'get_market_snapshot', pool[i:i + 400]))
    snap = pd.concat(dfs, ignore_index=True).drop_duplicates(subset='code')
    max_px = capital / 0.93
    rows = []
    for _, row in snap.iterrows():
        try:
            px = float(row['last_price']); to = float(row['turnover'])
        except (TypeError, ValueError, KeyError):
            continue
        if 5 <= px <= max_px and to > 0:
            rows.append((row['code'], to))
    rows.sort(key=lambda x: -x[1])
    picked = rows[:top_n]
    print(f'  入围 {len(picked)}(现价窗口 $5~${max_px:.0f}): '
          + ', '.join(c.replace('US.', '') for c, _ in picked) + '\n')
    return [c for c, _ in picked]

# ============================================================
# 扫描单个标的
# ============================================================
def scan_one(code, ctx, capital, leaps_days, near_days):
    out = {'code': code, 'error': None, 'S': None, 'rows': []}
    try:
        snap = _call(ctx, 'get_market_snapshot', [code])
        S = float(snap.iloc[0]['last_price'])
        out['S'] = S

        exp = _call(ctx, 'get_option_expiration_date', code).copy()
        exp['d'] = exp['option_expiry_date_distance'].astype(int)
        exp = exp.sort_values('d')
        far = exp[exp['d'] >= 180]
        if len(far) == 0:
            out['error'] = '无>=180天到期日'; return out
        leaps_row = far.iloc[(far['d'] - leaps_days).abs().argsort().iloc[0]]
        leaps_date = str(leaps_row['strike_time'])[:10]
        leaps_d = int(leaps_row['d'])
        near_row = exp.iloc[(exp['d'] - near_days).abs().argsort().iloc[0]]
        near_date = str(near_row['strike_time'])[:10]
        near_d = int(near_row['d'])
        T = leaps_d / 365.0
        out['leaps_date'] = leaps_date; out['leaps_d'] = leaps_d
        out['near_date'] = near_date; out['near_d'] = near_d

        chain_l = _call(ctx, 'get_option_chain', code, start=leaps_date, end=leaps_date)
        chain_n = _call(ctx, 'get_option_chain', code, start=near_date, end=near_date)
        chain_l = chain_l[chain_l['option_type'] == 'CALL'].copy()
        chain_n = chain_n[chain_n['option_type'] == 'CALL'].copy()
        chain_l['sp'] = chain_l['strike_price'].astype(float)
        chain_n['sp'] = chain_n['strike_price'].astype(float)

        # 近月 Short 候选(OTM)
        sc = chain_n[(chain_n['sp'] >= S * 1.03) & (chain_n['sp'] <= S * 1.40)].copy()
        if len(sc) == 0:
            out['error'] = '无 OTM Short 候选'; return out
        short_strikes = {r['code']: float(r['sp']) for _, r in sc.iterrows()}

        # Long 多档:(目标 delta 标签, strike/现价比例),strike≈S×0.80/0.85/0.90 对应 delta≈0.85/0.80/0.70
        delta_tiers = [('0.85', 0.80), ('0.80', 0.85), ('0.70', 0.90)]
        long_codes, long_meta = [], {}
        for label, ratio in delta_tiers:
            cand = chain_l[(chain_l['sp'] >= S * (ratio - 0.04)) & (chain_l['sp'] <= S * (ratio + 0.04))].copy()
            if len(cand) == 0:
                continue
            cand['diff'] = (cand['sp'] - S * ratio).abs()
            row = cand.sort_values('diff').iloc[0]
            c = row['code']; k = float(row['sp'])
            long_codes.append(c)
            long_meta[c] = (label, k)

        if not long_codes:
            out['error'] = '无合适 Long ITM 合约'; return out

        sn = _call(ctx, 'get_market_snapshot', long_codes + list(short_strikes.keys()))
        bcol = 'bid_price' if 'bid_price' in sn.columns else 'bid'
        acol = 'ask_price' if 'ask_price' in sn.columns else 'ask'
        sn = sn[['code', bcol, acol]].copy()
        sn.columns = ['code', 'bid', 'ask']
        sn['bid'] = pd.to_numeric(sn['bid'], errors='coerce')
        sn['ask'] = pd.to_numeric(sn['ask'], errors='coerce')

        short_quote = {}
        for _, r in sn[sn['code'].isin(short_strikes.keys())].iterrows():
            b = r['bid']; a = r['ask']
            if pd.isna(b) or b <= 0:
                continue
            short_quote[r['code']] = (short_strikes[r['code']], b, a if pd.notna(a) else b)

        for lc in long_codes:
            label, k = long_meta[lc]
            lr = sn[sn['code'] == lc].iloc[0]
            lask = float(lr['ask']); lbid = float(lr['bid'])
            if pd.isna(lask) or lask <= 0:
                continue
            lmid = (lask + lbid) / 2 if pd.notna(lbid) and lbid > 0 else lask
            intrinsic = max(S - k, 0.0)
            extrinsic = lask - intrinsic
            ext_pct = extrinsic / lask * 100 if lask > 0 else 0
            iv = iv_from_price(S, k, T, RISK_FREE, lmid) * 100
            delta = bs_delta(S, k, T, RISK_FREE, iv / 100)
            breakeven = k + lask
            cost = lask * 100
            cap_pct = cost / capital * 100

            best = None
            for c, (strike, bid, ask) in short_quote.items():
                if strike <= breakeven:
                    continue  # 不安全,被行权亏
                spread = ask - bid
                if bid < MIN_SHORT_BID:
                    continue  # 月租太薄
                if spread > bid * MAX_SPREAD_RATIO:
                    continue  # 摩擦太大
                if best is None or bid > best['bid']:
                    best = {
                        'strike': strike, 'bid': bid, 'spread': spread,
                        'recover': lask / bid,
                        'assign_pnl': ((strike - k) - lask) * 100,
                    }
            out['rows'].append({
                'label': label, 'strike': k, 'ask': lask, 'bid': lbid,
                'cost': cost, 'ext_pct': ext_pct, 'iv': iv, 'delta': delta,
                'breakeven': breakeven, 'cap_pct': cap_pct, 'best': best,
            })
    except Exception as e:
        out['error'] = f'{type(e).__name__}: {e}'
    return out

# ============================================================
# 输出
# ============================================================
def print_one(r):
    if r['error']:
        print(f"  [跳过] {r['error']}"); return
    S = r['S']
    print(f"  现价 {S:.2f} | LEAPS {r['leaps_date']}({r['leaps_d']}天) 近月 {r['near_date']}({r['near_d']}天)")
    print(f"  {'档':>5} {'strike':>7} {'买ask':>7} {'spread':>6} {'成本/张':>8} {'extr%':>6} {'IV':>5} {'delta':>6} {'占资金':>6} {'安全Short':>9} {'月租':>6} {'回本月':>7} {'标记':>4}")
    for row in r['rows']:
        b = row['best']
        spread = (row['ask'] - row['bid']) if pd.notna(row['bid']) else float('nan')
        if b:
            short_str = f"{b['strike']:.0f}"; rent = f"${b['bid']:.2f}"; rec = f"{b['recover']:.0f}月"
            ok = row['delta'] >= MIN_DELTA and b['recover'] <= MAX_RECOVER_MONTHS and row['cap_pct'] <= MAX_CAP_PCT
            mark = '★推荐' if ok else ''
        else:
            short_str = '无合格'; rent = '-'; rec = '-'; mark = '无合格Short'
        print(f"  {row['label']:>5} {row['strike']:>7.1f} {row['ask']:>7.2f} {spread:>6.2f} {row['cost']:>8.0f} {row['ext_pct']:>5.0f}% {row['iv']:>4.0f}% {row['delta']:>6.2f} {row['cap_pct']:>5.1f}% {short_str:>9} {rent:>6} {rec:>7} {mark:>4}")

def main():
    ap = argparse.ArgumentParser(description='PMCC 可行性批量扫描')
    ap.add_argument('--codes', default=DEFAULT_CODES, help='标的列表,逗号分隔')
    ap.add_argument('--discover', action='store_true', help='发现模式: 内置大池按成交额粗筛后精扫(优先于 --codes)')
    ap.add_argument('--pool-size', type=int, default=25, help='发现模式入围精扫数量(默认25)')
    ap.add_argument('--capital', type=float, default=19000, help='账户资金 USD(默认 19000)')
    ap.add_argument('--leaps-days', type=int, default=365, help='LEAPS 目标天数(默认 365)')
    ap.add_argument('--near-days', type=int, default=36, help='近月目标天数(默认 36)')
    args = ap.parse_args()
    codes = [c.strip() for c in args.codes.split(',') if c.strip()]

    ctx = create_quote_context()
    results = []
    try:
        if args.discover:
            codes = discover(ctx, args.pool_size, args.capital)
            if not codes:
                print('发现模式: 粗筛无入围标的'); return
        print(f"扫描 {len(codes)} 个标的 | 资金 ${args.capital:,.0f} | LEAPS~{args.leaps_days}天 近月~{args.near_days}天\n")
        for code in codes:
            print(f"{'='*72}\n{code}")
            r = scan_one(code, ctx, args.capital, args.leaps_days, args.near_days)
            results.append(r)
            print_one(r)
            time.sleep(2.0)  # 标的间防限频
    finally:
        safe_close(ctx)

    print(f"\n{'='*72}\n汇总(★推荐 = delta≥{MIN_DELTA} 且 回本≤{MAX_RECOVER_MONTHS}月 且 占资金≤{MAX_CAP_PCT:.0f}%)")
    print(f"{'标的':<10} {'Long strike':>11} {'成本/张':>8} {'delta':>6} {'IV':>5} {'安全Short':>9} {'月租':>6} {'回本':>6} {'占资金':>7}")
    any_rec = False
    for r in results:
        if r['error']:
            continue
        for row in r['rows']:
            b = row['best']
            if not b:
                continue
            if row['delta'] >= MIN_DELTA and b['recover'] <= MAX_RECOVER_MONTHS and row['cap_pct'] <= MAX_CAP_PCT:
                any_rec = True
                print(f"{r['code']:<10} {row['strike']:>11.1f} {row['cost']:>8.0f} {row['delta']:>6.2f} {row['iv']:>4.0f}% {b['strike']:>9.0f} ${b['bid']:>5.2f} {b['recover']:>5.0f}月 {row['cap_pct']:>6.1f}% ★")
    if not any_rec:
        print("  (无标的同时满足 delta/回本/资金 三项要求)")

if __name__ == '__main__':
    main()
