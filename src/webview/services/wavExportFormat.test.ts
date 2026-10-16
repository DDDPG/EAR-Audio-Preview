// Shared encoding must initialize without the single-file export orchestrator.
jest.mock("./audioExportService", () => {
  throw new Error("WAV encoding must not import audioExportService");
});

import { createAudioContext, MockAudioBuffer } from "../../__mocks__/helper";
import {
  encodeRenderedWav,
  renderMix,
  type WavExportFormat,
} from "./wavExportFormat";
const originalAudioContext = globalThis.AudioContext;
beforeAll(() => {
  globalThis.AudioContext = function mockAudioContext() {
    return createAudioContext(48000);
  } as unknown as typeof AudioContext;
});
afterAll(() => {
  globalThis.AudioContext = originalAudioContext;
});
const format: WavExportFormat = {
  sampleRate: 48000,
  bitDepth: 16,
  channelMode: "as_is",
};
const buffer = () => {
  const value = new MockAudioBuffer(2, 4, 48000);
  value.data[0].set([0.5, 2, -2, 0]);
  value.data[1].set([0.2, 0.3, 0.4, 0]);
  return value as unknown as AudioBuffer;
};
test.each(["float", "attenuate", "clip", "cancel"] as const)(
  "integer overload handles explicit %s choice",
  async (choice) => {
    const choose = jest.fn().mockResolvedValue(choice);
    const wav = await encodeRenderedWav(buffer(), format, 24, choose);
    expect(choose).toHaveBeenCalledWith(2);
    if (choice === "cancel") {
      expect(wav).toBeNull();
      return;
    }
    const header = new DataView(wav.buffer);
    expect(header.getUint32(24, true)).toBe(48000);
    expect(header.getUint16(22, true)).toBe(2);
    expect(header.getUint16(34, true)).toBe(choice === "float" ? 32 : 16);
    if (choice === "float") {
      expect(header.getFloat32(58 + 8, true)).toBe(2);
    } else {
      expect(header.getInt16(44 + 4, true)).toBe(32767);
      expect(header.getInt16(44, true)).toBe(
        choice === "attenuate" ? 8191 : 16383,
      );
    }
  },
);
test("channel conversion precedes overload detection and rejects nonfinite audio", async () => {
  const stereo = buffer();
  stereo.getChannelData(1).set([-0.5, -2, 2, 0]);
  const choose = jest.fn();
  const wav = await encodeRenderedWav(
    stereo,
    { ...format, channelMode: "mono_mix" },
    null,
    choose,
  );
  expect(choose).not.toHaveBeenCalled();
  expect(new DataView(wav.buffer).getUint16(22, true)).toBe(1);
  stereo.getChannelData(0)[0] = NaN;
  await expect(encodeRenderedWav(stereo, format, null, choose)).rejects.toThrow(
    "non-finite",
  );
});
test("mix graph retains native buffers and pads shorter sources, using one output rate", async () => {
  const starts: jest.Mock[] = [],
    gains: number[] = [];
  const native = [
    new MockAudioBuffer(1, 44100, 44100),
    new MockAudioBuffer(2, 96000, 48000),
  ] as unknown as AudioBuffer[];
  const rendered = new MockAudioBuffer(
    2,
    144000,
    96000,
  ) as unknown as AudioBuffer;
  const node = () => {
    const value = {
      gain: { value: 1 },
      connect: jest.fn(),
      disconnect: jest.fn(),
    };
    value.connect.mockImplementation(() => value);
    return value;
  };
  const sources: Array<{ buffer: AudioBuffer; start: jest.Mock }> = [];
  const original = globalThis.OfflineAudioContext;
  const constructor = jest.fn().mockImplementation(() => ({
    destination: {},
    createGain: () => {
      const n = node();
      Object.defineProperty(n.gain, "value", {
        set(v) {
          gains.push(v);
        },
      });
      return n;
    },
    createBufferSource: () => {
      const start = jest.fn();
      starts.push(start);
      const n = { ...node(), buffer: null, start };
      sources.push(n);
      return n;
    },
    startRendering: () => Promise.resolve(rendered),
  }));
  globalThis.OfflineAudioContext = constructor;
  try {
    expect(
      await renderMix(
        native,
        0.5,
        2,
        96000,
        { enableHpf: false, enableLpf: false, hpfHz: 20, lpfHz: 20000 },
        true,
      ),
    ).toBe(rendered);
    expect(constructor).toHaveBeenCalledWith(2, 144000, 96000);
    expect(sources.map((s) => s.buffer)).toEqual(native);
    expect(starts[0]).toHaveBeenCalledWith(0, 0.5, 0.5);
    expect(starts[1]).toHaveBeenCalledWith(0, 0.5, 1.5);
    expect(gains).toEqual([Math.SQRT1_2, 1]);
  } finally {
    globalThis.OfflineAudioContext = original;
  }
});
