import { createAudioContext, waitEventForAction } from "../../__mocks__/helper";
import { AnalyzeDefault, PlayerDefault } from "../../config";
import { EventType } from "../events";
import AnalyzeSettingsService from "./analyzeSettingsService";
import EditExportSettingsService from "./editExportSettingsService";
import EditListenService from "./editListenService";
import PlayerService from "./playerService";
import PlayerSettingsService from "./playerSettingsService";
import * as audioExport from "./audioExportService";

describe("EditListenService", () => {
  let audioBuffer: AudioBuffer;
  let analyzeSettings: AnalyzeSettingsService;
  let editExportSettings: EditExportSettingsService;
  let playerSettings: PlayerSettingsService;
  let playerService: PlayerService;
  let editListen: EditListenService;

  beforeEach(() => {
    const ctx = createAudioContext(44100);
    audioBuffer = ctx.createBuffer(2, 44100 * 10, 44100);
    analyzeSettings = AnalyzeSettingsService.fromDefaultSetting(
      {} as AnalyzeDefault,
      audioBuffer,
    );
    analyzeSettings.minTime = 0.5;
    analyzeSettings.maxTime = 2.5;
    editExportSettings = EditExportSettingsService.create(audioBuffer);
    editExportSettings.setRegion(1, 3);
    playerSettings = PlayerSettingsService.fromDefaultSetting(
      {} as PlayerDefault,
      audioBuffer,
    );
    playerService = new PlayerService(
      ctx,
      audioBuffer,
      playerSettings,
      analyzeSettings,
    );
    editListen = new EditListenService(
      audioBuffer,
      editExportSettings,
      playerSettings,
      analyzeSettings,
      playerService,
    );
  });

  afterEach(() => {
    editListen.leave();
    playerService.dispose();
    editListen.dispose();
    jest.restoreAllMocks();
  });

  test.each(["leave", "dispose"] as const)(
    "late rendering cannot reactivate after %s",
    async (action) => {
      let resolve: (buffer: AudioBuffer) => void;
      jest.spyOn(audioExport, "renderExportBuffer").mockImplementation(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      );
      editExportSettings.listenMode = "processed";
      editListen.enter();
      editListen[action]();
      resolve(audioBuffer);
      await new Promise((r) => setTimeout(r, 0));
      expect(editListen.active).toBe(false);
      expect(playerService.editListenActive).toBe(false);
    },
  );

  test("late old render cannot replace the current settings cache", async () => {
    const resolvers: Array<(buffer: AudioBuffer) => void> = [];
    jest
      .spyOn(audioExport, "renderExportBuffer")
      .mockImplementation(() => new Promise((r) => resolvers.push(r)));
    const first = editListen.getProcessedBuffer();
    editExportSettings.setRegion(2, 4);
    editListen.invalidateCache();
    const second = editListen.getProcessedBuffer();
    const newer = createAudioContext(44100).createBuffer(2, 10, 44100);
    resolvers[1](newer);
    await second;
    resolvers[0](audioBuffer);
    await first;
    expect(await editListen.getProcessedBuffer()).toBe(newer);
  });

  test("enter syncs analyze range and activates player edit listen", () => {
    editListen.enter();
    expect(editListen.active).toBe(true);
    expect(analyzeSettings.minTime).toBeCloseTo(1);
    expect(analyzeSettings.maxTime).toBeCloseTo(3);
    expect(playerService.editListenActive).toBe(true);
  });

  test("leave restores analyze snapshot", () => {
    editListen.enter();
    analyzeSettings.minTime = 9;
    editListen.leave();
    expect(analyzeSettings.minTime).toBeCloseTo(0.5);
    expect(analyzeSettings.maxTime).toBeCloseTo(2.5);
    expect(playerService.editListenActive).toBe(false);
  });

  test("onRegionChanged updates analyze range and playback cue", () => {
    editListen.enter();
    editListen.onRegionChanged(0.2, 0.8);
    expect(analyzeSettings.minTime).toBeCloseTo(0.2);
    expect(analyzeSettings.maxTime).toBeCloseTo(0.8);
    expect(playerService.playbackPosition).toBeCloseTo(0.2);
  });

  test("listen mode change dispatches event", async () => {
    const detail = await waitEventForAction(
      () => {
        editExportSettings.listenMode = "processed";
      },
      editExportSettings,
      EventType.EE_UPDATE_LISTEN_MODE,
    );
    expect(detail.value).toBe("processed");
  });

  test("region change pauses playback without auto-resuming", async () => {
    editListen.enter();
    playerService.play();
    expect(playerService.isPlaying).toBe(true);

    const playSpy = jest.spyOn(playerService, "play");
    editExportSettings.setRegion(2, 4);
    await new Promise((r) => setTimeout(r, 0));

    expect(playerService.isPlaying).toBe(false);
    expect(playSpy).not.toHaveBeenCalled();
    playSpy.mockRestore();
  });

  test("listen mode change pauses playback without auto-resuming", async () => {
    editListen.enter();
    playerService.play();
    expect(playerService.isPlaying).toBe(true);

    const playSpy = jest.spyOn(playerService, "play");
    editExportSettings.listenMode = "processed";
    await new Promise((r) => setTimeout(r, 0));

    expect(playerService.isPlaying).toBe(false);
    expect(playSpy).not.toHaveBeenCalled();
    playSpy.mockRestore();
  });

  test("enter during playback replaces the old source with the dry selection loop", () => {
    const create = jest.spyOn(playerService.audioContext, "createBufferSource");
    playerService.play();
    const original = create.mock.results[0].value as AudioBufferSourceNode;
    const stop = jest.spyOn(original, "stop");
    editListen.enter();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(2);
    const loop = create.mock.results[1].value as AudioBufferSourceNode;
    expect(loop.buffer).toBe(audioBuffer);
    expect(loop.loop).toBe(true);
    expect(loop.loopStart).toBe(1);
    expect(loop.loopEnd).toBe(3);
    expect(playerService.isPlaying).toBe(true);
  });

  test("processed entry stops immediately and resumes only the rendered selection", async () => {
    let resolve: (buffer: AudioBuffer) => void;
    jest.spyOn(audioExport, "renderExportBuffer").mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const create = jest.spyOn(playerService.audioContext, "createBufferSource");
    editExportSettings.listenMode = "processed";
    playerService.play();
    const stop = jest.spyOn(create.mock.results[0].value, "stop");
    editListen.enter();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(playerService.isPlaying).toBe(false);
    expect(playerService.editListenActive).toBe(true);
    playerService.play();
    expect(create).toHaveBeenCalledTimes(1);
    const processed = playerService.audioContext.createBuffer(2, 88200, 44100);
    resolve(processed);
    await new Promise((done) => setTimeout(done, 0));
    expect(create).toHaveBeenCalledTimes(2);
    const source = create.mock.results[1].value as AudioBufferSourceNode;
    expect(source.buffer).toBe(processed);
    expect(source.loop).toBe(true);
    expect(source.loopEnd).toBe(2);
    expect(playerService.isPlaying).toBe(true);
  });

  test.each(["leave", "dispose", "mode", "region"] as const)(
    "processed entry cannot restart stale playback after %s",
    async (action) => {
      const resolvers: Array<(buffer: AudioBuffer) => void> = [];
      jest
        .spyOn(audioExport, "renderExportBuffer")
        .mockImplementation(() => new Promise((done) => resolvers.push(done)));
      const create = jest.spyOn(
        playerService.audioContext,
        "createBufferSource",
      );
      editExportSettings.listenMode = "processed";
      playerService.play();
      editListen.enter();
      if (action === "mode") {
        editExportSettings.listenMode = "dry";
      } else if (action === "region") {
        editExportSettings.setRegion(2, 4);
      } else {
        editListen[action]();
      }
      for (const resolve of resolvers) {
        resolve(audioBuffer);
      }
      await new Promise((done) => setTimeout(done, 0));
      expect(playerService.isPlaying).toBe(false);
      expect(create).toHaveBeenCalledTimes(1);
    },
  );

  test.each(["dry", "processed"] as const)(
    "entering %s while idle does not start playback",
    async (mode) => {
      jest
        .spyOn(audioExport, "renderExportBuffer")
        .mockResolvedValue(audioBuffer);
      const create = jest.spyOn(
        playerService.audioContext,
        "createBufferSource",
      );
      editExportSettings.listenMode = mode;
      editListen.enter();
      await new Promise((done) => setTimeout(done, 0));
      expect(playerService.isPlaying).toBe(false);
      expect(create).not.toHaveBeenCalled();
    },
  );
});
