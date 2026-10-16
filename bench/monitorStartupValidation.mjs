/**
 * Native Chrome PCM acceptance for the actual PlayerService, including frame zero.
 * No Playwright dependency is added to the project. Example:
 * EAR_PLAYWRIGHT_MODULE=/path/to/playwright EAR_CHROME_EXECUTABLE=/path/to/chrome \
 *   node bench/monitorStartupValidation.mjs /tmp/ear-monitor-validation
 *
 * EAR_MONITOR_SOURCE_ROOT selects a complete source snapshot (default: this repo).
 * EAR_MONITOR_PLAYER_SOURCE optionally substitutes only playerService.ts; its
 * relative imports still resolve from the selected source tree. This permits a
 * red run against a saved pre-fix file without editing the working tree.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const repository = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const require = createRequire(path.join(repository, "package.json"));
const webpack = require("webpack");
const playwrightModule = process.env.EAR_PLAYWRIGHT_MODULE;
if (!playwrightModule) {
  throw new Error(
    "Set EAR_PLAYWRIGHT_MODULE to an existing Playwright installation.",
  );
}
const { chromium } = require(playwrightModule);
const output = process.argv[2]
  ? path.resolve(process.argv[2])
  : await fs.mkdtemp(path.join(os.tmpdir(), "ear-monitor-startup-"));
await fs.mkdir(output, { recursive: true });
const sourceRoot = path.resolve(
  process.env.EAR_MONITOR_SOURCE_ROOT || repository,
);
const serviceRoot = path.join(sourceRoot, "src/webview/services");
const playerFile = path.resolve(
  process.env.EAR_MONITOR_PLAYER_SOURCE ||
    path.join(serviceRoot, "playerService.ts"),
);
const playerSource = await fs.readFile(playerFile, "utf8");
// Only the external temporary build is rewritten; neither source tree is touched.
const selectedPlayer = path.join(output, "player-under-test.ts");
await fs.writeFile(
  selectedPlayer,
  playerSource.replace(
    /(from\s*["'])(\.[^"']+)(["'])/g,
    (_all, prefix, specifier, suffix) =>
      prefix +
      path.resolve(serviceRoot, specifier).replaceAll("\\", "/") +
      suffix,
  ),
);
const bundleDirectory = path.join(output, "bundle");
await new Promise((resolve, reject) => {
  const compiler = webpack({
    mode: "development",
    devtool: false,
    context: repository,
    entry: path.join(repository, "bench/monitorStartupValidationEntry.ts"),
    output: { path: bundleDirectory, filename: "monitor.js" },
    resolve: {
      extensions: [".ts", ".js"],
      modules: [path.join(repository, "node_modules")],
      alias: {
        "@monitor-player": selectedPlayer,
        "@monitor-player-settings": path.join(
          serviceRoot,
          "playerSettingsService.ts",
        ),
        "@monitor-analyze-settings": path.join(
          serviceRoot,
          "analyzeSettingsService.ts",
        ),
      },
      fallback: { path: require.resolve("path-browserify"), fs: false },
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: {
            loader: require.resolve("ts-loader"),
            options: {
              configFile: path.join(repository, "tsconfig.json"),
              transpileOnly: true,
              compilerOptions: { rootDir: "/" },
            },
          },
        },
      ],
    },
  });
  compiler.run((error, stats) =>
    compiler.close(() => {
      if (error || stats.hasErrors()) {
        reject(
          error || new Error(stats.toString({ all: false, errors: true })),
        );
      } else resolve();
    }),
  );
});
const captureProcessor = `
class MonitorCapture extends AudioWorkletProcessor {
  process(inputs, outputs) {
    const input = inputs[0] || [], output = outputs[0];
    for (let ch = 0; ch < output.length; ch++) {
      if (input[ch]) output[ch].set(input[ch]);
    }
    this.port.postMessage({ frame: currentFrame, channels: output.map(data => Array.from(data)) });
    return true;
  }
}
registerProcessor("monitor-capture", MonitorCapture);`;
const server = http.createServer(async (request, response) => {
  try {
    if (request.url === "/") {
      response.setHeader("Content-Type", "text/html");
      response.end('<!doctype html><script src="/monitor.js"></script>');
    } else if (request.url === "/capture.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(captureProcessor);
    } else if (request.url === "/monitor.js") {
      response.setHeader("Content-Type", "text/javascript");
      response.end(await fs.readFile(path.join(bundleDirectory, "monitor.js")));
    } else response.writeHead(404).end();
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    ...(process.env.EAR_CHROME_EXECUTABLE
      ? { executablePath: process.env.EAR_CHROME_EXECUTABLE }
      : { channel: "chrome" }),
    headless: true,
    args: ["--autoplay-policy=no-user-gesture-required", "--mute-audio"],
  });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.monitorStartupApi);
  const results = await page.evaluate(async () => {
    const api = window.monitorStartupApi;
    const matrices = {
      lr: [1, 0, 0, 1],
      m: [0.5, 0.5, 0.5, 0.5],
      s: [0.5, -0.5, -0.5, 0.5],
      l: [1, 1, 0, 0],
      r: [0, 0, 1, 1],
    };
    // Representative coverage, rather than a redundant Cartesian product.
    const cases = [
      [48000, 2, "same", "s", false],
      [48000, 2, "same", "s", true],
      [44100, 2, "same", "s", false],
      [44100, 2, "same", "s", true],
      [48000, 2, "inverse", "s", false],
      [44100, 2, "inverse", "m", true],
      [48000, 2, "left", "lr", true],
      [44100, 2, "left", "lr", true],
      [48000, 2, "same", "lr", false],
      [44100, 2, "same", "m", false],
      [48000, 2, "left", "l", false],
      [44100, 2, "left", "r", true],
      [48000, 1, "same", "s", false],
      [44100, 1, "same", "s", true],
      [48000, 1, "same", "m", true],
      [44100, 1, "same", "lr", true],
    ];
    const results = [];
    for (const engine of ["offline", "realtime"]) {
      for (const [sampleRate, channels, signal, mode, visible] of cases) {
        const frames = Math.round(sampleRate / 10);
        const context =
          engine === "offline"
            ? new OfflineAudioContext(2, frames, sampleRate)
            : new AudioContext({ sampleRate });
        let recorder, player, output, captureTimer;
        try {
          if (context.sampleRate !== sampleRate) {
            throw new Error(
              `Requested ${sampleRate} Hz, received ${context.sampleRate} Hz`,
            );
          }
          const destination = context.destination;
          if (engine === "realtime") {
            await context.suspend();
            await context.audioWorklet.addModule("/capture.js");
            recorder = new AudioWorkletNode(context, "monitor-capture", {
              channelCount: 2,
              channelCountMode: "explicit",
              outputChannelCount: [2],
            });
            const mute = context.createGain();
            mute.gain.value = 0;
            recorder.connect(mute).connect(destination);
          }
          const buffer = context.createBuffer(channels, frames, sampleRate);
          for (let i = 0; i < frames; i++) {
            const value =
              0.25 * Math.sin((2 * Math.PI * 1000 * i) / sampleRate);
            buffer.getChannelData(0)[i] = value;
            if (channels > 1)
              buffer.getChannelData(1)[i] =
                signal === "inverse" ? -value : signal === "left" ? 0 : value;
          }
          const settings = api.AnalyzeSettingsService.fromDefaultSetting(
            {
              hearingProtectionEnabled: false,
              showLevelMeter: false,
              showLiveAnalysis: visible,
            },
            buffer,
          );
          settings.liveMonitoringMode = mode;
          player = new api.PlayerService(
            context,
            buffer,
            api.PlayerSettingsService.fromDefaultSetting({}, buffer),
            settings,
          );
          // Intercept only the final destination connection. Source, analyser,
          // matrix, filters and their timing remain the actual product code.
          const connect = AudioNode.prototype.connect;
          AudioNode.prototype.connect = function (target, ...rest) {
            return connect.call(
              this,
              recorder && target === destination ? recorder : target,
              ...rest,
            );
          };
          try {
            player.play();
          } finally {
            AudioNode.prototype.connect = connect;
          }
          const startFrame = Math.round(context.currentTime * sampleRate);
          if (engine === "offline") {
            const rendered = await context.startRendering();
            output = [rendered.getChannelData(0), rendered.getChannelData(1)];
          } else {
            output = [new Float32Array(frames), new Float32Array(frames)];
            const captured = new Uint8Array(frames);
            await new Promise((resolve, reject) => {
              captureTimer = setTimeout(
                () => reject(new Error("Real-time capture timed out")),
                5000,
              );
              recorder.port.onmessage = ({ data }) => {
                for (let i = 0; i < data.channels[0].length; i++) {
                  const at = data.frame + i - startFrame;
                  if (at >= 0 && at < frames) {
                    if (captured[at]) {
                      reject(new Error(`Duplicate captured frame ${at}`));
                      return;
                    }
                    captured[at] = 1;
                    output[0][at] = data.channels[0][i];
                    output[1][at] = data.channels[1][i];
                  }
                }
                if (
                  data.frame + data.channels[0].length >=
                  startFrame + frames
                ) {
                  clearTimeout(captureTimer);
                  resolve();
                }
              };
              context.resume().catch(reject);
            });
            if (captured.some((value) => value !== 1))
              throw new Error("Missing captured PCM frames");
            await context.suspend();
          }
          let maximumError = 0,
            startupMaximumError = 0,
            firstErrorFrame = -1,
            lastErrorFrame = -1;
          const energy = [0, 0],
            firstSamples = output.map((data) => Array.from(data.slice(0, 16)));
          const [ll, lr, rl, rr] = matrices[mode];
          for (let i = 0; i < frames; i++) {
            const left = buffer.getChannelData(0)[i];
            const right = channels > 1 ? buffer.getChannelData(1)[i] : left;
            const expected = [ll * left + rl * right, lr * left + rr * right];
            for (let ch = 0; ch < 2; ch++) {
              const error = Math.abs(output[ch][i] - expected[ch]);
              maximumError = Math.max(maximumError, error);
              if (i < 128)
                startupMaximumError = Math.max(startupMaximumError, error);
              if (error > 1e-6 && firstErrorFrame < 0) firstErrorFrame = i;
              if (error > 1e-6) lastErrorFrame = i;
              energy[ch] += output[ch][i] ** 2;
            }
          }
          results.push({
            engine,
            sampleRate,
            channels,
            signal,
            mode,
            visible,
            frames,
            maximumError,
            startupMaximumError,
            firstErrorFrame,
            lastErrorFrame,
            rms: energy.map((value) => Math.sqrt(value / frames)),
            firstSamples,
            passed: Number.isFinite(maximumError) && maximumError <= 1e-6,
          });
        } finally {
          clearTimeout(captureTimer);
          if (recorder) recorder.port.onmessage = null;
          player?.dispose();
          if (engine === "realtime" && context.state !== "closed")
            await context.close();
        }
      }
    }
    return results;
  });
  const passed =
    results.every((result) => result.passed) && pageErrors.length === 0;
  const report = {
    passed,
    browser: await browser.version(),
    sourceRoot,
    playerFile,
    playerSha256: crypto
      .createHash("sha256")
      .update(playerSource)
      .digest("hex"),
    scope:
      "Actual PlayerService; real AudioContext + output-capture Worklet and OfflineAudioContext. Every frame, including the initial 128, is checked. Hardware output is muted; no subjective listening claim.",
    tolerance: 1e-6,
    cases: results.length,
    failures: results.filter((result) => !result.passed).length,
    pageErrors,
    results,
  };
  await fs.writeFile(
    path.join(output, "monitor-startup-results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify(
      {
        passed,
        cases: report.cases,
        failures: report.failures,
        report: path.join(output, "monitor-startup-results.json"),
      },
      null,
      2,
    ),
  );
  if (!passed) process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
