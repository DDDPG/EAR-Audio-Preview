export function encodeToWav(
  samples: Float32Array[],
  sampleRate: number,
  numChannels: number,
  bitDepth: 8 | 16 | 24 | 32 = 16,
): Uint8Array {
  if (
    ![8, 16, 24, 32].includes(bitDepth) ||
    numChannels < 1 ||
    numChannels !== samples.length ||
    samples.some((s) => s.length !== samples[0].length)
  ) {
    throw new Error("Invalid WAV sample layout");
  }
  const bytesPerSample = bitDepth / 8;
  const dataBytes = samples[0].length * numChannels * bytesPerSample;
  const isFloat = bitDepth === 32;
  // IEEE float WAV uses WAVEFORMATEX and a fact chunk with the frame count.
  const dataOffset = isFloat ? 58 : 44;
  const buffer = new ArrayBuffer(dataOffset + dataBytes + (dataBytes % 2));
  const view = new DataView(buffer);

  // RIFF header
  writeString(view, 0, "RIFF");
  // file size
  view.setUint32(4, buffer.byteLength - 8, true);
  // WAVE header
  writeString(view, 8, "WAVE");
  // fmt chunk
  writeString(view, 12, "fmt ");
  // byte of fmt chunk
  view.setUint32(16, isFloat ? 18 : 16, true);
  // fmt id
  view.setUint16(20, isFloat ? 3 : 1, true);
  // number of channels
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  // block size
  view.setUint16(32, numChannels * bytesPerSample, true);
  // bit depth
  view.setUint16(34, bitDepth, true);
  if (isFloat) {
    view.setUint16(36, 0, true);
    writeString(view, 38, "fact");
    view.setUint32(42, 4, true);
    view.setUint32(46, samples[0].length, true);
  }
  // data chunk
  writeString(view, dataOffset - 8, "data");
  // byte of data chunk
  view.setUint32(dataOffset - 4, dataBytes, true);
  // audio data
  if (bitDepth === 16) {
    floatTo16BitPCM(buffer, dataOffset, samples);
  } else {
    let offset = dataOffset;
    for (let i = 0; i < samples[0].length; i++) {
      for (let ch = 0; ch < numChannels; ch++, offset += bytesPerSample) {
        const sample = samples[ch][i];
        if (isFloat) {
          view.setFloat32(offset, sample, true);
        } else if (bitDepth === 8) {
          view.setUint8(
            offset,
            Math.max(0, Math.min(255, Math.round(sample * 128 + 128))),
          );
        } else {
          const value = Math.max(
            -8388608,
            Math.min(8388607, Math.round(sample * 8388608)),
          );
          view.setUint8(offset, value & 255);
          view.setUint8(offset + 1, (value >> 8) & 255);
          view.setUint8(offset + 2, (value >> 16) & 255);
        }
      }
    }
  }

  return new Uint8Array(buffer);
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/** WAV is little-endian; direct Int16Array stores are only valid on LE hosts. */
const isLittleEndian = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;

function floatTo16BitPCM(
  buffer: ArrayBuffer,
  byteOffset: number,
  input: Float32Array[],
) {
  const length = input[0].length;
  const numChannels = input.length;

  if (isLittleEndian) {
    // Fast path: typed-array stores avoid per-sample DataView call overhead.
    // byteOffset (44) is 2-byte aligned; Int16Array truncation matches setInt16.
    const out = new Int16Array(buffer, byteOffset, length * numChannels);
    let w = 0;
    for (let i = 0; i < length; i++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const s = Math.max(-1, Math.min(1, input[ch][i]));
        out[w++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
    }
    return;
  }

  const view = new DataView(buffer);
  let offset = byteOffset;
  for (let i = 0; i < length; i++, offset += 2 * numChannels) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, input[ch][i]));
      view.setInt16(offset + 2 * ch, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
  }
}
