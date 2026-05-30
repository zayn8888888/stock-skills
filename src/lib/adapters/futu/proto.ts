/**
 * Minimal protobuf encoder/decoder for Futu OpenD protocol.
 *
 * Implements only the wire types and message structures needed for:
 * - InitConnect
 * - Qot_GetBasicQot (quote snapshot)
 * - Qot_GetKline (candlestick)
 * - Qot_GetOrderBook (depth)
 * - Qot_GetStaticInfo (ticker info)
 *
 * No external dependencies — hand-coded against the Futu IDL spec.
 */

// ──────────────────── Wire Types ────────────────────────────────────

const VARINT = 0;
const BIT64 = 1;
const LEN = 2;
const BIT32 = 5;

// ──────────────────── Low-level Primitives ──────────────────────────

export function encodeVarint(value: number): Uint8Array {
  const bytes: number[] = [];
  let v = value >>> 0;
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return new Uint8Array(bytes);
}

export function encodeTag(field: number, wire: number): Uint8Array {
  return encodeVarint((field << 3) | wire);
}

export function encodeInt32(field: number, value: number): Uint8Array {
  if (value === 0) return new Uint8Array(0);
  return concat(encodeTag(field, VARINT), encodeVarint(value >>> 0));
}

export function encodeSint32(field: number, value: number): Uint8Array {
  if (value === 0) return new Uint8Array(0);
  const zigzag = (value << 1) ^ (value >> 31);
  return concat(encodeTag(field, VARINT), encodeVarint(zigzag >>> 0));
}

export function encodeSint64(field: number, value: number): Uint8Array {
  if (value === 0) return new Uint8Array(0);
  const zigzag = BigInt(value) < 0n
    ? (BigInt(value) << 1n) ^ -1n
    : BigInt(value) << 1n;
  return concat(encodeTag(field, VARINT), encodeBigVarint(zigzag));
}

export function encodeBool(field: number, value: boolean): Uint8Array {
  if (!value) return new Uint8Array(0);
  return concat(encodeTag(field, VARINT), new Uint8Array([1]));
}

export function encodeDouble(field: number, value: number): Uint8Array {
  if (value === 0) return new Uint8Array(0);
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, value, true);
  return concat(encodeTag(field, BIT64), new Uint8Array(buf));
}

export function encodeString(field: number, value: string): Uint8Array {
  if (!value) return new Uint8Array(0);
  const encoded = new TextEncoder().encode(value);
  return concat(
    encodeTag(field, LEN),
    encodeVarint(encoded.length),
    encoded,
  );
}

export function encodeBytes(field: number, value: Uint8Array): Uint8Array {
  if (value.length === 0) return new Uint8Array(0);
  return concat(encodeTag(field, LEN), encodeVarint(value.length), value);
}

export function encodeMessage(field: number, msg: Uint8Array): Uint8Array {
  if (msg.length === 0) return new Uint8Array(0);
  return concat(encodeTag(field, LEN), encodeVarint(msg.length), msg);
}

export function encodeEnum(field: number, value: number): Uint8Array {
  if (value === 0) return new Uint8Array(0);
  return concat(encodeTag(field, VARINT), encodeVarint(value >>> 0));
}

// ──────────────────── Repeated field helpers ────────────────────────

export function encodeRepeatedMessage(
  field: number,
  messages: Uint8Array[],
): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const msg of messages) {
    if (msg.length > 0) {
      parts.push(encodeMessage(field, msg));
    }
  }
  return concat(...parts);
}

export function encodeRepeatedInt32(
  field: number,
  values: number[],
): Uint8Array {
  // Packed encoding
  if (values.length === 0) return new Uint8Array(0);
  const bodyParts: Uint8Array[] = values.map((v) => encodeVarint(v >>> 0));
  const body = concat(...bodyParts);
  return concat(encodeTag(field, LEN), encodeVarint(body.length), body);
}

// ──────────────────── Big varint (for sint64) ──────────────────────

function encodeBigVarint(value: bigint): Uint8Array {
  const bytes: number[] = [];
  let v = value < 0n ? -value : value;
  // For negative: two's complement for unsigned
  if (value < 0n) {
    v = (1n << 64n) + value;
  }
  while (v > 0x7fn) {
    bytes.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  bytes.push(Number(v));
  return new Uint8Array(bytes);
}

// ──────────────────── Decode primitives ─────────────────────────────

export interface DecodeResult {
  field: number;
  wireType: number;
  value: number | Uint8Array;
}

export function* decodeFields(data: Uint8Array): Generator<DecodeResult> {
  let offset = 0;
  while (offset < data.length) {
    const tag = decodeVarint(data, offset);
    offset = tag.offset;
    const field = tag.value >>> 3;
    const wireType = tag.value & 0x7;

    if (wireType === VARINT) {
      const val = decodeVarint(data, offset);
      offset = val.offset;
      yield { field, wireType, value: val.value };
    } else if (wireType === LEN) {
      const len = decodeVarint(data, offset);
      offset = len.offset;
      const bytes = data.slice(offset, offset + len.value);
      offset += len.value;
      yield { field, wireType, value: bytes };
    } else if (wireType === BIT64) {
      const bytes = data.slice(offset, offset + 8);
      offset += 8;
      const dv = new DataView(bytes.buffer, bytes.byteOffset, 8);
      yield { field, wireType, value: dv.getFloat64(0, true) };
    } else if (wireType === BIT32) {
      const bytes = data.slice(offset, offset + 4);
      offset += 4;
      const dv = new DataView(bytes.buffer, bytes.byteOffset, 4);
      yield { field, wireType, value: dv.getFloat32(0, true) };
    } else {
      break; // unknown wire type
    }
  }
}

function decodeVarint(
  data: Uint8Array,
  offset: number,
): { value: number; offset: number } {
  let result = 0;
  let shift = 0;
  let pos = offset;
  while (pos < data.length) {
    const byte = data[pos];
    result |= (byte & 0x7f) << shift;
    pos++;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return { value: result >>> 0, offset: pos };
}

export function decodeZigzag32(value: number): number {
  return (value >>> 1) ^ -(value & 1);
}

export function decodeZigzag64(lo: number, hi: number): number {
  // Simplified: assumes value fits in JS number range
  const val = lo >>> 0;
  return (val >>> 1) ^ -(val & 1);
}

// ──────────────────── Utility ───────────────────────────────────────

export function concat(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
