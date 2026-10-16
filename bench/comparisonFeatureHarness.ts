import {
  measureRms,
  measureResidual,
  matchingGains,
} from "../src/webview/comparison/comparisonMeasurements";
import { renderMix } from "../src/webview/services/wavExportFormat";
import {
  applyExportEq,
  snapshotExportEq,
} from "../src/webview/services/headphoneEqService";
import HeadphoneEqSettingsService from "../src/webview/services/headphoneEqSettingsService";

Object.assign(window, {
  runAudioFeatureChecks: async () => {
    const assert = (test: boolean, message: string) => {
      if (!test) throw new Error(message);
    };
    const make = (gain: number, hz = 1000) => {
      const b = new AudioBuffer({
        numberOfChannels: 2,
        length: 96000,
        sampleRate: 48000,
      });
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < d.length; i++)
          d[i] = gain * Math.sin((i * 2 * Math.PI * hz) / 48000);
      }
      return b;
    };
    const a = make(0.2),
      b = make(0.1),
      range = { start: 0, end: 2 };
    const levels = [await measureRms(a, range), await measureRms(b, range)];
    const gains = matchingGains(levels);
    assert(gains[0] === 0.5 && gains[1] === 1, "matching gain");
    const residual = await measureResidual(a, b, range, ...gains);
    assert(residual.peakDbfs === -Infinity, "exact residual");
    const output = await renderMix(
      [a, b],
      0,
      2,
      48000,
      { enableHpf: false, hpfHz: 0, enableLpf: false, lpfHz: 0 },
      true,
      gains,
    );
    let maxMixError = 0;
    for (let i = 0; i < output.length; i++)
      maxMixError = Math.max(
        maxMixError,
        Math.abs(output.getChannelData(0)[i] - a.getChannelData(0)[i]),
      );
    assert(maxMixError < 1e-7, "offline gains differ from intended mix");
    const eq = new HeadphoneEqSettingsService();
    eq.setProfile({
      id: "test",
      displayName: "Test",
      meta: {
        name: "Test",
        source: "fixture",
        rig: "fixture",
        form: "raw",
        targetLabel: "fixture",
      },
      preampDb: -6,
      filters: [
        { enabled: true, type: "peaking", frequency: 1000, gainDb: 6, q: 1 },
      ],
      isCustomized: true,
    });
    const snapshot = snapshotExportEq(eq);
    eq.bypassed = true;
    eq.profile!.filters[0].gainDb = -12;
    const eqTone = await applyExportEq(a, snapshot),
      low = make(0.2, 100),
      eqLow = await applyExportEq(low, snapshot);
    const steady = { start: 0.5, end: 2 };
    const highGain =
      (await measureRms(eqTone, steady)) / (await measureRms(a, steady));
    const lowGain =
      (await measureRms(eqLow, steady)) / (await measureRms(low, steady));
    const contrast = 20 * Math.log10(highGain / lowGain);
    assert(contrast > 5.8 && contrast < 6.1, "EQ snapshot/filter shape");
    assert((await applyExportEq(a)) === a, "default dry export");
    let cancelled = false;
    const long = new AudioBuffer({
      numberOfChannels: 2,
      length: 48000 * 300,
      sampleRate: 48000,
    });
    long.getChannelData(0).fill(0.1);
    setTimeout(() => {
      cancelled = true;
    }, 0);
    let cancellation = false;
    try {
      await measureRms(long, { start: 0, end: 300 }, () => cancelled);
    } catch (error) {
      cancellation = String(error).includes("cancelled");
    }
    assert(cancellation, "async cancellation");
    return {
      levels,
      gains,
      residual: {
        ...residual,
        peakDbfs: "-Infinity",
        rmsDbfs: "-Infinity",
        relativeDb: "-Infinity",
      },
      maxMixError,
      eqHighVsLowDb: contrast,
      asynchronousCancellation: cancellation,
    };
  },
});
