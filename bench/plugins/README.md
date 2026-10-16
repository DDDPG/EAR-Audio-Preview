# Actual editor-plugin benchmark

This extends the existing `bench/benchmark.ts`, `bench/bundleSize.mjs`, `bench/compare.mjs` and the 15-second sampler in `bench/comparisonBrowserHarness.html`. It does not replace their fixtures, cases, warmups, sample counts or regression thresholds.

## Layers

1. **Repository regression suite:** run `npm run bench`, `npm run bench:size` and `npm run bench:compare`. Keep failures against the historical locked baseline. Its environment is Node 26; repeat the immutable pre-review commit on the same current Node to distinguish existing environment differences from this patch. Do not overwrite `bench/baseline.json`.
2. **Original matched STFT case:** `repositoryUpstream.mjs` exposes the existing benchmark's `buildCases` and `runCase`, suppresses only its automatic full-suite dispatch, and selects the existing `render.oouraSpectrogram.3s.w1024h80` case. It uses the same seed 19, 48 kHz mono 3 s data, periodic Hann / FFT1024 / hop80, two warmups and ten samples. Only `AnalyzeService` is replaced by the SHA-256-verified original upstream 2.6.0 implementation. Other EAR-only kernels are not relabelled as competitor tests. Full output comparison includes endpoint frames and reports nonfinite upstream tail values rather than silently excluding them.
3. **Actual installed VSIX workflow:** open real WAVs through the original custom editor, file IPC, decoder and production UI. Each plugin runs in its own VS Code user profile with other competing extensions disabled. First activation/open is separate; close/recreate the webview three times per workload and record native preview readiness plus two presentation frames. Then play the 60 s fixture for 15 s and collect RAF intervals, renderer TaskDuration, long tasks and post-GC renderer heap/backing storage. A native control must show clock progress; visibility changes invalidate foreground comparisons.
4. **Actual downloaded packages:** compare archive bytes, uncompressed ZIP entries and shipped JS/WASM code. Verify all ZIP entry CRCs and retain archive SHA-256. These are transfer/installed-archive sizes, not whole-editor or peak process RAM.

The 3 s mono and 5 s stereo real files use the repository's mulberry32 seeds/scales and PCM16 quantization. The additional 60 s stereo file tests size scaling and sustains the original integration harness's 15 s playback window. These synthetic _benchmark_ fixtures are unrelated to the separately maintained real-audio README GIFs.

## Reproduce

Prerequisites: Node 22+ with native WebSocket, curl, Python 3, installed VS Code, and a local current EAR VSIX. No new project dependency is needed. The defaults point to macOS VS Code. Supply `VSCODE_EXECUTABLE`, `VSCODE_NODE_EXECUTABLE` and `VSCODE_CLI_JS` to use another installation.

```sh
npm run bench -- --save /tmp/repository-bench.json
npm run bench:size -- --save /tmp/repository-bench.json
node bench/compare.mjs bench/baseline.json /tmp/repository-bench.json

# Run upstreamStft.mjs once if its pinned upstream source cache is absent.
node --expose-gc bench/upstreamStft.mjs --save /tmp/additional-upstream-case.json
node --expose-gc bench/plugins/repositoryUpstream.mjs --save /tmp/repository-upstream.json

# This installs only into a new disposable directory, not the user's editor profile.
node bench/plugins/prepare.mjs /tmp/ear-plugin-benchmark
node bench/plugins/editorBenchmark.mjs /tmp/ear-plugin-benchmark
node bench/plugins/packageAudit.mjs /tmp/ear-plugin-benchmark --save /tmp/downloaded-packages.json

# Numerical regression of the optimized live kernels against immutable 06705d4.
node bench/liveKernelValidation.mjs --save /tmp/live-kernel-validation.json

# Optional lifecycle stress, after the original native timing window.
EAR_BENCH_LIFECYCLE=1 EAR_BENCH_OUTPUT_DIR=/tmp/ear-lifecycle-results EAR_BENCH_PROFILE_SUFFIX=-lifecycle node bench/plugins/editorBenchmark.mjs /tmp/ear-plugin-benchmark ear
```

The editor driver needs local ports 9446/9477 free. It launches actual editor windows; keep the test window visible while its 15-second playback sampler runs. Only tracked child process groups started by the harness are terminated. System output is muted only for those test editor processes. Existing VS Code/Cursor profiles and installed plugins are not modified.

The development-only controller listens on localhost and requires a random per-run bearer token. It invokes the real `vscode.openWith` and close commands; it does not supply fake audio/analysis messages. `cdp.mjs` attaches to Electron's separate webview target and its default `active-frame` context. Readiness adapters inspect production DOM state and invoke real UI controls where analysis is optional. The original audio-preview's Analyze button and EAR's STFT tab are selected explicitly. No production source in any installed extension is patched.

## Interpretation

The existing `pipeline.stftFrames` and `pipeline.sequenceFeatures` cases intentionally use `makeStubEssentia`: they measure framing/control/array overhead, not real WASM FFT or pitch-detection runtime. `render.spectrogramTexFlatten` measures CPU texture-buffer preparation, not a complete GPU draw. The actual installed-plugin workflow measurements provide the separate decoding/rendering/playback evidence.

Native preview defaults, FFT sizes, hop, number of analyzed channels, canvas dimensions and analysis types differ. WaveExplorer defaults to mel; Audio Player displays a waveform rather than a spectrogram; some plugins decimate waveform peaks or allocate analysis lazily. **Workflow timings are not equal-resolution FFT speed rankings.** Retain the recorded viewport, actual controls, canvas sizes, first-open data and all trials with any figure.

RAF cadence describes how often the visible renderer can present during playback. It does not certify audio glitch freedom, live-meter freshness or GPU cost. Renderer TaskDuration excludes Workers and extension-host CPU. Runtime heap/backing storage after GC is the inspected renderer isolate, not peak memory or total editor RSS. The repository's `allocKbPerOp` is a noisy net heap delta per call, not a precise allocation counter.

Raw screenshots/logs/profile state stay in the external work directory. Only measured JSON and textual reports are maintained under `doc/metrics`; the entire `bench/` tree is excluded from VSIX.
