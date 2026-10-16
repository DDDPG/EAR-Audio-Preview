import { EventType } from "../events";
import {
  createAudioContext,
  wait,
  waitEventForAction,
} from "../../__mocks__/helper";
import PlayerService from "./playerService";
import { AnalyzeDefault, PlayerDefault } from "../../config";
import PlayerSettingsService from "./playerSettingsService";
import AnalyzeSettingsService from "./analyzeSettingsService";

describe("playerService", () => {
  let playerService: PlayerService;
  let playerSettingService: PlayerSettingsService;
  beforeAll(() => {
    const audioContext = createAudioContext(44100);
    const audioBuffer = audioContext.createBuffer(1, 44100 * 10, 44100);
    const pd = {} as PlayerDefault;
    playerSettingService = PlayerSettingsService.fromDefaultSetting(
      pd,
      audioBuffer,
    );
    const analyzeSettingsService = AnalyzeSettingsService.fromDefaultSetting(
      {} as AnalyzeDefault,
      audioBuffer,
    );
    playerService = new PlayerService(
      audioContext,
      audioBuffer,
      playerSettingService,
      analyzeSettingsService,
    );
  });

  afterAll(() => {
    playerService.dispose();
  });

  test("play", async () => {
    const detail = await waitEventForAction(
      () => {
        playerService.play();
      },
      playerService,
      EventType.UPDATE_IS_PLAYING,
    );

    expect(detail.value).toBe(true);
  });

  test("tick", async () => {
    const detail = await waitEventForAction(
      () => {
        playerService.tick();
      },
      playerService,
      EventType.UPDATE_SEEKBAR,
    );

    expect(detail.value).toBeDefined();
  });

  test("pause", async () => {
    const detail = await waitEventForAction(
      () => {
        playerService.pause();
      },
      playerService,
      EventType.UPDATE_IS_PLAYING,
    );

    expect(detail.value).toBe(false);
  });

  test("pause does not move fixed playback cue; play restarts from cue", async () => {
    const cueSec = 2.5;
    playerService.setPlaybackPosition(cueSec);

    const startOffsets: number[] = [];
    const ctx = playerService.audioContext;
    const origCreateBufferSource = ctx.createBufferSource.bind(ctx);
    jest.spyOn(ctx, "createBufferSource").mockImplementation(() => {
      const source = origCreateBufferSource();
      const origStart = source.start.bind(source);
      jest
        .spyOn(source, "start")
        .mockImplementation((when?: number, offset?: number) => {
          startOffsets.push(offset ?? 0);
          origStart(when, offset);
        });
      return source;
    });

    playerService.play();
    await wait(30);
    playerService.pause();

    expect(playerService.playbackPosition).toBe(cueSec);

    playerService.play();
    expect(startOffsets.length).toBeGreaterThanOrEqual(2);
    expect(startOffsets[startOffsets.length - 1]).toBeCloseTo(cueSec, 5);

    jest.restoreAllMocks();
  });

  test("hearing protection mutes output without changing user volume", async () => {
    playerService.volume = 1;
    const detail = await waitEventForAction(
      () => {
        playerService.setHearingProtectionActive(true);
      },
      playerService,
      EventType.UPDATE_HEARING_PROTECTION,
    );
    expect(detail.active).toBe(true);
    expect(playerService.volume).toBe(1);
    expect(playerService.hearingProtectionActive).toBe(true);
    playerService.setHearingProtectionActive(false);
    expect(playerService.hearingProtectionActive).toBe(false);
  });

  test("setEditListenState toggles edit listen mode", () => {
    playerService.setEditListenState({
      active: true,
      mode: "dry",
      regionStart: 1,
      regionEnd: 5,
    });
    expect(playerService.editListenActive).toBe(true);
    playerService.setEditListenState({ active: false });
    expect(playerService.editListenActive).toBe(false);
  });
});

describe("live routing transitions", () => {
  let context: AudioContext;
  let settings: AnalyzeSettingsService;
  let player: PlayerService;
  let sources: AudioBufferSourceNode[];
  let output: GainNode;
  let outputConnections: Set<AudioNode>;
  let destinationConnections: Set<AudioNode>;

  beforeEach(() => {
    jest.useFakeTimers();
    context = createAudioContext(44100);
    const audio = context.createBuffer(2, 441000, 44100);
    settings = AnalyzeSettingsService.fromDefaultSetting(
      { hearingProtectionEnabled: false } as AnalyzeDefault,
      audio,
    );
    const playerSettings = PlayerSettingsService.fromDefaultSetting(
      {} as PlayerDefault,
      audio,
    );
    outputConnections = new Set();
    destinationConnections = new Set();
    const createGain = context.createGain.bind(context);
    jest.spyOn(context, "createGain").mockImplementation(() => {
      const gain = createGain();
      if (!output) {
        output = gain;
        jest
          .spyOn(gain, "connect")
          .mockImplementation((destination: AudioNode) => {
            outputConnections.add(destination);
            if (destination === context.destination) {
              destinationConnections.add(gain);
            }
            return destination;
          });
        jest.spyOn(gain, "disconnect").mockImplementation(() => {
          outputConnections.clear();
          destinationConnections.delete(gain);
        });
      }
      return gain;
    });
    const createMerger = context.createChannelMerger.bind(context);
    jest
      .spyOn(context, "createChannelMerger")
      .mockImplementation((channels) => {
        const merger = createMerger(channels);
        jest
          .spyOn(merger, "connect")
          .mockImplementation((destination: AudioNode) => {
            if (destination === context.destination) {
              destinationConnections.add(merger);
            }
            return destination;
          });
        jest.spyOn(merger, "disconnect").mockImplementation(() => {
          destinationConnections.delete(merger);
        });
        return merger;
      });
    sources = [];
    const createSource = context.createBufferSource.bind(context);
    jest.spyOn(context, "createBufferSource").mockImplementation(() => {
      const source = createSource();
      jest.spyOn(source, "start");
      jest.spyOn(source, "stop");
      sources.push(source);
      return source;
    });
    player = new PlayerService(context, audio, playerSettings, settings);
  });

  afterEach(() => {
    player.dispose();
    settings.dispose();
    output = undefined;
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test.each(["showLiveAnalysis", "showLevelMeter"] as const)(
    "%s changes output routing without restarting the source or its clock",
    (setting) => {
      player.setPlaybackPosition(2);
      player.play();
      Object.defineProperty(context, "currentTime", {
        value: 3,
        writable: true,
      });
      const seek = jest.fn();
      player.addEventListener(EventType.UPDATE_SEEKBAR, seek);
      for (const enabled of [true, false, true, false]) {
        settings[setting] = enabled;
        expect(player.getAnalysers() !== null).toBe(enabled);
        expect(sources).toHaveLength(1);
        expect(sources[0].stop).not.toHaveBeenCalled();
        expect(outputConnections.size).toBe(1);
        expect(destinationConnections.size).toBe(1);
        expect(outputConnections.has(context.destination)).toBe(!enabled);
        player.tick();
        expect(seek.mock.calls.at(-1)[0].detail.pos).toBe(5);
        expect(player.playbackPosition).toBe(2);
      }
    },
  );

  test("monitor mode and solo route audio with all analysis consumers disabled", () => {
    player.play();
    settings.liveMonitoringMode = "s";
    expect(player.getAnalysers()).not.toBeNull();
    expect(outputConnections.has(context.destination)).toBe(false);
    settings.monitorBandSoloMask = 1;
    settings.liveMonitoringMode = "lr";
    expect(player.getAnalysers()).not.toBeNull();
    expect(outputConnections.has(context.destination)).toBe(false);
    expect(outputConnections.size).toBe(1);
    expect(destinationConnections.size).toBe(1);
    settings.monitorBandSoloMask = 0;
    expect(player.getAnalysers()).toBeNull();
    expect(outputConnections.has(context.destination)).toBe(true);
    settings.monitorBandSoloMask = 2;
    expect(player.getAnalysers()).not.toBeNull();
    settings.monitorBandSoloMask = 31;
    expect(player.getAnalysers()).toBeNull();
    expect(outputConnections.size).toBe(1);
    expect(destinationConnections.size).toBe(1);
    expect(sources).toHaveLength(1);
    expect(sources[0].stop).not.toHaveBeenCalled();
  });

  test("idle routing changes never create or start a playback source", () => {
    settings.showLiveAnalysis = true;
    settings.showLiveAnalysis = false;
    settings.showLevelMeter = true;
    settings.liveMonitoringMode = "s";
    settings.showLevelMeter = false;
    expect(player.getAnalysers()).not.toBeNull();
    settings.monitorBandSoloMask = 1;
    settings.liveMonitoringMode = "lr";
    expect(player.getAnalysers()).not.toBeNull();
    settings.monitorBandSoloMask = 0;
    expect(player.getAnalysers()).toBeNull();
    expect(player.isPlaying).toBe(false);
    expect(sources).toHaveLength(0);
  });
});

describe("monitor graph channel layout", () => {
  test.each([1, 2])(
    "%i-channel audio uses mono analyser limbs from their first connection",
    (channels) => {
      const context = createAudioContext(48000);
      const audio = context.createBuffer(channels, 4800, 48000);
      const settings = AnalyzeSettingsService.fromDefaultSetting(
        {
          hearingProtectionEnabled: false,
          showLiveAnalysis: true,
        } as AnalyzeDefault,
        audio,
      );
      const layouts: Array<{ count: number; mode: ChannelCountMode }> = [];
      const createAnalyser = context.createAnalyser.bind(context);
      const spy = jest
        .spyOn(context, "createAnalyser")
        .mockImplementation(() => {
          const analyser = createAnalyser();
          const connect = analyser.connect.bind(analyser);
          analyser.connect = ((destination: AudioNode) => {
            layouts.push({
              count: analyser.channelCount,
              mode: analyser.channelCountMode,
            });
            return connect(destination);
          }) as typeof analyser.connect;
          return analyser;
        });
      const player = new PlayerService(
        context,
        audio,
        PlayerSettingsService.fromDefaultSetting({} as PlayerDefault, audio),
        settings,
      );
      try {
        player.play();
        expect(layouts).toHaveLength(4);
        expect(layouts).toEqual(
          Array.from({ length: 4 }, () => ({ count: 1, mode: "explicit" })),
        );
        expect(player.getAnalysers().left).not.toBe(
          player.getAnalysers().right,
        );
      } finally {
        player.dispose();
        settings.dispose();
        spy.mockRestore();
      }
    },
  );
});
