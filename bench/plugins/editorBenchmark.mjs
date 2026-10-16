/** Actual installed VSIX workflows in an isolated VS Code profile per plugin.
 * Extends the repository benchmark's fixture sizes and 15-second RAF sampling.
 * Preview timings retain each plugin's native analysis/render settings.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { spawn, execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { randomBytes, createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import CDP from "./cdp.mjs";
const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const base = path.resolve(process.argv[2] || "");
if (!process.argv[2])
  throw new Error("Supply the external installed-VSIX work directory");
const app =
  process.env.VSCODE_EXECUTABLE ||
  "/Applications/Visual Studio Code.app/Contents/MacOS/Electron";
const catalog = JSON.parse(
  await fs.readFile(path.join(root, "doc/metrics/plugin-catalog.json"), "utf8"),
);
const entries = [
  {
    key: "ear",
    id: "Eps-Acoustic-Revolution-Lab.ear-audio-preview",
    version: "0.6.0",
    view: "earAudioPreview.audioPreview",
  },
  ...(await Promise.all(
    catalog.entries.map(async (e) => {
      const pkg = JSON.parse(
        await fs.readFile(
          path.join(
            base,
            "unpacked",
            e.id + "-" + e.version,
            "extension/package.json",
          ),
          "utf8",
        ),
      );
      return {
        key: e.id,
        id: e.id,
        version: e.version,
        view: pkg.contributes.customEditors[0].viewType,
      };
    }),
  )),
];
const selected = process.argv.slice(3);
const fixtures = JSON.parse(
  await fs.readFile(path.join(base, "fixtures/manifest.json"), "utf8"),
);
const outdir = process.env.EAR_BENCH_OUTPUT_DIR
  ? path.resolve(process.env.EAR_BENCH_OUTPUT_DIR)
  : path.join(base, "editor-results");
const lifecycle = process.env.EAR_BENCH_LIFECYCLE === "1";
await fs.mkdir(outdir, { recursive: true });
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(fn, timeout = 30000) {
  const end = performance.now() + timeout;
  let error;
  while (performance.now() < end) {
    try {
      const x = await fn();
      if (x) return x;
    } catch (e) {
      error = e;
    }
    await pause(50);
  }
  throw error || new Error("Readiness timeout");
}
const token = randomBytes(24).toString("hex");
async function post(route, data = {}) {
  const r = await fetch("http://127.0.0.1:9477" + route, {
    method: "POST",
    headers: { Authorization: "Bearer " + token },
    body: JSON.stringify(data),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(text);
  return JSON.parse(text);
}
const targets = () =>
  fetch("http://127.0.0.1:9446/json/list").then((r) => r.json());
function prepare(key) {
  if (key === "ear")
    return `if(document.querySelector('#settingsFab:not([disabled])')){document.querySelector('.js-tourSkip')?.click();if(document.querySelector('#stftGraphMount')?.hidden)document.querySelector('#tabStft')?.click();}`;
  if (key === "sukumo28.wav-preview")
    return `if(document.querySelector('.playButton')&&document.body.innerText.includes('duration')&&!window.__benchAnalyzed){window.__benchAnalyzed=true;document.querySelector('.analyzeButton')?.click();}`;
  return "";
}
function ready(key) {
  if (key === "ear")
    return `!!document.querySelector('#settingsFab:not([disabled])')&&!!document.querySelector('#stftGraphMount .mainCanvas')&&!document.querySelector('#stftGraphMount').hidden`;
  if (key === "sukumo28.wav-preview")
    return `!!document.querySelector('.mainCanvas')&&[...document.querySelectorAll('.mainCanvas')].some(c=>c.offsetWidth>0)&&document.body.innerText.includes('duration')`;
  if (key === "huachao.audio-player")
    return `!!document.querySelector('button.play')&&!document.querySelector('button.play').disabled&&document.body.innerText.includes('0:')&&!!document.querySelector('.wave-grid')`;
  if (key === "jojonki.wave-explorer")
    return `!!document.querySelector('#spectrogram-canvas')&&document.querySelector('#spectrogram-canvas').width>10&&!document.querySelector('#status-bar')?.textContent.trim()&&document.body.innerText.includes('Sample Rate')`;
  if (key === "sunxingwei.specview")
    return `!!document.querySelector('.spec-wrapper canvas')&&document.querySelector('.spec-wrapper canvas').width>10&&document.body.innerText.includes('kHz')&&!/Decoding|Loading|Computing/.test(document.body.innerText)`;
  if (key === "YongsooIm.audioscope")
    return `!!document.querySelector('#play-toggle:not([disabled])')&&document.querySelector('#waveform-loading')?.hidden===true&&document.querySelector('#spectrogram-loading')?.hidden===true&&document.querySelector('#spectrogram')?.width>10`;
  if (key === "simzhou.audiolens")
    return `!!document.querySelector('.trackSpectrogram')&&document.querySelector('.trackSpectrogram').width>10&&document.querySelector('#status')?.hidden===true&&!document.querySelector('#play').disabled`;
  throw new Error("Missing readiness adapter");
}
function play(key) {
  return key === "ear"
    ? `document.querySelector('.js-transportExpand').click();document.querySelector('.js-transportPanelPlay').click();document.querySelector('.js-transportClose').click();`
    : `document.querySelector(${JSON.stringify({ "sukumo28.wav-preview": ".playButton", "huachao.audio-player": "button.play", "jojonki.wave-explorer": ".play-btn", "sunxingwei.specview": "#btn-play", "YongsooIm.audioscope": "#play-toggle", "simzhou.audiolens": "#play" }[key])}).click();`;
}
const snapshot = `({text:document.body.innerText.slice(0,5000),visible:document.visibilityState,viewport:[innerWidth,innerHeight,devicePixelRatio],progress:[...document.querySelectorAll('input[type=range],.progressFill,.playhead,.waveform-progress,.progress')].map(e=>({id:e.id,cls:e.className,value:e.value,transform:e.style.transform,left:e.style.left,width:e.style.width})),media:[...document.querySelectorAll('audio')].map(e=>({currentTime:e.currentTime,paused:e.paused,ended:e.ended})),canvases:[...document.querySelectorAll('canvas')].filter(c=>c.offsetWidth>0).map(c=>({id:c.id,cls:c.className,width:c.width,height:c.height})),settings:[...document.querySelectorAll('input,select')].map(e=>({id:e.id,cls:e.className,label:e.getAttribute('aria-label'),value:e.value}))})`;
const results = [];
for (const entry of entries) {
  if (selected.length && !selected.includes(entry.key)) continue;
  console.log("Benchmarking " + entry.id);
  const profile = path.join(base, "profiles", "measured-" + entry.key + (process.env.EAR_BENCH_PROFILE_SUFFIX || ""));
  await fs.mkdir(path.join(profile, "User"), { recursive: true });
  await fs.writeFile(
    path.join(profile, "User/settings.json"),
    JSON.stringify({
      "workbench.startupEditor": "none",
      "security.workspace.trust.enabled": false,
      "telemetry.telemetryLevel": "off",
      "update.mode": "none",
      "workbench.enableExperiments": false,
      "chat.disableAIFeatures": true,
      "window.zoomLevel": 0,
      "window.restoreWindows": "none",
      "extensions.autoUpdate": false,
      "extensions.autoCheckUpdates": false,
      "workbench.colorTheme": "Default Dark Modern",
      "EarAudioPreview.autoAnalyze": true,
      "WavPreview.autoAnalyze": true,
    }),
  );
  const args = [
    "--user-data-dir=" + profile,
    "--extensions-dir=" + path.join(base, "extensions"),
    "--extensionDevelopmentPath=" + path.join(root, "bench/plugins/controller"),
    "--remote-debugging-port=9446",
    "--disable-workspace-trust",
    "--skip-welcome",
    "--skip-release-notes",
    "--mute-audio",
    "--new-window",
    ...entries
      .filter((x) => x.id !== entry.id)
      .map((x) => "--disable-extension=" + x.id),
    path.join(base, "fixtures"),
  ];
  const log = await fs.open(path.join(outdir, entry.key + ".log"), "w");
  const child = spawn(app, args, {
    stdio: ["ignore", log.fd, log.fd],
    detached: true,
    env: { ...process.env, EAR_BENCH_TOKEN: token },
  });
  let outer;
  let debugContext;
  const row = { ...entry, loads: [] };
  try {
    const editor = await waitFor(() => post("/status"));
    row.editorVersion = editor.vscode;
    const main = await waitFor(async () =>
      (await targets()).find((t) => t.type === "page"),
    );
    outer = await CDP.connect(main.webSocketDebuggerUrl);
    await outer.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await post("/command", { command: "workbench.action.closeSidebar" });
    await post("/command", { command: "workbench.action.closeAuxiliaryBar" });
    await pause(1000);
    async function open(spec) {
      await post("/close");
      await pause(150);
      const start = performance.now();
      const host = await post("/open", {
        file: path.join(base, "fixtures", spec.name),
        viewType: entry.view,
      });
      const target = await waitFor(async () =>
        (await targets()).find(
          (t) =>
            t.type === "iframe" &&
            t.url.toLowerCase().includes(entry.id.toLowerCase()),
        ),
      );
      const c = await CDP.connect(target.webSocketDebuggerUrl);
      await c.send("Runtime.enable");
      const context = await waitFor(async () => {
        const tree = await c.send("Page.getFrameTree");
        const inner = tree.frameTree.childFrames?.[0]?.frame.id;
        return c.events.find(
          (e) =>
            e.method === "Runtime.executionContextCreated" &&
            e.params.context.auxData?.frameId === inner &&
            e.params.context.auxData?.isDefault,
        )?.params.context.id;
      });
      debugContext = { c, context };
      await waitFor(
        async () =>
          c.evaluate(
            `(()=>{${prepare(entry.key)};return ${ready(entry.key)}})()`,
            context,
          ),
        60000,
      );
      // Include two actual presentation frames after the native ready condition.
      await c.evaluate(
        "new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))",
        context,
      );
      const elapsed = performance.now() - start;
      const state = await c.evaluate(snapshot, context);
      return {
        c,
        context,
        load: { file: spec.name, readyMs: elapsed, ...host, state },
      };
    }
    const first = await open(fixtures.specs[0]);
    row.firstOpen = first.load;
    first.c.close();
    for (const spec of fixtures.specs) {
      const trials = [];
      for (let i = 0; i < 3; i++) {
        const opened = await open(spec);
        trials.push(opened.load);
        opened.c.close();
      }
      row.loads.push({
        file: spec.name,
        trialCount: 3,
        trials,
        medianReadyMs: [...trials.map((x) => x.readyMs)].sort(
          (a, b) => a - b,
        )[1],
        meanReadyMs: trials.reduce((s, x) => s + x.readyMs, 0) / 3,
      });
      console.log(
        entry.key +
          " " +
          spec.name +
          ": " +
          row.loads.at(-1).medianReadyMs.toFixed(1) +
          " ms median preview-ready",
      );
    }
    const active = await open(fixtures.specs.at(-1));
    const c = active.c,
      context = active.context;
    await outer.send("Page.bringToFront");
    await c.send("Performance.enable");
    await c.evaluate(play(entry.key), context);
    await pause(500);
    const before = await c.evaluate(snapshot, context);
    await c.send("HeapProfiler.collectGarbage");
    const memoryBefore = await c.send("Runtime.getHeapUsage");
    const metricsBefore = await c.send("Performance.getMetrics");
    const intervals = await c.evaluate(
      `new Promise(resolve=>{const frames=[],tasks=[],visibility=[];let previous=performance.now(),active=true;const start=previous;const vis=()=>visibility.push({timeMs:performance.now()-start,state:document.visibilityState});document.addEventListener('visibilitychange',vis);const observer=new PerformanceObserver(list=>{for(const e of list.getEntries())tasks.push(e.duration)});observer.observe({entryTypes:['longtask']});const tick=t=>{if(!active)return;frames.push(t-previous);previous=t;requestAnimationFrame(tick)};requestAnimationFrame(tick);setTimeout(()=>{active=false;observer.disconnect();document.removeEventListener('visibilitychange',vis);const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return{count:values.length,meanMs:values.reduce((a,b)=>a+b,0)/values.length,medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:Math.max(...values)}};resolve({elapsedMs:performance.now()-start,animationFrames:stats(frames.slice(1)),longTasks:{count:tasks.length,totalMs:tasks.reduce((a,b)=>a+b,0),maxMs:tasks.length?Math.max(...tasks):0},visibilityChanges:visibility,finalVisibility:document.visibilityState})},15000)})`,
      context,
    );
    const metricsAfter = await c.send("Performance.getMetrics");
    await c.send("HeapProfiler.collectGarbage");
    const memoryAfter = await c.send("Runtime.getHeapUsage");
    const after = await c.evaluate(snapshot, context);
    const a = Object.fromEntries(
        metricsBefore.metrics.map((x) => [x.name, x.value]),
      ),
      b = Object.fromEntries(
        metricsAfter.metrics.map((x) => [x.name, x.value]),
      );
    row.playback = {
      durationRequestedMs: 15000,
      before,
      after,
      ...intervals,
      memoryBefore,
      memoryAfter,
      rendererTaskDurationMs: (b.TaskDuration - a.TaskDuration) * 1000,
      rendererScriptDurationMs: (b.ScriptDuration - a.ScriptDuration) * 1000,
      validVisible:
        before.visible === "visible" &&
        after.visible === "visible" &&
        intervals.visibilityChanges.every((x) => x.state === "visible"),
      clockEvidenceChanged:
        JSON.stringify(before.progress) !== JSON.stringify(after.progress) ||
        JSON.stringify(before.media) !== JSON.stringify(after.media) ||
        before.text !== after.text,
    };
    if (lifecycle) {
      // Observe actual workbench notifications, including transient toasts.
      // This runs AFTER the unmodified playback timing window.
      await outer.evaluate(`(()=>{window.__earBenchNotices=[];const seen=new Set();const collect=()=>{for(const e of document.querySelectorAll('.notification-list-item')){const text=e.innerText;if(text&&!seen.has(text)){seen.add(text);window.__earBenchNotices.push({at:Date.now(),text});}}};collect();window.__earBenchNoticeObserver=new MutationObserver(collect);window.__earBenchNoticeObserver.observe(document.body,{subtree:true,childList:true,characterData:true});})()`);
      const stressStart = performance.now();
      for (let i = 0; i < 10; i++) {
        const opened = await open(fixtures.specs[i % fixtures.specs.length]);
        opened.c.close();
        await post("/close");
      }
      for (let i = 0; i < 20; i++) {
        await post("/open", { file: path.join(base, "fixtures", fixtures.specs[i % fixtures.specs.length].name), viewType: entry.view });
        await pause(25);
        await post("/close");
      }
      const final = await open(fixtures.specs.at(-1));
      // Longer than AutoEq's total 20 s deadline; old replies can now settle.
      await pause(25000);
      row.lifecycle = {
        completedPreviewCloses: 10,
        initializingPreviewCloses: 20,
        initializingCloseDelayMs: 25,
        settleMs: 25000,
        elapsedMs: performance.now() - stressStart,
        notifications: await outer.evaluate("window.__earBenchNotices"),
        finalReady: await final.c.evaluate(ready(entry.key), final.context),
        finalState: await final.c.evaluate(snapshot, final.context),
        exceptionEvents: final.c.events.filter(e => e.method === "Runtime.exceptionThrown"),
      };
      await outer.evaluate("window.__earBenchNoticeObserver.disconnect()");
      final.c.close();
      console.log(entry.key + " lifecycle: " + JSON.stringify({ ready: row.lifecycle.finalReady, notifications: row.lifecycle.notifications }));
    }
    const shot = await outer.send("Page.captureScreenshot", { format: "png" });
    const screenshot = Buffer.from(shot.data, "base64");
    await fs.writeFile(path.join(outdir, entry.key + ".png"), screenshot);
    row.screenshotSha256 = createHash("sha256")
      .update(screenshot)
      .digest("hex");
    row.runtimeStatus = await post("/status");
    c.close();
    row.status = "completed";
    console.log(
      entry.key +
        " playback: " +
        row.playback.animationFrames.count +
        " frames, p95 " +
        row.playback.animationFrames.p95Ms +
        " ms; visible " +
        row.playback.validVisible +
        ", clock " +
        row.playback.clockEvidenceChanged,
    );
  } catch (error) {
    if (debugContext) {
      row.failureState = await debugContext.c
        .evaluate(snapshot, debugContext.context)
        .catch((e) => ({ error: String(e) }));
      row.exceptionEvents = debugContext.c.events.filter(
        (e) => e.method === "Runtime.exceptionThrown",
      );
      debugContext.c.close();
    }
    if (outer) {
      const shot = await outer
        .send("Page.captureScreenshot", { format: "png" })
        .catch(() => null);
      if (shot)
        await fs.writeFile(
          path.join(outdir, entry.key + "-failure.png"),
          Buffer.from(shot.data, "base64"),
        );
    }
    row.status = "failed";
    row.error = String(error);
    console.log("FAILED " + entry.id + ": " + error);
  } finally {
    outer?.close();
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {}
    await pause(500);
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
    await pause(500);
    await log.close();
  }
  results.push(row);
  await fs.writeFile(
    path.join(outdir, entry.key + ".json"),
    JSON.stringify(row, null, 2) + "\n",
  );
}
const report = {
  date: "2026-10-16",
  environment: {
    node: process.version,
    cpu: os.cpus()[0].model,
    platform: process.platform,
    app,
  },
  sourceBenchmark: {
    path: "bench/benchmark.ts",
    sha256: createHash("sha256")
      .update(await fs.readFile(path.join(root, "bench/benchmark.ts")))
      .digest("hex"),
    fixtures,
    playbackWindowMs: 15000,
    source: "bench/comparisonBrowserHarness.html",
  },
  method:
    "Actual installed pinned VSIX packages; separate fresh VS Code profiles with other competing plugins disabled; unchanged production code, original file IPC and codecs. First open separate; each warm workload closes/recreates its webview, three trials. Ready requires native metadata and visible chart state plus two RAFs. EAR/STFT and upstream Analyze are selected through their real UI. Default analysis/render settings differ across plugins; these are workflow timings, not equal-FFT rankings. Audio output muted only in the test process.",
  memoryBoundary:
    "V8 Runtime.getHeapUsage after GC for webview renderer isolate; includes its retained buffers, not whole-editor peak RAM. TaskDuration excludes Worker/host processes. Browser/native cache is not cold-reset between files.",
  results,
};
await fs.writeFile(
  path.join(outdir, "editor-benchmark.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log("Saved " + path.join(outdir, "editor-benchmark.json"));
