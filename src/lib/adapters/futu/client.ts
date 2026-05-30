/**
 * Futu OpenD TCP client.
 *
 * Connects to a local OpenD gateway and sends/receives protobuf-encoded
 * messages over the Futu protocol.
 *
 * Protocol header (44 bytes, little-endian):
 *   - 2 bytes: header length (always 44)
 *   - 2 bytes: protobuf ID (command type)
 *   - 4 bytes: body length
 *   - 4 bytes: serial number
 *   - 32 bytes: reserved (zeroes)
 */

import { connect, type Socket } from "node:net";
import {
  concat,
  encodeInt32,
  encodeSint32,
  encodeSint64,
  encodeString,
  encodeMessage,
  encodeEnum,
  encodeBool,
  encodeDouble,
  encodeRepeatedMessage,
  encodeRepeatedInt32,
  decodeFields,
  decodeZigzag32,
  type DecodeResult,
} from "./proto";

// ──────────────────── Protocol IDs ──────────────────────────────────

const ProtoID = {
  InitConnect: 1001,
  GetGlobalState: 1002,
  Qot_GetBasicQot: 3004,
  Qot_GetKline: 3005,
  Qot_GetOrderBook: 3007,
  Qot_GetStaticInfo: 3029,
  Qot_Sub: 3001,
} as const;

// ──────────────────── Market enum ───────────────────────────────────

export const Market = {
  HK: 1,
  US: 2,
  CN_SH: 3,
  CN_SZ: 4,
  SG: 11,
  JP: 12,
} as const;

// ──────────────────── KLType enum ──────────────────────────────────

export const KLType = {
  Min1: 1,
  Min5: 2,
  Min15: 3,
  Min30: 4,
  Min60: 5,
  Day: 6,
  Week: 7,
  Month: 8,
  Quarter: 9,
  Year: 10,
} as const;

// ──────────────────── Response wrapper ──────────────────────────────

export interface FutuResponse {
  protoId: number;
  serialNo: number;
  retType: number;
  retMsg: string;
  data: Uint8Array;
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
    { resolve: (r: FutuResponse) => void; reject: (e: Error) => void }
  >();
  private buffer = Buffer.alloc(0);
  private connectPromise: Promise<void> | null = null;

  constructor(host = "127.0.0.1", port = 11111) {
    this.host = host;
    this.port = port;
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

      sock.on("connect", () => {
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
        this.connected = false;
        this.socket = null;
        // Reject all pending requests
        for (const [, p] of this.pending) {
          p.reject(new Error("Connection closed"));
        }
        this.pending.clear();
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

  // ── Send / Receive ──────────────────────────────────────────────

  private send(protoId: number, body: Uint8Array): Promise<FutuResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error("Not connected"));
        return;
      }

      const serialNo = ++this.serialCounter;
      const header = this.buildHeader(protoId, body.length, serialNo);
      const packet = concat(header, body);

      this.pending.set(serialNo, { resolve, reject });

      this.socket.write(Buffer.from(packet), (err) => {
        if (err) {
          this.pending.delete(serialNo);
          reject(err);
        }
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pending.has(serialNo)) {
          this.pending.delete(serialNo);
          reject(new Error(`Request timeout: protoId=${protoId}`));
        }
      }, 10_000);
    });
  }

  private buildHeader(
    protoId: number,
    bodyLen: number,
    serialNo: number,
  ): Uint8Array {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    view.setUint16(0, 44, true); // header length
    view.setUint16(2, protoId, true);
    view.setUint32(4, bodyLen, true);
    view.setUint32(8, serialNo, true);
    // 32 bytes reserved = zeroes
    return new Uint8Array(header);
  }

  private processBuffer(): void {
    while (this.buffer.length >= 44) {
      const headerLen = this.buffer.readUInt16LE(0);
      const bodyLen = this.buffer.readUInt32LE(4);
      const totalLen = headerLen + bodyLen;

      if (this.buffer.length < totalLen) break; // incomplete packet

      const protoId = this.buffer.readUInt16LE(2);
      const serialNo = this.buffer.readUInt32LE(8);
      const body = this.buffer.slice(headerLen, totalLen);

      this.buffer = this.buffer.subarray(totalLen);

      const pending = this.pending.get(serialNo);
      if (pending) {
        this.pending.delete(serialNo);
        const response = this.decodeResponse(protoId, serialNo, body);
        pending.resolve(response);
      }
    }
  }

  private decodeResponse(
    protoId: number,
    serialNo: number,
    body: Uint8Array,
  ): FutuResponse {
    let retType = -1;
    let retMsg = "";
    let data = new Uint8Array(0);

    for (const f of decodeFields(body)) {
      switch (f.field) {
        case 1:
          retType = f.value as number;
          break;
        case 2:
          retMsg = new TextDecoder().decode(f.value as Uint8Array);
          break;
        case 3:
          data = new Uint8Array(f.value as Uint8Array);
          break;
      }
    }

    return { protoId, serialNo, retType, retMsg, data };
  }

  // ── High-level API ──────────────────────────────────────────────

  /**
   * Initialize connection with OpenD.
   * Must be called before any other API call.
   */
  async initConnect(): Promise<void> {
    await this.ensureConnected();

    const body = concat(
      encodeInt32(1, 300), // clientVer = 300
      encodeString(2, `stock-skills-${process.pid}`), // clientID
    );

    const resp = await this.send(ProtoID.InitConnect, body);
    if (resp.retType !== 0) {
      throw new Error(`InitConnect failed: ${resp.retMsg}`);
    }
  }

  /**
   * Get quote snapshot for one or more securities.
   */
  async getBasicQot(
    securities: Array<{ market: number; code: string }>,
  ): Promise<BasicQot[]> {
    const secMsgs = securities.map((s) =>
      concat(encodeEnum(1, s.market), encodeString(2, s.code)),
    );
    const body = encodeRepeatedMessage(1, secMsgs);

    const resp = await this.send(ProtoID.Qot_GetBasicQot, body);
    if (resp.retType !== 0) {
      throw new Error(`Qot_GetBasicQot failed: ${resp.retMsg}`);
    }

    return this.parseBasicQotResponse(resp.data);
  }

  /**
   * Get K-line (candlestick) data.
   */
  async getKline(
    market: number,
    code: string,
    klType: number,
    num: number,
  ): Promise<KlineBar[]> {
    const security = concat(
      encodeEnum(1, market),
      encodeString(2, code),
    );
    const body = concat(
      encodeMessage(1, security), // security
      encodeEnum(2, klType), // klType
      encodeInt32(3, num), // num
    );

    const resp = await this.send(ProtoID.Qot_GetKline, body);
    if (resp.retType !== 0) {
      throw new Error(`Qot_GetKline failed: ${resp.retMsg}`);
    }

    return this.parseKlineResponse(resp.data);
  }

  /**
   * Get order book (depth) data.
   */
  async getOrderBook(
    market: number,
    code: string,
    num: number,
  ): Promise<OrderBook> {
    const security = concat(
      encodeEnum(1, market),
      encodeString(2, code),
    );
    const body = concat(
      encodeMessage(1, security), // security
      encodeInt32(2, num), // num
    );

    const resp = await this.send(ProtoID.Qot_GetOrderBook, body);
    if (resp.retType !== 0) {
      throw new Error(`Qot_GetOrderBook failed: ${resp.retMsg}`);
    }

    return this.parseOrderBookResponse(resp.data);
  }

  // ── Response Parsers ────────────────────────────────────────────

  private parseBasicQotResponse(data: Uint8Array): BasicQot[] {
    const results: BasicQot[] = [];

    for (const f of decodeFields(data)) {
      if (f.field === 1 && f.wireType === 2) {
        // BasicQot list
        for (const inner of decodeFields(f.value as Uint8Array)) {
          if (inner.field === 1 && inner.wireType === 2) {
            results.push(this.parseSingleBasicQot(inner.value as Uint8Array));
          }
        }
      }
    }

    return results;
  }

  private parseSingleBasicQot(data: Uint8Array): BasicQot {
    const qot: Partial<BasicQot> = {};

    for (const f of decodeFields(data)) {
      switch (f.field) {
        case 1: // security
          for (const sf of decodeFields(f.value as Uint8Array)) {
            if (sf.field === 1) qot.market = sf.value as number;
            if (sf.field === 2)
              qot.code = new TextDecoder().decode(sf.value as Uint8Array);
          }
          break;
        case 4: qot.price = f.value as number; break; // double
        case 5: qot.highPrice = f.value as number; break;
        case 6: qot.openPrice = f.value as number; break;
        case 7: qot.lowPrice = f.value as number; break;
        case 8: qot.lastClosePrice = f.value as number; break;
        case 9: qot.volume = f.value as number; break; // sint64
        case 10: qot.turnover = f.value as number; break; // double
        case 13: qot.curVolume = f.value as number; break;
        case 16: qot.name = new TextDecoder().decode(f.value as Uint8Array); break;
      }
    }

    return qot as BasicQot;
  }

  private parseKlineResponse(data: Uint8Array): KlineBar[] {
    const bars: KlineBar[] = [];

    for (const f of decodeFields(data)) {
      if (f.field === 1 && f.wireType === 2) {
        // klineList
        for (const inner of decodeFields(f.value as Uint8Array)) {
          if (inner.field === 1 && inner.wireType === 2) {
            bars.push(this.parseSingleKline(inner.value as Uint8Array));
          }
        }
      }
    }

    return bars;
  }

  private parseSingleKline(data: Uint8Array): KlineBar {
    const bar: Partial<KlineBar> = {};

    for (const f of decodeFields(data)) {
      switch (f.field) {
        case 1: bar.time = new TextDecoder().decode(f.value as Uint8Array); break;
        case 2: bar.isOpen = f.value !== 0; break;
        case 3: bar.open = f.value as number; break; // double
        case 4: bar.high = f.value as number; break;
        case 5: bar.low = f.value as number; break;
        case 6: bar.close = f.value as number; break;
        case 7: bar.volume = f.value as number; break; // sint64
        case 8: bar.turnover = f.value as number; break; // double
      }
    }

    return bar as KlineBar;
  }

  private parseOrderBookResponse(data: Uint8Array): OrderBook {
    const asks: OrderBookEntry[] = [];
    const bids: OrderBookEntry[] = [];

    for (const f of decodeFields(data)) {
      if (f.field === 1 && f.wireType === 2) {
        // orderBookAsk
        for (const inner of decodeFields(f.value as Uint8Array)) {
          if (inner.field === 1 && inner.wireType === 2) {
            asks.push(this.parseOrderBookEntry(inner.value as Uint8Array));
          }
        }
      }
      if (f.field === 2 && f.wireType === 2) {
        // orderBookBid
        for (const inner of decodeFields(f.value as Uint8Array)) {
          if (inner.field === 1 && inner.wireType === 2) {
            bids.push(this.parseOrderBookEntry(inner.value as Uint8Array));
          }
        }
      }
    }

    return { asks, bids };
  }

  private parseOrderBookEntry(data: Uint8Array): OrderBookEntry {
    let price = 0;
    let volume = 0;
    let numOrders = 0;

    for (const f of decodeFields(data)) {
      switch (f.field) {
        case 1: price = f.value as number; break; // double
        case 2: volume = f.value as number; break; // sint64
        case 3: numOrders = f.value as number; break; // sint32
      }
    }

    return { price, volume, numOrders };
  }
}

// ──────────────────── Type Definitions ──────────────────────────────

export interface BasicQot {
  market?: number;
  code?: string;
  name?: string;
  price?: number;
  highPrice?: number;
  openPrice?: number;
  lowPrice?: number;
  lastClosePrice?: number;
  volume?: number;
  turnover?: number;
  curVolume?: number;
}

export interface KlineBar {
  time?: string;
  isOpen?: boolean;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  turnover?: number;
}

export interface OrderBookEntry {
  price: number;
  volume: number;
  numOrders: number;
}

export interface OrderBook {
  asks: OrderBookEntry[];
  bids: OrderBookEntry[];
}
