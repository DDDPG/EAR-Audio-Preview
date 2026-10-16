const oggCrcTable = Uint32Array.from({ length: 256 }, (_, value) => {
  let remainder = value << 24;
  for (let bit = 0; bit < 8; bit++) {
    remainder = (remainder << 1) ^ (remainder & 0x80000000 ? 0x04c11db7 : 0);
  }
  return remainder >>> 0;
});

/** Read a complete, CRC-valid single Opus logical stream. Never combine chained streams. */
export function singleOggOpusLength(
  bytes: Uint8Array,
  sampleRate: number,
  channels: number,
): number | null {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  let serial: number | undefined;
  let sequence = 0;
  let preSkip: number | undefined;
  let continued = false;
  let finalGranule: bigint | undefined;
  while (offset < bytes.length) {
    if (
      offset + 27 > bytes.length ||
      view.getUint32(offset, true) !== 0x5367674f ||
      bytes[offset + 4] !== 0
    ) {
      return null;
    }
    const flags = bytes[offset + 5];
    const segments = bytes[offset + 26];
    const payloadStart = offset + 27 + segments;
    if (!segments || payloadStart > bytes.length || flags & ~7) {
      return null;
    }
    let payloadLength = 0;
    for (let segment = 0; segment < segments; segment++) {
      payloadLength += bytes[offset + 27 + segment];
    }
    const end = payloadStart + payloadLength;
    if (end > bytes.length) {
      return null;
    }
    const pageSerial = view.getUint32(offset + 14, true);
    if (
      view.getUint32(offset + 18, true) !== sequence++ ||
      (serial !== undefined && pageSerial !== serial) ||
      Boolean(flags & 1) !== continued ||
      (offset === 0 ? !(flags & 2) : Boolean(flags & 2))
    ) {
      return null;
    }
    let crc = 0;
    for (let index = offset; index < end; index++) {
      const value =
        index >= offset + 22 && index < offset + 26 ? 0 : bytes[index];
      crc = ((crc << 8) ^ oggCrcTable[((crc >>> 24) ^ value) & 255]) >>> 0;
    }
    if (crc !== view.getUint32(offset + 22, true)) {
      return null;
    }
    serial = pageSerial;
    continued = bytes[payloadStart - 1] === 255;
    if (offset === 0) {
      // OpusHead must occupy the first page by itself; fragmented headers are left untouched.
      if (
        payloadLength < 19 ||
        segments !== 1 ||
        payloadLength >= 255 ||
        view.getUint32(payloadStart, true) !== 0x7375704f ||
        view.getUint32(payloadStart + 4, true) !== 0x64616548 ||
        bytes[payloadStart + 8] < 1 ||
        bytes[payloadStart + 8] > 15 ||
        bytes[payloadStart + 9] !== channels ||
        flags & 4
      ) {
        return null;
      }
      preSkip = view.getUint16(payloadStart + 10, true);
    }
    if (flags & 4) {
      if (end !== bytes.length || continued) {
        return null;
      }
      finalGranule = view.getBigInt64(offset + 6, true);
    }
    offset = end;
  }
  if (
    preSkip === undefined ||
    finalGranule === undefined ||
    finalGranule < BigInt(preSkip)
  ) {
    return null;
  }
  const samples = (Number(finalGranule - BigInt(preSkip)) * sampleRate) / 48000;
  return Number.isSafeInteger(samples) && samples >= 0 ? samples : null;
}

/** The decoder already removes pre-skip; only discard proven trailing padding. */
export function trimSingleOggOpus<
  T extends {
    channelData: Float32Array[];
    samplesDecoded: number;
    sampleRate: number;
  },
>(bytes: Uint8Array, decoded: T): T {
  const length = singleOggOpusLength(
    bytes,
    decoded.sampleRate,
    decoded.channelData.length,
  );
  if (
    length === null ||
    length >= decoded.samplesDecoded ||
    decoded.channelData.some((channel) => channel.length < length)
  ) {
    return decoded;
  }
  return {
    ...decoded,
    samplesDecoded: length,
    channelData: decoded.channelData.map((channel) =>
      channel.subarray(0, length),
    ),
  };
}

/** Split sequential complete logical streams; reject multiplexing and ambiguous boundaries. */
export function sequentialOggOpusStreams(
  bytes: Uint8Array,
): Uint8Array[] | null {
  if (
    bytes.length < 4 ||
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
      0,
      true,
    ) !== 0x5367674f
  ) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const streams: Uint8Array[] = [];
  const serials = new Set<number>();
  let offset = 0;
  let start = 0;
  let serial: number | undefined;
  while (offset < bytes.length) {
    if (
      offset + 27 > bytes.length ||
      view.getUint32(offset, true) !== 0x5367674f
    ) {
      throw new Error("Invalid Ogg Opus page boundary");
    }
    const payload = offset + 27 + bytes[offset + 26];
    if (payload > bytes.length) {
      throw new Error("Truncated Ogg Opus page");
    }
    let end = payload;
    for (let index = offset + 27; index < payload; index++) {
      end += bytes[index];
    }
    if (end > bytes.length) {
      throw new Error("Truncated Ogg Opus payload");
    }
    const pageSerial = view.getUint32(offset + 14, true);
    if (serial === undefined) {
      if (!(bytes[offset + 5] & 2) || serials.has(pageSerial)) {
        throw new Error("Invalid chained Ogg Opus stream");
      }
      serial = pageSerial;
      serials.add(serial);
    } else if (pageSerial !== serial) {
      throw new Error("Multiplexed Ogg Opus streams are not supported");
    }
    if (bytes[offset + 5] & 4) {
      const stream = bytes.subarray(start, end);
      const firstPayload = 27 + stream[26];
      const channels = stream[firstPayload + 9];
      if (!channels || singleOggOpusLength(stream, 48000, channels) === null) {
        throw new Error("Invalid or unsupported Ogg Opus logical stream");
      }
      streams.push(stream);
      serial = undefined;
      start = end;
    }
    offset = end;
  }
  if (serial !== undefined || !streams.length) {
    throw new Error("Ogg Opus stream has no final page");
  }
  return streams;
}
