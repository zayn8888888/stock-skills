/**
 * Futu OpenD TCP client.
 *
 * Uses the official futu-api proto definitions for protobuf encoding/decoding,
 * with a raw TCP transport layer implementing the FTCP header protocol.
 *
 * Header (44 bytes, little-endian):
 *   offset  0: "FT" magic (2 bytes)
 *   offset  2: protoId (uint32)
 *   offset  6: protoFmtType (uint8, 0=protobuf)
 *   offset  7: protoVer (uint8)
 *   offset  8: serialNo (uint32)
 *   offset 12: bodyLen (uint32)
 *   offset 16: SHA1 of body (20 bytes)
 *   offset 36: reserved (8 bytes)
 */
import { createHash } from "node:crypto";
import { type Socket, connect } from "node:net";
import protoRoot from "futu-api/proto.js";

// ── Minimal protobuf field decoder (for fallback when proto decode fails) ──

interface DecodedField {
  field: number;
  wireType: number;
  value: number | Uint8Array;
}

function decodeFields(buf: Uint8Array): DecodedField[] {
  const fields: DecodedField[] = [];
  let offset = 0;
  while (offset < buf.length) {
    // Read tag
    let tag = 0;
    let shift = 0;
    while (offset < buf.length) {
      const b = buf[offset++];
      tag |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
    }
    const fieldNumber = tag >>> 3;
    const wireType = tag & 0x7;

    if (wireType === 0) {
      // varint
      let val = 0;
      let s = 0;
      while (offset < buf.length) {
        const b = buf[offset++];
        val |= (b & 0x7f) << s;
        if ((b & 0x80) === 0) break;
        s += 7;
      }
      fields.push({ field: fieldNumber, wireType, value: val });
    } else if (wireType === 2) {
      // length-delimited
      let len = 0;
      let s = 0;
      while (offset < buf.length) {
        const b = buf[offset++];
        len |= (b & 0x7f) << s;
        if ((b & 0x80) === 0) break;
        s += 7;
      }
      fields.push({ field: fieldNumber, wireType, value: buf.slice(offset, offset + len) });
      offset += len;
    } else if (wireType === 5) {
      // 32-bit
      fields.push({
        field: fieldNumber,
        wireType,
        value:
          buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24),
      });
      offset += 4;
    } else if (wireType === 1) {
      // 64-bit
      offset += 8;
    } else {
      break; // unknown wire type
    }
  }
  return fields;
}

// ──────────────────── Protocol IDs ──────────────────────────────────

const ProtoID = {
  InitConnect: 1001,
  GetGlobalState: 1002,
  Qot_Sub: 3001,
  Qot_GetBasicQot: 3004,
  Qot_GetKL: 3006,
  Qot_GetOrderBook: 3012,
  Qot_RequestHistoryKL: 3103,
  Qot_GetCapitalFlow: 3211,
  Qot_GetCapitalDistribution: 3212,
  Qot_GetSecuritySnapshot: 3203,
  Qot_GetOptionChain: 3209,
  Qot_GetPlateSet: 3204,
  Qot_GetPlateSecurity: 3205,
  Qot_GetFinancialsStatements: 3214,
  Qot_GetValuationDetail: 3223,
  Qot_GetCorporateActionsDividends: 3224,
  Qot_GetShareholdersOverview: 3225,
} as const;

/** Map protoId to the proto message name prefix. */
const PROTO_NAME: Record<number, string> = {
  [ProtoID.InitConnect]: "InitConnect",
  [ProtoID.GetGlobalState]: "GetGlobalState",
  [ProtoID.Qot_Sub]: "Qot_Sub",
  [ProtoID.Qot_GetBasicQot]: "Qot_GetBasicQot",
  [ProtoID.Qot_GetKL]: "Qot_GetKL",
  [ProtoID.Qot_GetOrderBook]: "Qot_GetOrderBook",
  [ProtoID.Qot_RequestHistoryKL]: "Qot_RequestHistoryKL",
  [ProtoID.Qot_GetCapitalFlow]: "Qot_GetCapitalFlow",
  [ProtoID.Qot_GetCapitalDistribution]: "Qot_GetCapitalDistribution",
  [ProtoID.Qot_GetSecuritySnapshot]: "Qot_GetSecuritySnapshot",
  [ProtoID.Qot_GetOptionChain]: "Qot_GetOptionChain",
  [ProtoID.Qot_GetPlateSet]: "Qot_GetPlateSet",
  [ProtoID.Qot_GetPlateSecurity]: "Qot_GetPlateSecurity",
  [ProtoID.Qot_GetFinancialsStatements]: "Qot_GetFinancialsStatements",
  [ProtoID.Qot_GetValuationDetail]: "Qot_GetValuationDetail",
  [ProtoID.Qot_GetCorporateActionsDividends]: "Qot_GetCorporateActionsDividends",
  [ProtoID.Qot_GetShareholdersOverview]: "Qot_GetShareholdersOverview",
};

// ──────────────────── Market enum ───────────────────────────────────

// ──────────────────── Market enum (QotMarket from Futu proto) ─────

export const Market = {
  HK: 1, // QotMarket_HK_Security
  US: 11, // QotMarket_US_Security
  CN_SH: 21, // QotMarket_CNSH_Security
  CN_SZ: 22, // QotMarket_CNSZ_Security
  SG: 31, // QotMarket_SG_Security
  JP: 41, // QotMarket_JP_Security
} as const;

// ──────────────────── KLType enum ──────────────────────────────────

export const KLType = {
  Min1: 1,
  Day: 2,
  Week: 3,
  Month: 4,
  Year: 5,
  Min5: 6,
  Min15: 7,
  Min30: 8,
  Min60: 9,
  Min3: 10,
  Quarter: 11,
} as const;

// ──────────────────── SubType enum (for subscribe) ────────────────

export const SubType = {
  Basic: 1,
  OrderBook: 2,
  Ticker: 4,
  RT: 5,
  KL_Day: 6,
  KL_5Min: 7,
  KL_15Min: 8,
  KL_30Min: 9,
  KL_60Min: 10,
  KL_1Min: 11,
  KL_Week: 12,
  KL_Month: 13,
  KL_Quarter: 15,
  KL_Year: 16,
} as const;

/** Map KLType → SubType for subscription. */
export function klTypeToSubType(klType: number): number {
  const map: Record<number, number> = {
    [KLType.Min1]: SubType.KL_1Min,
    [KLType.Min5]: SubType.KL_5Min,
    [KLType.Min15]: SubType.KL_15Min,
    [KLType.Min30]: SubType.KL_30Min,
    [KLType.Min60]: SubType.KL_60Min,
    [KLType.Day]: SubType.KL_Day,
    [KLType.Week]: SubType.KL_Week,
    [KLType.Month]: SubType.KL_Month,
    [KLType.Quarter]: SubType.KL_Quarter,
    [KLType.Year]: SubType.KL_Year,
  };
  return map[klType] ?? SubType.KL_Day;
}

// ──────────────────── Helpers ──────────────────────────────────────

/** Convert protobufjs Long objects to numbers for JSON serialization. */
function convertLongs(obj: any): any {
  if (obj == null || typeof obj !== "object") return obj;
  // Check for Long { low, high, unsigned }
  if (
    "low" in obj &&
    "high" in obj &&
    typeof obj.low === "number" &&
    typeof obj.high === "number"
  ) {
    // If it fits in a safe integer, return number; otherwise return string
    const val = obj.high === 0 ? obj.low : Number(obj);
    return Number.isSafeInteger(val) ? val : String(obj);
  }
  if (Array.isArray(obj)) return obj.map(convertLongs);
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = convertLongs(v);
  }
  return result;
}

// ──────────────────── FutuClient ────────────────────────────────────

export class FutuClient {
  private host: string;
  private port: number;
  private socket: Socket | null = null;
  private connected = false;
  private serialCounter = 0;
  private pending = new Map<
    number,
    { resolve: (r: unknown) => void; reject: (e: Error) => void; protoId: number }
  >();
  private buffer = Buffer.alloc(0);
  private connectPromise: Promise<void> | null = null;
  private onDisconnect: (() => void) | null = null;
  private connectTimeoutMs: number;
  private requestTimeoutMs: number;

  constructor(host = "127.0.0.1", port = 11111) {
    this.host = host;
    this.port = port;
    this.connectTimeoutMs = Number(process.env.FUTU_CONNECT_TIMEOUT ?? 10_000);
    this.requestTimeoutMs = Number(process.env.FUTU_REQUEST_TIMEOUT ?? 30_000);
  }

  setOnDisconnect(cb: () => void): void {
    this.onDisconnect = cb;
  }

  // ── Connection ──────────────────────────────────────────────────

  async ensureConnected(): Promise<void> {
    if (this.connected && this.socket) return;
    if (this.connectPromise) return this.connectPromise;
    this.connectPromise = this.doConnect();
    try {
      await this.connectPromise;
    } finally {
      this.connectPromise = null;
    }
  }

  private doConnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const sock = connect({ host: this.host, port: this.port });
      sock.setKeepAlive(true, 30_000);
      sock.setTimeout(this.connectTimeoutMs);

      sock.on("timeout", () => {
        sock.destroy();
        reject(new Error(`Futu OpenD connection timeout: ${this.host}:${this.port}`));
      });

      sock.on("connect", () => {
        sock.setTimeout(0);
        this.socket = sock;
        this.connected = true;
        this.buffer = Buffer.alloc(0);
        resolve();
      });

      sock.on("data", (chunk) => {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        this.processBuffer();
      });

      sock.on("error", (err) => {
        this.connected = false;
        this.socket = null;
        reject(err);
      });

      sock.on("close", () => {
        const wasConnected = this.connected;
        this.connected = false;
        this.socket = null;
        for (const [, p] of this.pending) {
          p.reject(new Error("Connection closed"));
        }
        this.pending.clear();
        if (wasConnected && this.onDisconnect) {
          this.onDisconnect();
        }
      });
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
      this.connected = false;
    }
  }

  // ── Generic send/receive ────────────────────────────────────────

  private encodeRequest(protoId: number, c2sData: Record<string, unknown>): Uint8Array {
    const name = PROTO_NAME[protoId];
    if (!name) throw new Error(`Unknown protoId: ${protoId}`);
    const ReqType = protoRoot.lookup(`${name}.Request`);
    return ReqType.encode(ReqType.create({ c2s: c2sData })).finish();
  }

  private decodeResponse(protoId: number, body: Uint8Array): unknown {
    const name = PROTO_NAME[protoId];
    if (!name) throw new Error(`Unknown protoId: ${protoId}`);
    const RspType = protoRoot.lookup(`${name}.Response`);
    try {
      return RspType.decode(body);
    } catch {
      // Proto version mismatch — extract retType/retMsg manually and return partial
      let retType = -1;
      let retMsg = "";
      for (const f of decodeFields(body)) {
        if (f.field === 1) retType = f.value as number;
        if (f.field === 2) retMsg = new TextDecoder().decode(f.value as Uint8Array);
      }
      return { retType, retMsg, s2c: {} };
    }
  }

  private request(protoId: number, c2s: Record<string, unknown>): Promise<unknown> {
    const body = this.encodeRequest(protoId, c2s);
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error("Not connected"));
        return;
      }

      const serialNo = ++this.serialCounter;
      const header = this.buildHeader(protoId, body.length, serialNo, body);
      const packet = Buffer.concat([Buffer.from(header), Buffer.from(body)]);

      const timer = setTimeout(() => {
        if (this.pending.has(serialNo)) {
          this.pending.delete(serialNo);
          reject(new Error(`Request timeout: protoId=${protoId}`));
        }
      }, this.requestTimeoutMs);

      this.pending.set(serialNo, {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
        protoId,
      });

      this.socket.write(packet, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(serialNo);
          reject(err);
        }
      });
    });
  }

  // ── Header / Buffer ─────────────────────────────────────────────

  private buildHeader(
    protoId: number,
    bodyLen: number,
    serialNo: number,
    body: Uint8Array,
  ): Uint8Array {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const bytes = new Uint8Array(header);

    bytes[0] = 0x46; // 'F'
    bytes[1] = 0x54; // 'T'
    view.setUint32(2, protoId, true);
    bytes[6] = 0; // protoFmtType = protobuf
    bytes[7] = 0; // protoVer
    view.setUint32(8, serialNo, true);
    view.setUint32(12, bodyLen, true);

    const sha1 = createHash("sha1").update(body).digest();
    bytes.set(sha1.subarray(0, 20), 16);

    return new Uint8Array(header);
  }

  private processBuffer(): void {
    const HEADER_LEN = 44;

    while (this.buffer.length >= HEADER_LEN) {
      if (this.buffer[0] !== 0x46 || this.buffer[1] !== 0x54) {
        this.buffer = this.buffer.subarray(1);
        continue;
      }

      const _protoId = this.buffer.readUInt32LE(2);
      const serialNo = this.buffer.readUInt32LE(8);
      const bodyLen = this.buffer.readUInt32LE(12);
      const totalLen = HEADER_LEN + bodyLen;

      if (this.buffer.length < totalLen) break;

      const body = this.buffer.subarray(HEADER_LEN, totalLen);
      this.buffer = this.buffer.subarray(totalLen);

      const pending = this.pending.get(serialNo);
      if (!pending) continue; // push notification or unknown serial — skip

      this.pending.delete(serialNo);
      try {
        // Use the requested protoId for decoding — OpenD may return protoId=0
        // in the response header for some commands (e.g. Qot_Sub).
        const decoded = this.decodeResponse(pending.protoId, body);
        pending.resolve(decoded);
      } catch (err) {
        pending.reject(new Error(`Decode error protoId=${pending.protoId}: ${err}`));
      }
    }
  }

  // ── High-level API ──────────────────────────────────────────────

  async initConnect(): Promise<InitConnectResult> {
    await this.ensureConnected();
    const rsp: any = await this.request(ProtoID.InitConnect, {
      clientVer: 300,
      clientID: `stock-skills-${process.pid}`,
      recvNotify: true,
    });
    if (rsp.retType !== 0) {
      throw new Error(`InitConnect failed: ${rsp.retMsg}`);
    }
    return {
      serverVer: rsp.s2c?.serverVer ?? 0,
      loginUserID: rsp.s2c?.loginUserID?.toNumber?.() ?? 0,
      connID: rsp.s2c?.connID?.toNumber?.() ?? "",
      keepAliveInterval: rsp.s2c?.keepAliveInterval ?? 0,
    };
  }

  /**
   * Subscribe to real-time data for securities.
   * SubType: 1=BasicQot, 2=KL, 4=OrderBook, etc.
   */
  async subscribe(
    securities: Array<{ market: number; code: string }>,
    subTypes: number[],
  ): Promise<void> {
    const rsp: any = await this.request(ProtoID.Qot_Sub, {
      securityList: securities,
      subTypeList: subTypes,
      isSubOrUnSub: true,
      isRegOrUnRegPush: false,
    });
    if (rsp.retType !== 0) {
      throw new Error(`Qot_Sub failed: ${rsp.retMsg}`);
    }
  }

  /**
   * Get market snapshot (no subscription required).
   * Returns comprehensive data including price, volume, PE, market cap, etc.
   */
  async getSecuritySnapshot(securities: Array<{ market: number; code: string }>): Promise<any[]> {
    const securityList = securities.map((s) => ({
      market: s.market,
      code: s.code,
    }));
    const rsp: any = await this.request(ProtoID.Qot_GetSecuritySnapshot, {
      securityList,
    });
    if (rsp.retType !== 0) {
      throw new Error(`Qot_GetSecuritySnapshot failed: ${rsp.retMsg}`);
    }
    return (rsp.s2c?.snapshotList ?? []).map((s: any) => convertLongs(s));
  }

  async getBasicQot(securities: Array<{ market: number; code: string }>): Promise<any[]> {
    const securityList = securities.map((s) => ({
      market: s.market,
      code: s.code,
    }));
    const rsp: any = await this.request(ProtoID.Qot_GetBasicQot, {
      securityList,
    });
    if (rsp.retType !== 0) {
      throw new Error(`Qot_GetBasicQot failed: ${rsp.retMsg}`);
    }
    return (rsp.s2c?.basicQotList ?? []).map((q: any) => convertLongs(q));
  }

  async getKline(market: number, code: string, klType: number, num: number): Promise<any[]> {
    const rsp: any = await this.request(ProtoID.Qot_GetKL, {
      security: { market, code },
      klType,
      reqNum: num,
      rehabType: 1, // forward-adjusted
    });
    if (rsp.retType !== 0) {
      throw new Error(`Qot_GetKL failed: ${rsp.retMsg}`);
    }
    return (rsp.s2c?.klList ?? []).map((bar: any) => convertLongs(bar));
  }

  async getOrderBook(market: number, code: string, num: number): Promise<any> {
    const rsp: any = await this.request(ProtoID.Qot_GetOrderBook, {
      security: { market, code },
      num,
    });
    if (rsp.retType !== 0) {
      throw new Error(`Qot_GetOrderBook failed: ${rsp.retMsg}`);
    }
    return convertLongs(rsp.s2c ?? {});
  }

  /**
   * Get historical K-line data with date range (no subscription required).
   */
  async requestHistoryKline(
    market: number,
    code: string,
    klType: number,
    beginTime: string,
    endTime: string,
    maxCount = 1000,
  ): Promise<any[]> {
    const c2s: Record<string, unknown> = {
      security: { market, code },
      klType,
      beginTime: beginTime || "2020-01-01",
      endTime: endTime || new Date().toISOString().slice(0, 10),
      maxAckKLNum: maxCount,
      rehabType: 1,
    };

    const rsp: any = await this.request(ProtoID.Qot_RequestHistoryKL, c2s);
    if (rsp.retType !== 0) {
      throw new Error(`Qot_RequestHistoryKL failed: ${rsp.retMsg}`);
    }
    return (rsp.s2c?.klList ?? []).map((bar: any) => convertLongs(bar));
  }

  /**
   * Get capital flow data (no subscription required).
   * PeriodType: 1=INTRADAY, 2=DAY, 3=WEEK, 4=MONTH
   */
  async getCapitalFlow(
    market: number,
    code: string,
    periodType: number,
    beginTime?: string,
    endTime?: string,
  ): Promise<any> {
    const c2s: Record<string, unknown> = {
      security: { market, code },
      periodType,
    };
    if (beginTime) c2s.beginTime = beginTime;
    if (endTime) c2s.endTime = endTime;

    const rsp: any = await this.request(ProtoID.Qot_GetCapitalFlow, c2s);
    if (rsp.retType !== 0) {
      throw new Error(`Qot_GetCapitalFlow failed: ${rsp.retMsg}`);
    }
    return convertLongs(rsp.s2c ?? {});
  }

  /**
   * Get capital distribution by size (super/big/mid/small) (no subscription required).
   */
  async getCapitalDistribution(market: number, code: string): Promise<any> {
    const rsp: any = await this.request(ProtoID.Qot_GetCapitalDistribution, {
      security: { market, code },
    });
    if (rsp.retType !== 0) {
      throw new Error(`Qot_GetCapitalDistribution failed: ${rsp.retMsg}`);
    }
    return convertLongs(rsp.s2c ?? {});
  }

  // ── Financial / Valuation / Shareholders ────────────────────────

  /**
   * Get financial statements (income, balance sheet, cash flow).
   * statementType: 1=Year, 2=Quarter; financialType: 1=Report, 2=ExReport
   */
  async getFinancialsStatements(
    market: number,
    code: string,
    statementType = 1,
    financialType = 1,
    num = 8,
  ): Promise<any> {
    const rsp: any = await this.request(ProtoID.Qot_GetFinancialsStatements, {
      security: { market, code },
      statementType,
      financialType,
      num,
    });
    if (rsp.retType !== 0) throw new Error(`Qot_GetFinancialsStatements failed: ${rsp.retMsg}`);
    return convertLongs(rsp.s2c ?? {});
  }

  /**
   * Get valuation detail (PE trend, percentile, distribution).
   * valuationType: 1=PE_TTM; intervalType: 1=Day
   */
  async getValuationDetail(
    market: number,
    code: string,
    valuationType = 1,
    intervalType = 1,
  ): Promise<any> {
    const rsp: any = await this.request(ProtoID.Qot_GetValuationDetail, {
      security: { market, code },
      valuationType,
      intervalType,
    });
    if (rsp.retType !== 0) throw new Error(`Qot_GetValuationDetail failed: ${rsp.retMsg}`);
    return convertLongs(rsp.s2c ?? {});
  }

  /**
   * Get shareholders overview (top holders, holder types, holding periods).
   */
  async getShareholdersOverview(market: number, code: string): Promise<any> {
    const rsp: any = await this.request(ProtoID.Qot_GetShareholdersOverview, {
      security: { market, code },
    });
    if (rsp.retType !== 0) throw new Error(`Qot_GetShareholdersOverview failed: ${rsp.retMsg}`);
    return convertLongs(rsp.s2c ?? {});
  }

  /**
   * Get dividend / corporate actions history.
   */
  async getCorporateActionsDividends(market: number, code: string): Promise<any> {
    const rsp: any = await this.request(ProtoID.Qot_GetCorporateActionsDividends, {
      security: { market, code },
    });
    if (rsp.retType !== 0)
      throw new Error(`Qot_GetCorporateActionsDividends failed: ${rsp.retMsg}`);
    return convertLongs(rsp.s2c ?? {});
  }

  // ── Options / Plates ───────────────────────────────────────────

  /**
   * Get option chain for an underlying stock.
   * type: 1=All, 2=Call, 3=Put
   */
  async getOptionChain(
    market: number,
    code: string,
    type = 1,
    beginTime?: string,
    endTime?: string,
  ): Promise<any> {
    // beginTime/endTime are required by the Futu protobuf schema.
    // Default to a 30-day window if not provided.
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    const bt = beginTime ?? fmt(now);
    const et = endTime ?? fmt(new Date(now.getTime() + 30 * 86400_000));

    const c2s: Record<string, unknown> = {
      owner: { market, code },
      type,
      beginTime: bt,
      endTime: et,
    };
    const rsp: any = await this.request(ProtoID.Qot_GetOptionChain, c2s);
    if (rsp.retType !== 0) throw new Error(`Qot_GetOptionChain failed: ${rsp.retMsg}`);
    return (rsp.s2c?.optionChain ?? []).map((item: any) => convertLongs(item));
  }

  /**
   * Get plate (sector/industry/index) list for a market.
   * plateSetType: 1=All, 2=Industry, 3=Region, 4=Concept, 5=Exchange
   */
  async getPlateSet(market: number, plateSetType = 1): Promise<any[]> {
    const rsp: any = await this.request(ProtoID.Qot_GetPlateSet, {
      market,
      plateSetType,
    });
    if (rsp.retType !== 0) throw new Error(`Qot_GetPlateSet failed: ${rsp.retMsg}`);
    return (rsp.s2c?.plateInfoList ?? []).map((p: any) => convertLongs(p));
  }

  /**
   * Get stocks within a plate (sector/industry/index).
   */
  async getPlateSecurity(plateMarket: number, plateCode: string): Promise<any[]> {
    const rsp: any = await this.request(ProtoID.Qot_GetPlateSecurity, {
      plate: { market: plateMarket, code: plateCode },
    });
    if (rsp.retType !== 0) throw new Error(`Qot_GetPlateSecurity failed: ${rsp.retMsg}`);
    return (rsp.s2c?.staticInfoList ?? []).map((s: any) => convertLongs(s));
  }
}

// ──────────────────── Type Definitions ──────────────────────────────

export interface InitConnectResult {
  serverVer: number;
  loginUserID: number;
  connID: string;
  keepAliveInterval: number;
}
