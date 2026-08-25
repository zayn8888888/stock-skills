#!/usr/bin/env python3
"""
Iron Condor 适配度扫描器 v2
6 维度打分: 流动性(门槛)/IV溢价(负值否决)/IV Rank(真算分位)/区间形态(HV趋势)/DTE/GEX(dealer净gamma)
+ 财报事件期扣分 + --detail 铁鹰腿骨架 + --output CSV

用法:
  python3 scan_ic.py                              # 默认标的池
  python3 scan_ic.py --top 10 --detail 3          # 前10名,对前3输出铁鹰腿
  python3 scan_ic.py --codes US.SPY,US.IWM --output out.csv
依赖: 富途 OpenD(11111) + stock-skills common.py
"""
import sys, os, math, argparse, time, csv, glob


def _find_futuapi_scripts():
    """定位 futuapi 的 scripts 目录(common.py 所在)。
    优先级: CLAUDE_SKILLS_DIR > ~/.claude/skills > plugin cache(多版本按版本号取最新)"""
    cands = []
    env_dir = os.environ.get('CLAUDE_SKILLS_DIR', '')
    if env_dir:
        cands.append(os.path.join(env_dir, 'futuapi', 'scripts'))
    cands.append(os.path.expanduser('~/.claude/skills/futuapi/scripts'))
    hits = glob.glob(os.path.expanduser('~/.claude/plugins/cache/*/*/*/futu/futuapi/scripts'))

    def _ver(p):  # 路径倒数第4段是版本号; 字符串排序对 1.1.10 vs 1.1.9 会错, 用元组
        try:
            return tuple(int(x) for x in p.split(os.sep)[-4].split('.'))
        except ValueError:
            return (0,)
    cands.extend(sorted(hits, key=_ver, reverse=True))
    for p in cands:
        if os.path.isfile(os.path.join(p, 'common.py')):
            return p
    return None


_FUTUAPI = _find_futuapi_scripts()
if _FUTUAPI is None:
    sys.exit('未找到 futuapi 的 common.py (找过 CLAUDE_SKILLS_DIR / ~/.claude/skills / plugin cache)，'
             '请先安装 stock-skills 插件或 futuapi skill')
sys.path.insert(0, _FUTUAPI)
from common import create_quote_context, safe_close, pad_disp
import pandas as pd

# 精简默认池: 宽基ETF + 流动性尚可行业ETF + 大盘股 (已淘汰 XLE/XLV/XLI/XLY/XLP/XLB/XLU/IYT)
DEFAULT_CODES = ('US.SPY,US.QQQ,US.IWM,US.DIA,US.XLF,US.XLK,US.SMH,US.EEM,'
                'US.AAPL,US.MSFT,US.NVDA,US.AMZN,US.GOOG,US.META,US.TSLA,US.AVGO,'
                'US.AMD,US.NFLX,US.JPM,US.BAC,US.CRM,US.INTC')

# 发现模式大池(~180): 纳指100/标普100 主要成分 + 主流ETF, 均为有期权且流动性尚可的标的
# 粗筛按成交额排序, 新晋热门股需手动补充进池
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

IMPVOL_STATUS = {0: '震荡', 1: '高估', 2: '低估'}


def _f(row, col):
    if col not in row.index:
        return None
    v = row[col]
    if v is None:
        return None
    try:
        if isinstance(v, float) and math.isnan(v):
            return None
        return float(v)
    except (TypeError, ValueError):
        return None


def _call(ctx, method, *args, retries=4, **kw):
    fn = getattr(ctx, method)
    for i in range(retries):
        ret, data = fn(*args, **kw)
        if ret == 0 or str(ret) == '0':
            return data
        time.sleep(1.5 * (i + 1))
    return None


def _snapshot_batch(ctx, codes, batch=400):
    """get_market_snapshot 单次最多 400 个代码, 全链可能超限, 分批拉取合并"""
    dfs = []
    for i in range(0, len(codes), batch):
        d = _call(ctx, 'get_market_snapshot', codes[i:i + batch])
        if d is not None and len(d) > 0:
            dfs.append(d)
    if not dfs:
        return None
    return pd.concat(dfs, ignore_index=True).drop_duplicates(subset='code')


def _snapshot_tolerant(ctx, codes):
    """大池快照: 单个无效代码(如退市)会导致整批 ret=-1, 失败时二分定位剔除。
    直接调 API 不走 _call(无效代码重试无意义); 副作用是网络抖动时个别标的会被误判跳过, 大池粗筛场景可接受"""
    if not codes:
        return []
    ret, data = ctx.get_market_snapshot(codes)
    if ret == 0 or str(ret) == '0':
        return [data] if data is not None and len(data) > 0 else []
    if len(codes) == 1:
        print(f'  (跳过无效标的 {codes[0]})')
        return []
    mid = len(codes) // 2
    return _snapshot_tolerant(ctx, codes[:mid]) + _snapshot_tolerant(ctx, codes[mid:])


def _discover(ctx, top_n):
    """发现模式: 内置大池批量快照, 按成交额降序取 top_n 进入精筛。
    成交额是期权链厚度的代理指标(正股没量的标的期权链必然稀疏); 低价股链稀疏直接剔除"""
    pool = [c.strip() for c in LARGE_POOL.split(',') if c.strip()]
    print(f'发现模式: 大池 {len(pool)} 标的批量快照粗筛 → 成交额 top {top_n} 入围')
    dfs = _snapshot_tolerant(ctx, pool)
    snap = pd.concat(dfs, ignore_index=True).drop_duplicates(subset='code') if dfs else None
    if snap is None or len(snap) == 0:
        return []
    rows = []
    for _, row in snap.iterrows():
        code = row.get('code')
        px = _f(row, 'last_price')
        to = _f(row, 'turnover')
        if code and px and px >= 5 and to:
            rows.append((code, to))
    rows.sort(key=lambda x: -x[1])
    picked = rows[:top_n]
    print(f'  入围 {len(picked)}: ' + ', '.join(c.replace('US.', '') for c, _ in picked) + '\n')
    return [c for c, _ in picked]


# ===================== 数据采集 =====================
def collect(ctx, code, dte_min, dte_max):
    r = {'code': code, 'reason': None, 'total': 0, 'event': False}
    try:
        # 1. 现价
        snap = _call(ctx, 'get_market_snapshot', [code])
        if snap is None or len(snap) == 0:
            r['reason'] = '无快照'; return r
        S = _f(snap.iloc[0], 'last_price')
        if S is None or S <= 0:
            r['reason'] = '现价异常'; return r
        r['S'] = S

        # 2. 到期日(找 DTE 窗口)
        exp = _call(ctx, 'get_option_expiration_date', code)
        if exp is None or len(exp) == 0:
            r['reason'] = '无到期日'; return r
        exp = exp.copy()
        exp['d'] = exp['option_expiry_date_distance'].astype(int)
        exp = exp[exp['d'] >= 0].sort_values('d')
        if len(exp) == 0:
            r['reason'] = '无未来到期日'; return r
        mid = (dte_min + dte_max) / 2
        in_win = exp[(exp['d'] >= dte_min) & (exp['d'] <= dte_max)]
        pool = in_win if len(in_win) > 0 else exp
        best = pool.iloc[(pool['d'] - mid).abs().argsort().iloc[0]]
        exp_date = str(best['strike_time'])[:10]
        r['exp_date'] = exp_date; r['dte'] = int(best['d'])

        # 3. 期权链 + 全合约快照(一次拉 CALL+PUT, 供流动性+GEX+detail 复用)
        chain = _call(ctx, 'get_option_chain', code, start=exp_date, end=exp_date)
        if chain is None or len(chain) == 0:
            r['reason'] = '无期权链'; return r
        sn = _snapshot_batch(ctx, chain['code'].tolist())
        if sn is None or len(sn) == 0:
            r['reason'] = '无合约快照'; return r
        m = chain[['code', 'option_type', 'strike_price']].copy()
        m['sp'] = m['strike_price'].astype(float)
        cols = ['code', 'option_open_interest', 'option_delta', 'option_gamma',
                'option_implied_volatility', 'bid_price', 'ask_price']
        sn2 = sn[[c for c in cols if c in sn.columns]].copy()
        for c in cols[1:]:
            if c in sn2:
                sn2[c] = pd.to_numeric(sn2[c], errors='coerce')
        m = m.merge(sn2, on='code', how='left')
        m['oi'] = m['option_open_interest'].fillna(0)
        m['gamma'] = m['option_gamma'].fillna(0)
        calls = m[m['option_type'] == 'CALL'].copy()
        puts = m[m['option_type'] == 'PUT'].copy()
        if len(calls) == 0:
            r['reason'] = '无CALL'; return r
        r['calls'] = calls; r['puts'] = puts

        # 4. ATM call → 流动性
        atm = calls.iloc[(calls['sp'] - S).abs().argsort().iloc[0]]
        r['atm_code'] = atm['code']; r['atm_strike'] = float(atm['sp'])
        b = _f(atm, 'bid_price'); a = _f(atm, 'ask_price')
        if not b or not a or b <= 0 or a <= 0:
            r['reason'] = 'ATM call 无bid/ask(流动性枯竭)'; r['total'] = 0; return r
        r['spread'] = (a - b) / ((a + b) / 2) * 100

        # 5. IV / realized / premium / status + 历史序列
        vol = _call(ctx, 'get_option_volatility', r['atm_code'], query_time_period=5, hv_time_period=30)
        r['vol_df'] = vol
        if vol is not None and len(vol) > 0:
            # 显式按时间降序: _iv_rank/_hv_trend 均假设 iloc[0]=最新值, 不赌 API 返回顺序
            if 'timestamp' in vol.columns:
                vol = vol.sort_values('timestamp', ascending=False).reset_index(drop=True)
            row0 = vol.iloc[0]
            r['iv'] = _f(row0, 'implied_volatility') or _f(row0, 'average_impvol')  # 当前IV(显示/CSV, 与溢价口径对齐)
            r['iv_avg'] = _f(row0, 'average_impvol')  # 近1年IV均值(IV位兜底打分用)
            r['hv'] = _f(row0, 'history_volatility')
            r['premium'] = _f(row0, 'volatility_premium')
            st = row0.get('impvol_status')
            if st is not None and not (isinstance(st, float) and math.isnan(st)):
                r['iv_status'] = IMPVOL_STATUS.get(int(st), '?')
            r['iv_rank'] = _iv_rank(vol)
            r['hv_trend'] = _hv_trend(vol)

        # 6. GEX (dealer short call + long put 假设, 仅本到期日近似)
        r['gex_net'], r['gex_gross'] = _gex(calls, puts, S)
    except Exception as e:
        r['reason'] = f'{type(e).__name__}: {e}'
    return r


def _iv_rank(vol):
    if vol is None or len(vol) == 0 or 'implied_volatility' not in vol.columns:
        return None
    ivs = pd.to_numeric(vol['implied_volatility'], errors='coerce').dropna()
    if len(ivs) == 0:
        return None
    return (ivs < ivs.iloc[0]).sum() / len(ivs) * 100  # 当前IV在序列中的分位


def _hv_trend(vol):
    if vol is None or len(vol) == 0 or 'history_volatility' not in vol.columns:
        return None
    hvs = pd.to_numeric(vol['history_volatility'], errors='coerce').dropna()
    if len(hvs) < 5:
        return None
    hv5 = hvs.iloc[:5].mean()
    hv20 = hvs.iloc[:min(20, len(hvs))].mean()
    if not hv20 or hv20 == 0:
        return None
    return hv5 / hv20  # <1 收敛(区间稳), >1 扩张(突破风险)


def _gex(calls, puts, S):
    # dealer: short call(-) + long put(+) → 净正=long gamma=抑制(铁鹰友好)
    call_g = (calls['oi'] * calls['gamma']).sum()
    put_g = (puts['oi'] * puts['gamma']).sum()
    net = (put_g - call_g) * 100 * S
    gross = (call_g + put_g) * 100 * S
    return net, gross


# ===================== 打分 =====================
def score(r):
    if r.get('reason'):
        r['total'] = 0; return
    sp = r.get('spread')
    if sp is None or sp > 15:
        r['reason'] = f'价差{sp:.0f}%>15%淘汰' if sp else '无价差'
        r['total'] = 0; return
    # 流动性门槛(15): 过线即给, 不线性加
    s_liq = 15 if sp < 8 else 8
    # IV溢价(30) + 负值否决
    prem = r.get('premium')
    s_prem = 0
    if prem is not None:
        if prem > 8: s_prem = 30
        elif prem > 4: s_prem = 24
        elif prem > 0: s_prem = 15
        else: s_prem = 0
    # IV 位(15) — impvol_status 为主(富途全量口径), IV 绝对值兜底
    # 注: IVRank 基于富途短期 IV 序列(~8 采样点, 非 252 日标准 Rank), 仅作参考列显示, 不主导打分
    s_rank = 7  # 波动率数据缺失时给中性分(与 s_trend/s_gex 的缺省模式一致), 防 UnboundLocalError
    st = r.get('iv_status')
    if st == '高估': s_rank = 15
    elif st == '震荡': s_rank = 10
    elif st == '低估': s_rank = 5
    else:
        # impvol_status 缺失时, 用当前IV相对近1年均值的位置兜底(偏高=适合卖方)
        iv = r.get('iv'); iv_avg = r.get('iv_avg')
        if iv and iv_avg and iv_avg > 0:
            ratio = iv / iv_avg
            if ratio >= 1.10: s_rank = 13   # 当前IV高于历史中枢10%+ = 偏高
            elif ratio <= 0.90: s_rank = 6  # 低于中枢 = 偏低(IV便宜, 不适合卖方)
            else: s_rank = 10
        elif iv:  # 连iv_avg都没有, 退而用当前IV绝对值(粗糙, 跨标的不可比)
            if iv > 40: s_rank = 11
            elif iv > 20: s_rank = 9
            else: s_rank = 6
    # 区间形态(10) — HV 趋势
    ht = r.get('hv_trend')
    s_trend = 7
    if ht is not None:
        if ht < 0.9: s_trend = 10
        elif ht > 1.1: s_trend = 3
    # DTE(10)
    dte = r.get('dte')
    if dte and 30 <= dte <= 45: s_dte = 10
    elif dte and abs(dte - 37.5) <= 10: s_dte = 6
    else: s_dte = 2
    # GEX(20) — dealer 净 gamma 环境
    net, gross = r.get('gex_net'), r.get('gex_gross')
    s_gex = 12
    if net is not None and gross and gross > 0:
        ratio = net / gross
        if ratio > 0.05: s_gex = 20      # 显著正 gamma=抑制
        elif ratio < -0.05: s_gex = 5    # 显著负 gamma=放大
    s = s_liq + s_prem + s_rank + s_trend + s_dte + s_gex
    # 财报事件期扣分(IV高估+高溢价=疑似事件期, gap risk)
    if r.get('iv_status') == '高估' and (prem or 0) > 4:
        r['event'] = True; s -= 15
    # 负溢价否决(realized>>IV, 卖方必亏, 强制降级)
    if prem is not None and prem < -5:
        s = min(s, 40)
    r['s_liq'], r['s_prem'], r['s_rank'], r['s_trend'], r['s_dte'], r['s_gex'] = \
        s_liq, s_prem, s_rank, s_trend, s_dte, s_gex
    r['total'] = max(0, s)


def grade(t, event=False):
    flag = '⚠' if event else ''
    if t >= 75: return f'{flag}★优秀'
    if t >= 60: return f'{flag}良好'
    if t >= 45: return f'{flag}一般'
    return f'{flag}不适合'


def gex_label(r):
    net, gross = r.get('gex_net'), r.get('gex_gross')
    if net is None or not gross or gross == 0: return '-'
    ratio = net / gross
    if ratio > 0.05: return '正(抑制)'
    if ratio < -0.05: return '负(放大)'
    return '中性'


# ===================== detail =====================
def detail(r, sell_delta=0.30, buy_delta=0.18, capital=None):
    calls, puts, S = r.get('calls'), r.get('puts'), r['S']
    if calls is None or puts is None:
        print('  (无链数据)'); return
    # 按 delta 选腿: 卖腿 ~sell_delta / 保护腿 ~buy_delta(更远 OTM)
    def _pick(df, target, sp_gt=None, sp_lt=None):
        d = df[(df['option_delta'].notna()) & (df['option_delta'] != 0)].copy()
        if sp_gt is not None: d = d[d['sp'] > sp_gt]
        if sp_lt is not None: d = d[d['sp'] < sp_lt]
        if len(d) == 0: return None
        d['dd'] = (d['option_delta'] - target).abs()
        return d.sort_values('dd').iloc[0]
    otm_c = calls[calls['sp'] > S]; otm_p = puts[puts['sp'] < S]
    c1 = _pick(otm_c, sell_delta)
    if c1 is None: print('  (无 OTM call 卖腿)'); return
    c2 = _pick(otm_c, buy_delta, sp_gt=c1['sp'])
    p1 = _pick(otm_p, -sell_delta)
    if p1 is None: print('  (无 OTM put 卖腿)'); return
    p2 = _pick(otm_p, -buy_delta, sp_lt=p1['sp'])
    if c2 is None or p2 is None: print('  (无保护腿)'); return
    cb, ca = _f(c1, 'bid_price'), _f(c2, 'ask_price')
    pb, pa = _f(p1, 'bid_price'), _f(p2, 'ask_price')
    if not all([cb, ca, pb, pa]) or min(cb, ca, pb, pa) <= 0:
        print('  (腿 bid/ask 不全)'); return
    credit = cb + pb - ca - pa
    width = max(c2['sp'] - c1['sp'], p1['sp'] - p2['sp'])
    max_loss = width - credit
    upper_be = c1['sp'] + credit; lower_be = p1['sp'] - credit
    rr = (credit / max_loss * 100) if max_loss > 0 else 0
    # 期望值: 正态近似估到期落在盈亏区间的概率(胜率)
    # IV口径=保守(期权定价口径), HV口径=若未来波动同过去, 反映IV溢价带来的胜率提升
    def _win_rate(sigma):
        if not sigma or sigma <= 0: return None
        z_lo = (lower_be - S) / sigma; z_hi = (upper_be - S) / sigma
        return 0.5 * (math.erf(z_hi / math.sqrt(2)) - math.erf(z_lo / math.sqrt(2))) * 100
    dte = r['dte']
    sigma_iv = S * (r.get('iv') or 0) / 100 * math.sqrt(dte / 365) if r.get('iv') else 0
    sigma_hv = S * (r.get('hv') or 0) / 100 * math.sqrt(dte / 365) if r.get('hv') else 0
    w_iv = _win_rate(sigma_iv); w_hv = _win_rate(sigma_hv)
    # OI 挂墙: 两侧 OTM 持仓量最密集档, 真实支撑/阻力参考
    def _oi_wall(df):
        if 'oi' not in df.columns or len(df) == 0 or df['oi'].sum() == 0: return None
        return df.loc[df['oi'].idxmax()]
    def _fmt_oi(v):
        v = float(v or 0)
        return f'{v/1000:.1f}k' if v >= 1000 else f'{v:.0f}'
    def _fmt_sp(x):
        return f'{float(x):g}'
    wall_c = _oi_wall(otm_c); wall_p = _oi_wall(otm_p)
    dc1 = _f(c1, 'option_delta') or 0; dc2 = _f(c2, 'option_delta') or 0
    dp1 = _f(p1, 'option_delta') or 0; dp2 = _f(p2, 'option_delta') or 0
    dte_tag = '甜区✓ theta加速+gamma未爆' if 30 <= dte <= 45 else '偏离甜区⚠ gamma风险升'
    print(f'  铁鹰骨架 @ {r["exp_date"]} DTE{dte}({dte_tag}) 现价{S:.2f}:')
    print(f'    卖{_fmt_sp(c1["sp"])}C(δ{dc1:.2f} bid{cb:.2f} OI{_fmt_oi(c1["oi"])})/'
          f'买{_fmt_sp(c2["sp"])}C(δ{dc2:.2f} ask{ca:.2f} OI{_fmt_oi(c2["oi"])}) | '
          f'卖{_fmt_sp(p1["sp"])}P(δ{dp1:.2f} bid{pb:.2f} OI{_fmt_oi(p1["oi"])})/'
          f'买{_fmt_sp(p2["sp"])}P(δ{dp2:.2f} ask{pa:.2f} OI{_fmt_oi(p2["oi"])})')
    print(f'    净信用={credit:.2f} 最大损失={max_loss:.2f}(宽{_fmt_sp(width)}) '
          f'盈亏区间[{lower_be:.2f},{upper_be:.2f}] 收益/风险={rr:.0f}%')
    win_parts = []
    if w_iv is not None: win_parts.append(f'按IV={w_iv:.0f}%')
    if w_hv is not None: win_parts.append(f'按HV={w_hv:.0f}%')
    ev_str = ''
    if w_iv is not None and max_loss > 0:
        ev = w_iv / 100 * credit - (1 - w_iv / 100) * max_loss
        ev_str = f' | 期望(按IV)={ev:+.2f}/单'
    if win_parts:
        print(f'    静态胜率(正态近似): {" ".join(win_parts)}{ev_str}  (忽略尾部, 静态持有到期口径)')
    if wall_c is not None or wall_p is not None:
        wc = f'call侧{_fmt_sp(wall_c["sp"])}({_fmt_oi(wall_c["oi"])})' if wall_c is not None else 'call侧-'
        wp = f'put侧{_fmt_sp(wall_p["sp"])}({_fmt_oi(wall_p["oi"])})' if wall_p is not None else 'put侧-'
        print(f'    OI墙: {wc} {wp}  (持仓最密集档, 真实支撑/阻力, 与选腿对比)')
    print(f'    管理: 赚50%信用平仓→+{credit*0.5:.2f} | 止损亏1x信用(买回翻倍)→-{credit:.2f} | DTE剩21天离场避gamma pinch')
    if capital and capital > 0 and max_loss > 0:
        risk_per_contract = max_loss * 100  # 1张=100股
        max_risk = capital * 0.02
        n = int(max_risk / risk_per_contract) if risk_per_contract > 0 else 0
        print(f'    仓位: 账户{capital:.0f} 单笔风险≤2%={max_risk:.0f} → 建议≤{n}张(每张最大亏{risk_per_contract:.0f})')
    print(f'    注: 按delta选腿({sell_delta}/{buy_delta}), 实战复核 OI wall + 券商算价器, 非下单单')


# ===================== oiwall =====================
def oiwall(r, sell_delta=0.30, buy_delta=0.18):
    """单标的 OI wall 细看: 完整 OI/gamma 分布 + 墙标注 + 选腿对比 + 按行权价 GEX 拆解。
    比 detail 的单行 OI 摘要更深, 复用 collect 拉的 calls/puts 与 _pick 选腿逻辑。"""
    calls, puts, S = r.get('calls'), r.get('puts'), r.get('S')
    if calls is None or puts is None or S is None:
        print('  (无链数据)'); return
    # 数值列兜底(merge 后可能 object/NaN)
    for col in ['option_delta', 'option_implied_volatility', 'bid_price', 'ask_price', 'oi', 'gamma']:
        if col in calls.columns:
            calls[col] = pd.to_numeric(calls[col], errors='coerce')
        if col in puts.columns:
            puts[col] = pd.to_numeric(puts[col], errors='coerce')
    calls = calls.sort_values('sp').reset_index(drop=True)
    puts = puts.sort_values('sp').reset_index(drop=True)

    # 选腿(复用 detail 的 _pick 逻辑: 按 delta 最近)
    def _pick(df, target, sp_gt=None, sp_lt=None):
        d = df[(df['option_delta'].notna()) & (df['option_delta'] != 0)].copy()
        if sp_gt is not None: d = d[d['sp'] > sp_gt]
        if sp_lt is not None: d = d[d['sp'] < sp_lt]
        if len(d) == 0: return None
        d['dd'] = (d['option_delta'] - target).abs()
        return d.sort_values('dd').iloc[0]
    otm_c = calls[calls['sp'] > S]; otm_p = puts[puts['sp'] < S]
    c1 = _pick(otm_c, sell_delta)
    p1 = _pick(otm_p, -sell_delta)
    c2 = _pick(otm_c, buy_delta, sp_gt=c1['sp']) if c1 is not None else None
    p2 = _pick(otm_p, -buy_delta, sp_lt=p1['sp']) if p1 is not None else None
    legs = {}
    if c1 is not None: legs[('C', float(c1['sp']))] = '卖C'
    if c2 is not None: legs[('C', float(c2['sp']))] = '买C'
    if p1 is not None: legs[('P', float(p1['sp']))] = '卖P'
    if p2 is not None: legs[('P', float(p2['sp']))] = '买P'

    # 合成 strike 行表(CALL+PUT 按 sp 对齐)
    strikes = sorted(set(calls['sp'].tolist() + puts['sp'].tolist()))
    cc = calls.set_index('sp')[['oi', 'gamma', 'option_delta', 'option_implied_volatility', 'bid_price', 'ask_price']]
    cc.columns = ['C_OI', 'C_gam', 'C_del', 'C_IV', 'C_bid', 'C_ask']
    pp = puts.set_index('sp')[['oi', 'gamma', 'option_delta', 'option_implied_volatility', 'bid_price', 'ask_price']]
    pp.columns = ['P_OI', 'P_gam', 'P_del', 'P_IV', 'P_bid', 'P_ask']
    df = pd.DataFrame({'sp': strikes}).merge(cc, left_on='sp', right_index=True, how='left') \
                                       .merge(pp, left_on='sp', right_index=True, how='left').fillna(0)
    df['gex'] = (df['P_OI'] * df['P_gam'] - df['C_OI'] * df['C_gam']) * 100 * S  # dealer: short call - / long put +
    df['dist%'] = (df['sp'] - S) / S * 100

    def _foi(v):
        v = float(v or 0)
        return f'{v/1000:.1f}k' if v >= 1000 else (f'{v:.0f}' if v >= 1 else '-')
    def _leg_tag(sp):
        return '/'.join(legs[k] for k in [('C', sp), ('P', sp)] if k in legs)

    print(f'\n{"="*118}')
    print(f'{r["code"]} OI/gamma 分布 @ {r.get("exp_date")}  现价 {S:.2f}  DTE{r.get("dte")}  '
          f'(dealer: short call - / long put +)')
    print(f'{"="*118}')
    print(f'{"strike":>7} {"距%":>5} | {"C_OI":>6} {"C_γ":>6} {"C_δ":>5} {"C_IV":>5} | '
          f'{"P_OI":>6} {"P_γ":>6} {"P_δ":>5} {"P_IV":>5} | {"GEX":>9} {"腿":>6}')
    print('-' * 118)
    near = df[(df['sp'] >= S * 0.85) & (df['sp'] <= S * 1.15)]
    for _, row in near.iterrows():
        atm = 'ATM' if abs(row['dist%']) < 1.5 else ''
        tag = _leg_tag(float(row['sp'])) or atm
        print(f'{row["sp"]:>7.1f} {row["dist%"]:>5.1f} | {_foi(row["C_OI"]):>6} {row["C_gam"]:>6.4f} '
              f'{row["C_del"]:>5.2f} {row["C_IV"]:>5.0f} | {_foi(row["P_OI"]):>6} {row["P_gam"]:>6.4f} '
              f'{row["P_del"]:>5.2f} {row["P_IV"]:>5.0f} | {row["gex"]:>9.0f} {tag:>6}')

    # OI 墙 top5(两侧持仓最密集档, 真实支撑/阻力)
    print(f'\n{"="*70}')
    print('CALL 侧 OI top5 (阻力墙, dealer short call 越多压越重)')
    print('-' * 70)
    for _, row in calls.nlargest(5, 'oi').iterrows():
        iv = row['option_implied_volatility'] or 0
        print(f'  strike {row["sp"]:>6.1f}  OI={_foi(row["oi"]):>6}  γ={row["gamma"]:.4f}  '
              f'δ={row["option_delta"]:.2f}  IV={iv:.0f}  bid/ask={row["bid_price"]:.2f}/{row["ask_price"]:.2f}')
    print('\nPUT 侧 OI top5 (支撑墙, dealer long put 越多托越重)')
    print('-' * 70)
    for _, row in puts.nlargest(5, 'oi').iterrows():
        iv = row['option_implied_volatility'] or 0
        print(f'  strike {row["sp"]:>6.1f}  OI={_foi(row["oi"]):>6}  γ={row["gamma"]:.4f}  '
              f'δ={row["option_delta"]:.2f}  IV={iv:.0f}  bid/ask={row["bid_price"]:.2f}/{row["ask_price"]:.2f}')

    # 选腿 vs 最近墙(腿落在墙上=墙保护, 腿在墙外=裸露)
    print(f'\n{"="*70}')
    print('选腿 vs OI 墙位置')
    print('-' * 70)
    leg_list = []
    if c1 is not None: leg_list.append((f'卖{float(c1["sp"]):g}C (δ{c1["option_delta"]:.2f})', c1, 'CALL'))
    if c2 is not None: leg_list.append((f'买{float(c2["sp"]):g}C (δ{c2["option_delta"]:.2f})', c2, 'CALL'))
    if p1 is not None: leg_list.append((f'卖{float(p1["sp"]):g}P (δ{p1["option_delta"]:.2f})', p1, 'PUT'))
    if p2 is not None: leg_list.append((f'买{float(p2["sp"]):g}P (δ{p2["option_delta"]:.2f})', p2, 'PUT'))
    wall_c = calls.nlargest(1, 'oi').iloc[0] if len(calls) and calls['oi'].sum() else None
    wall_p = puts.nlargest(1, 'oi').iloc[0] if len(puts) and puts['oi'].sum() else None
    for name, row, side in leg_list:
        iv = row['option_implied_volatility'] or 0
        wall = wall_c if side == 'CALL' else wall_p
        wall_str = f'{float(wall["sp"]):g}(OI {_foi(wall["oi"])})' if wall is not None else '-'
        print(f'  {name:18} strike {row["sp"]:>6.1f}  OI={_foi(row["oi"]):>5} γ={row["gamma"]:.4f} '
              f'IV={iv:.0f} bid/ask={row["bid_price"]:.2f}/{row["ask_price"]:.2f}  | 最近墙 {wall_str}')

    # 总 GEX + 按行权价拆解
    total = df['gex'].sum()
    pos = df[df['gex'] > 0]['gex'].sum()
    neg = df[df['gex'] < 0]['gex'].sum()
    print(f'\n{"="*70}')
    print(f'本到期日 dealer 净 GEX = {total:,.0f}  (正=抑制/铁鹰友好, 负=放大)')
    print(f'  正 gamma 档合计: {pos:,.0f}  | 负 gamma 档合计: {neg:,.0f}')
    if len(df):
        print(f'  GEX 最大正档: strike {df.loc[df["gex"].idxmax(), "sp"]:g} ({df["gex"].max():,.0f})')
        print(f'  GEX 最大负档: strike {df.loc[df["gex"].idxmin(), "sp"]:g} ({df["gex"].min():,.0f})')


# ===================== main =====================
def main():
    ap = argparse.ArgumentParser(description='Iron Condor 适配度扫描器 v2')
    ap.add_argument('--codes', default=DEFAULT_CODES, help='标的列表,逗号分隔')
    ap.add_argument('--discover', action='store_true', help='发现模式: 内置大池按成交额粗筛后精筛(优先于 --codes)')
    ap.add_argument('--pool-size', type=int, default=25, help='发现模式入围精筛的数量(默认25)')
    ap.add_argument('--top', type=int, default=0, help='只显示前N(0=全部)')
    ap.add_argument('--dte-min', type=int, default=30)
    ap.add_argument('--dte-max', type=int, default=45)
    ap.add_argument('--detail', type=int, default=0, help='对前N名输出铁鹰腿骨架')
    ap.add_argument('--sell-delta', type=float, default=0.30, help='卖腿目标delta(默认0.30窄鹰; 宽鹰用0.16-0.20)')
    ap.add_argument('--buy-delta', type=float, default=0.18, help='保护腿目标delta(默认0.18; 宽鹰用0.08-0.10)')
    ap.add_argument('--capital', type=float, default=None, help='账户资金(算单笔风险≤2%%仓位建议, 不传则不输出仓位行)')
    ap.add_argument('--output', default=None, help='导出 CSV 路径')
    ap.add_argument('--oiwall', default=None,
                    help='单标的 OI wall 细看(完整 OI/gamma 分布+墙标注+选腿对比+GEX拆解, 优先于扫描)')
    args = ap.parse_args()
    codes = [c.strip() for c in args.codes.split(',') if c.strip()]

    # OI wall 细看模式: 单标的深度输出, 优先于批量扫描
    if args.oiwall:
        ctx = create_quote_context()
        try:
            r = collect(ctx, args.oiwall, args.dte_min, args.dte_max)
            if r.get('reason'):
                print(f'{args.oiwall}: {r["reason"]}'); return
            score(r)
            print(f'{args.oiwall} 总分 {r["total"]} {grade(r["total"], r.get("event", False))}\n')
            oiwall(r, args.sell_delta, args.buy_delta)
        finally:
            safe_close(ctx)
        return

    ctx = create_quote_context()
    results = []
    try:
        if args.discover:
            codes = _discover(ctx, args.pool_size)
            if not codes:
                print('发现模式: 粗筛无入围标的'); return
        print(f'扫描 {len(codes)} 标的 | DTE[{args.dte_min},{args.dte_max}] | 6维打分+财报扣分+负溢价否决\n')
        for i, code in enumerate(codes):
            r = collect(ctx, code, args.dte_min, args.dte_max)
            score(r)
            results.append(r)
            tag = grade(r['total'], r.get('event', False)) if not r.get('reason') else f'跳过:{r["reason"]}'
            print(f'  {code:<10} 总分 {r["total"]:>3} {tag}')
            if i < len(codes) - 1:
                time.sleep(3.0)
    finally:
        safe_close(ctx)

    ok = sorted([r for r in results if not r.get('reason')], key=lambda x: -x['total'])
    show = ok[:args.top] if args.top > 0 else ok
    skip = [r for r in results if r.get('reason')]

    # 中文宽字符对齐: f-string 宽度按字符数计会错位, 用 common.pad_disp 按显示宽度补空格
    W_MAIN = [10, 8, 5, 6, 6, 6, 7, 6, 8, 6]
    W_SUB = [4, 5, 5, 5, 5, 5]
    W_END = [5, 8]
    LW = sum(W_MAIN) + 3 + sum(W_SUB) + 3 + sum(W_END)

    def _line(cells, widths, first_left=True):
        return ''.join(pad_disp(s, w, 'left' if (j == 0 and first_left) else 'right')
                       for j, (s, w) in enumerate(zip(cells, widths)))

    print(f'\n{"=" * LW}')
    hdr = (_line(['标的', '现价', 'DTE', 'IV%', '已现%', '溢价%', 'IVRank', 'HVtr', 'GEX', '价差%'], W_MAIN)
           + ' | ' + _line(['流动', '溢价', 'Rank', '形态', 'DTE', 'GEX'], W_SUB, False)
           + ' | ' + _line(['总分', '评级'], W_END, False))
    print(hdr); print('-' * LW)
    for r in show:
        g = lambda k: f'{r[k]:.1f}' if isinstance(r.get(k), (int, float)) and r.get(k) is not None else '-'
        ht = f'{r["hv_trend"]:.2f}' if r.get('hv_trend') is not None else '-'
        row = (_line([r['code'], f'{r["S"]:.2f}', str(r['dte']), g('iv'), g('hv'), g('premium'),
                      g('iv_rank'), ht, gex_label(r), g('spread')], W_MAIN)
               + ' | ' + _line([str(r['s_liq']), str(r['s_prem']), str(r['s_rank']),
                                str(r['s_trend']), str(r['s_dte']), str(r['s_gex'])], W_SUB, False)
               + ' | ' + _line([str(r['total']), grade(r['total'], r.get('event', False))], W_END, False))
        print(row)
    if skip:
        print(f'\n-- 跳过({len(skip)}) --')
        for r in skip:
            print(f'  {r["code"]:<10} {r["reason"]}')

    # 财报事件期提示
    flagged = [r for r in show if r.get('event')]
    print(f'\n{"=" * LW}')
    print('⚠ 财报事件期提示(IV高估+溢价>4%, 疑似临近财报/事件, gap risk 大):')
    if flagged:
        for r in flagged:
            print(f'  {r["code"]:<10} IV状态={r["iv_status"]} 溢价={r["premium"]:.1f}% (已扣15分)')
    else:
        print('  (本次无)')

    # detail
    if args.detail > 0:
        print(f'\n{"=" * LW}\n铁鹰腿骨架(对前 {args.detail} 名):')
        for i, r in enumerate(show[:args.detail]):
            print(f'\n● {r["code"]} 总分{r["total"]} {grade(r["total"], r.get("event", False))}')
            detail(r, args.sell_delta, args.buy_delta, args.capital)
            # 第一名总分≥75: 自动追加完整 OI wall 细看(扫描闭环, 免手动 --oiwall)
            if i == 0 and r['total'] >= 75:
                print(f'\n  ▼ 总分≥75, 自动展开 {r["code"]} 完整 OI wall 分布:')
                oiwall(r, args.sell_delta, args.buy_delta)

    # CSV
    if args.output:
        with open(args.output, 'w', newline='') as f:
            w = csv.writer(f)
            w.writerow(['code', 'S', 'dte', 'iv', 'iv_avg', 'hv', 'premium', 'iv_rank', 'hv_trend',
                        'gex_net', 'gex_gross', 'spread', 's_liq', 's_prem', 's_rank',
                        's_trend', 's_dte', 's_gex', 'event', 'total', 'grade'])
            for r in ok:
                w.writerow([r['code'], r.get('S'), r.get('dte'), r.get('iv'), r.get('iv_avg'), r.get('hv'),
                            r.get('premium'), r.get('iv_rank'), r.get('hv_trend'), r.get('gex_net'),
                            r.get('gex_gross'), r.get('spread'), r.get('s_liq'), r.get('s_prem'),
                            r.get('s_rank'), r.get('s_trend'), r.get('s_dte'), r.get('s_gex'),
                            r.get('event'), r['total'], grade(r['total'], r.get('event', False))])
        print(f'\n已导出 {args.output} ({len(ok)} 行)')


if __name__ == '__main__':
    main()
