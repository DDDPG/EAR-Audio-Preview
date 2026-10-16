/* eslint-disable @typescript-eslint/naming-convention -- Mock keys must match the Web Audio and ES module interfaces. */
import { ComparisonSession } from "./comparisonSession";
import { ComparisonTransport } from "./comparisonTransport";
import { MockAudioBuffer } from "../../__mocks__/helper";

function harness() {
  const created: Array<{
    gain: { value: number; setTargetAtTime: jest.Mock };
    start: jest.Mock;
    buffer: AudioBuffer | null;
  }> = [];
  function node() {
    const parameter = () => ({
      value: 0,
      setTargetAtTime: jest.fn(),
      cancelScheduledValues: jest.fn(),
      setValueAtTime: jest.fn(),
      linearRampToValueAtTime: jest.fn(),
    });
    const value = {
      gain: parameter(),
      frequency: parameter(),
      Q: parameter(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      buffer: null,
    };
    value.connect.mockImplementation(() => value);
    created.push(value);
    return value;
  }
  const context = {
    currentTime: 1,
    sampleRate: 48000,
    destination: {},
    createGain: node,
    createBiquadFilter: node,
    createChannelSplitter: node,
    createChannelMerger: node,
    createAnalyser: node,
    createBufferSource: node,
    resume: jest.fn().mockResolvedValue(undefined),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const session = new ComparisonSession();
  const add = (id: string, rate = 48000, channels = 2) =>
    session.add(
      {
        id,
        uri: id,
        name: id,
        revision: 1,
        buffer: new MockAudioBuffer(
          channels,
          rate * 2,
          rate,
        ) as unknown as AudioBuffer,
        sourceSampleRate: rate,
        bitDepth: 24,
      },
      true,
    );
  return { created, context, session, add };
}
test("mixed native sample rates start and seek at one shared context time", async () => {
  const h = harness();
  const a = h.add("a", 44100),
    b = h.add("b", 48000);
  const transport = new ComparisonTransport(
    h.session,
    h.context as unknown as AudioContext,
  );
  await transport.play();
  const sources = h.created.filter((n) => n.start.mock.calls.length);
  expect(sources).toHaveLength(2);
  expect(sources[0].buffer).toBe(a.buffer);
  expect(sources[1].buffer).toBe(b.buffer);
  expect(sources[0].start).toHaveBeenCalledWith(1.02, 0);
  expect(sources[1].start).toHaveBeenCalledWith(1.02, 0);
  h.context.currentTime = 1.52;
  expect(transport.position).toBeCloseTo(0.5);
  transport.seek(1);
  await Promise.resolve();
  const latest = h.created.filter((n) => n.start.mock.calls.length).slice(-2);
  expect(latest[0].start.mock.calls[0]).toEqual(latest[1].start.mock.calls[0]);
  expect(latest[0].start.mock.calls[0][1]).toBeCloseTo(1);
  transport.dispose();
});
test("pause while context.resume is pending cannot start late sources", async () => {
  const h = harness();
  h.add("a");
  let resume: () => void;
  h.context.resume.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resume = resolve;
      }),
  );
  const transport = new ComparisonTransport(
    h.session,
    h.context as unknown as AudioContext,
  );
  const play = transport.play();
  transport.pause();
  resume();
  await play;
  expect(transport.playing).toBe(false);
  expect(h.created.some((n) => n.start.mock.calls.length)).toBe(false);
  transport.dispose();
});
test("mono center pan is minus 3dB and muting does not remove it from analysis state", async () => {
  const h = harness();
  h.add("mono", 48000, 1);
  const transport = new ComparisonTransport(
    h.session,
    h.context as unknown as AudioContext,
  );
  await transport.play();
  const gain = h.created.find((n) => n.gain.value === Math.SQRT1_2);
  expect(gain).toBeDefined();
  h.session.setMuted("mono", true);
  expect(h.session.activeTracks).toHaveLength(1);
  expect(gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(
    0,
    h.context.currentTime,
    0.003,
  );
  transport.dispose();
});

test("bypassing the last track while resume is pending cancels playback", async () => {
  const h = harness();
  h.add("a");
  let resume: () => void;
  h.context.resume.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        resume = resolve;
      }),
  );
  const transport = new ComparisonTransport(
    h.session,
    h.context as unknown as AudioContext,
  );
  const play = transport.play();
  h.session.setActive("a", false);
  resume();
  await play;
  expect(transport.playing).toBe(false);
  expect(h.created.some((n) => n.start.mock.calls.length)).toBe(false);
  transport.dispose();
});
