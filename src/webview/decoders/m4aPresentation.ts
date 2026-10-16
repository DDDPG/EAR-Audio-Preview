interface Box {
  type: string;
  start: number;
  end: number;
}
function children(data: DataView, start: number, end: number): Box[] {
  const out: Box[] = [];
  for (let at = start; at < end; ) {
    if (at + 8 > end) {
      throw new Error("Truncated M4A box");
    }
    const size = data.getUint32(at);
    const type = String.fromCharCode(
      ...new Uint8Array(data.buffer, data.byteOffset + at + 4, 4),
    );
    if (size === 1) {
      throw new Error(
        "Extended M4A boxes are not supported by the local AAC decoder",
      );
    }
    const next = size === 0 ? end : at + size;
    if (next > end || next <= at + 7) {
      throw new Error("Invalid M4A box size");
    }
    out.push({ type, start: at + 8, end: next });
    at = next;
  }
  return out;
}
function child(data: DataView, box: Box, type: string): Box | undefined {
  return children(data, box.start, box.end).find(
    (value) => value.type === type,
  );
}
function fullBox(data: DataView, box: Box, size: number): void {
  if (box.end - box.start < size || data.getUint8(box.start) !== 0) {
    throw new Error(`Unsupported or truncated M4A ${box.type}`);
  }
}

/** Presentation sample range for a single audio track with an optional single edit. */
export function m4aPresentation(
  data: Uint8Array,
  sampleRate: number,
  decodedSamples?: number,
): { start: number; length: number } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const root: Box = { type: "root", start: 0, end: data.byteLength };
  const moov = child(view, root, "moov");
  if (!moov) {
    throw new Error("M4A has no movie metadata");
  }
  const audio = children(view, moov.start, moov.end)
    .filter((box) => box.type === "trak")
    .filter((track) => {
      const mdia = child(view, track, "mdia");
      const handler = mdia && child(view, mdia, "hdlr");
      return (
        handler &&
        handler.end - handler.start >= 12 &&
        view.getUint32(handler.start + 8) === 0x736f756e
      );
    });
  if (audio.length !== 1) {
    throw new Error("The local M4A decoder requires exactly one audio track");
  }
  const gapless = iTunesGapless(view, moov);
  if (gapless) {
    if (
      decodedSamples !== undefined &&
      gapless.start + gapless.length + gapless.padding !== decodedSamples
    ) {
      throw new Error("M4A gapless metadata does not match decoded audio");
    }
    return { start: gapless.start, length: gapless.length };
  }
  const track = audio[0];
  const mdia = child(view, track, "mdia")!;
  const mdhd = child(view, mdia, "mdhd");
  if (!mdhd) {
    throw new Error("M4A has no media timing");
  }
  fullBox(view, mdhd, 24);
  const mediaScale = view.getUint32(mdhd.start + 12);
  if (!mediaScale) {
    throw new Error("Invalid M4A media timescale");
  }
  const minf = child(view, mdia, "minf");
  const stbl = minf && child(view, minf, "stbl");
  const stts = stbl && child(view, stbl, "stts");
  if (!stts) {
    throw new Error(
      "Fragmented M4A timing is not supported by the local AAC decoder",
    );
  }
  fullBox(view, stts, 8);
  const count = view.getUint32(stts.start + 4);
  if (count > (stts.end - stts.start - 8) / 8) {
    throw new Error("Truncated M4A sample timing");
  }
  let mediaDuration = 0;
  for (let i = 0; i < count; i++) {
    mediaDuration +=
      view.getUint32(stts.start + 8 + i * 8) *
      view.getUint32(stts.start + 12 + i * 8);
  }
  if (!Number.isSafeInteger(mediaDuration) || mediaDuration <= 0) {
    throw new Error("Invalid M4A media duration");
  }
  let start = 0;
  let length = Math.round((mediaDuration * sampleRate) / mediaScale);
  const edts = child(view, track, "edts");
  const edit = edts && child(view, edts, "elst");
  if (edit) {
    fullBox(view, edit, 20);
    if (
      view.getUint32(edit.start + 4) !== 1 ||
      view.getInt16(edit.start + 16) !== 1 ||
      view.getInt16(edit.start + 18) !== 0
    ) {
      throw new Error(
        "The local AAC decoder supports only one M4A edit at normal playback speed",
      );
    }
    const mediaTime = view.getInt32(edit.start + 12);
    if (mediaTime < 0) {
      throw new Error(
        "Empty M4A edits are not supported by the local AAC decoder",
      );
    }
    const movie = child(view, moov, "mvhd");
    if (!movie) {
      throw new Error("M4A has no movie timescale");
    }
    fullBox(view, movie, 20);
    const movieScale = view.getUint32(movie.start + 12);
    if (!movieScale) {
      throw new Error("Invalid M4A movie timescale");
    }
    start = Math.round((mediaTime * sampleRate) / mediaScale);
    const remaining = length - start;
    const editLength =
      (view.getUint32(edit.start + 8) * sampleRate) / movieScale;
    length = Math.min(remaining, Math.round(editLength));
  }
  if (start < 0 || length <= 0) {
    throw new Error("Invalid M4A presentation range");
  }
  return { start, length };
}

function iTunesGapless(
  view: DataView,
  moov: Box,
): { start: number; length: number; padding: number } | null {
  const udta = child(view, moov, "udta");
  const meta = udta && child(view, udta, "meta");
  if (!meta) {
    return null;
  }
  fullBox(view, meta, 4);
  const ilst = child(view, { ...meta, start: meta.start + 4 }, "ilst");
  if (!ilst) {
    return null;
  }
  const ascii = (box: Box, skip: number) => {
    if (box.end - box.start < skip || box.end - box.start > 4096) {
      throw new Error("Invalid M4A metadata length");
    }
    return String.fromCharCode(
      ...new Uint8Array(
        view.buffer,
        view.byteOffset + box.start + skip,
        box.end - box.start - skip,
      ),
    );
  };
  for (const item of children(view, ilst.start, ilst.end)) {
    if (item.type !== "----") {
      continue;
    }
    const name = child(view, item, "name");
    if (!name || ascii(name, 4) !== "iTunSMPB") {
      continue;
    }
    const value = child(view, item, "data");
    if (!value) {
      throw new Error("M4A iTunSMPB has no data");
    }
    const fields = ascii(value, 8).trim().split(/\s+/);
    if (
      fields.length < 4 ||
      !fields.slice(0, 4).every((text) => /^[0-9a-fA-F]+$/.test(text))
    ) {
      throw new Error("Invalid M4A gapless metadata");
    }
    const start = Number(BigInt("0x" + fields[1]));
    const padding = Number(BigInt("0x" + fields[2]));
    const length = Number(BigInt("0x" + fields[3]));
    if (
      ![start, padding, length].every(Number.isSafeInteger) ||
      start < 0 ||
      padding < 0 ||
      length <= 0
    ) {
      throw new Error("Invalid M4A gapless sample range");
    }
    return { start, padding, length };
  }
  return null;
}
