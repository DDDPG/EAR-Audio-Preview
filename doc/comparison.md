# VS Code audio extension comparison

[简体中文](comparison.zh-CN.md) · [English README](../README.md) · [中文 README](../README.zh-CN.md)

Checked **2026-10-16**. Only VS Code audio extensions are compared. These are relevant to Cursor users, but this pass did not install and certify every extension in Cursor. EAR measurements below use the **v0.6.0 test build recorded on that date**; competitors are the published versions listed below.

EAR alignment is an opt-in same-rate integer-delay estimate with explicit apply/reset, not drift correction. Applying it changes the session buffers used by analysis and export; monitoring controls remain independent. [Scope and validation](audio-alignment.md).

## Workflow comparison

| Extension / version | Comparison workflow | Analysis / monitoring | Primary fit |
| --- | --- | --- | --- |
| **EAR 0.6.0 (recorded test build)** | Up to eight files; parallel playback; linked time/frequency STFT zoom | Live FFT/CQT overlays, stereo field and phase correlation; LUFS/F0/onset; AutoEq monitoring | Compare renders and investigate stereo / frequency / loudness differences |
| [audio-preview 2.6.0](https://marketplace.visualstudio.com/items?itemName=sukumo28.wav-preview) | Single-file waveform / spectrogram; drag zoom | In-editor playback and file information | Basic audio preview |
| [Audio Player 0.1.4](https://marketplace.visualstudio.com/items?itemName=huachao.audio-player) | Multiple waveforms with synchronized playback | Raw PCM settings; Chinese/English UI | Lightweight listening and waveform comparison |
| [WaveExplorer 0.1.4](https://marketplace.visualstudio.com/items?itemName=jojonki.wave-explorer) | Linked waveform / spectrogram within a file | Linear / mel STFT in a Worker; region looping | Waveform and mel inspection |
| [SpecView 0.2.2](https://marketplace.visualstudio.com/items?itemName=sunxingwei.specview) | Automatic file grouping; A/B lane switching; linked group zoom | Tar archives; JSON metadata; optional 527-class audio model | Batch review of model outputs |
| [audioscope 1.1.7](https://marketplace.visualstudio.com/items?itemName=YongsooIm.audioscope) | Two-file A/B alignment, gain matching, residual and spectral difference | LUFS/LRA/true peak; MFCC/scalogram/chroma; four export formats | Detailed pairwise difference analysis |
| [AudioLens 1.10.0](https://marketplace.visualstudio.com/items?itemName=simzhou.audiolens) | Per-file multi-channel tracks with mute / solo and gain / pan | Raw PCM, Kaldi Ark, headers, selection metrics and Remote SSH | Speech datasets and raw-signal debugging |

Cells summarize the versioned publisher READMEs, not every possible capability. A feature omitted from a description is **unverified**, rather than proven absent. Marketplace identifiers, immutable versioned README URLs and their SHA-256 hashes are saved in [catalog evidence](metrics/plugin-catalog.json). [Structured comparison data](metrics/plugin-comparison.json) keeps the wording and package snapshot together.

## Capabilities

The README highlights this subset of the six-extension survey: the original audio-preview, waveform-focused Audio Player and A/B-focused audioscope. The matrix compares exposed features of the pinned production packages. ✓ means available; — means the compared build has no exposed implementation of that feature.

| Capability | **EAR 0.6.0** | audio-preview 2.6.0 | Audio Player 0.1.4 | audioscope 1.1.7 |
| --- | :---: | :---: | :---: | :---: |
| Waveform + STFT spectrogram | ✓ | ✓ | Waveform only | ✓ |
| Files in one comparison | **8 · parallel** | Single file | Multiple | 2-file A/B |
| Linked STFT zoom across files | ✓ | — | — | ✓ |
| Multi-source live spectrum overlays | ✓ | — | — | — |
| Live FFT / CQT + peak hold | ✓ | — | — | — |
| Stereo goniometer | ✓ · 3 modes | — | — | — |
| Stereo correlation by frequency | ✓ | — | — | — |
| LUFS / LRA / true peak | ✓ | — | — | ✓ |
| F0 + onset timelines | ✓ | — | — | — |
| Live L/R & M/S RMS / peak meters | ✓ | — | — | — |
| L/R/M/S monitoring | ✓ | — | — | — |
| Five-band monitoring solo | ✓ | — | — | — |
| AutoEq headphone correction | ✓ | — | — | — |
| Selection → WAV export | ✓ | ✓ | — | ✓ |
| Shared-region RMS level matching | ✓ | — | — | ✓ |
| Same-rate residual RMS / peak | ✓ | — | — | ✓ |
| Headphone EQ in WAV exports | ✓ | — | — | — |
| Automatic time alignment | ✓ | — | — | ✓ |

Stereo frequency correlation is between a file's L/R channels; audioscope's A/B alignment correlation is a different measurement. Its selection-spectrum view is not marked as a live FFT/CQT analyzer. Audio Player's multi-file waveform view is retained; its publisher describes synced playback, while this table makes no shared-clock assertion. audioscope's shared A/B/difference analysis session and common spectrogram settings count as linked STFT navigation. The original audio-preview also exports selections to WAV.

Unsupported cells were checked against the shipped UI/analysis modes and playback routing, rather than inferred from README keyword absence. The evidence file retains package hashes, entry-point hashes, source locations and per-row rationale. EAR's monitoring/feature claims were checked against current source. [Matrix and audit evidence](metrics/capability-matrix.json).

## Where EAR has a defensible advantage

- **Eight files with one diagnostic layout.** Parallel playback and a linked STFT grid share time/frequency zoom; Live Spec overlays each source's spectrum, stereo field and frequency correlation. Against audioscope's documented two-file workflow this adds an eight-source view; EAR also supports RMS matching and same-rate residual measurements; EAR now also provides reversible same-rate integer-delay alignment; audioscope additionally provides residual audition/export.
- **Keep listening separate from original-signal analysis.** Active muted files still contribute analysis, using the aligned copy after applying Align. L/R/M/S, five-band solo and imported/AutoEq headphone correction act on monitoring; master volume is excluded from export, and headphone correction is opt-in. This gives render comparison a consistent listening path without changing measurements through listening controls.
- **Inspect frequency, stereo and dynamics together.** Live FFT/CQT, stereo correlation, offline LUFS/LRA/true peak and F0/onset timelines are available in one extension. audioscope also documents loudness; SpecView and Audio Player already document file comparison. Those individual capabilities are not claimed as EAR-exclusive.

EAR is capped at eight mono/stereo comparison sources and holds decoded PCM in memory. SpecView's batch/archive workflow, AudioLens's raw/Kaldi/multi-channel support and audioscope's residual/export options are meaningful alternatives, not missing checkmarks to hide. No "only", "fastest", "smallest" or audio-quality ranking is inferred from this survey.

## Repository benchmark suite

This comparison now follows the existing **bench/** suite. The **15 original cases**, seeded inputs, warmups, sample counts and gate thresholds are unchanged. [Exact suite](../bench/benchmark.ts) · [protocol and reproduction](../bench/plugins/README.md).

| Existing case | mean (ms) | p95 (ms) | ops/s | Share of 16.67 ms | Net heap KiB/op |
| --- | ---: | ---: | ---: | ---: | ---: |
| goertzelCqt.pazFrame4096 | 0.0925 | 0.0952 | 10,806 | 0.56% | 0.6 |
| quinticBSplineSmooth.300 | 0.0013 | 0.0025 | 796,533 | 0.01% | 0.8 |
| akimaResample.128to300 | 0.0060 | 0.0078 | 167,943 | 0.04% | 10.9 |
| liveBallistics.emaFrame300 | 0.0005 | 0.0006 | 1,822,257 | 0% | 0.7 |
| spectralPeakDisplay.frame300 | 0.0026 | 0.0032 | 378,128 | 0.02% | 10 |
| stereoPolarField.instant4096x64 | 0.0215 | 0.0363 | 46,414 | 0.13% | 46.2 |
| eqCanvasMath.curve300plus10band | 0.0768 | 0.0828 | 13,019 | 0.46% | 69.9 |
| phaseCorrelation.fft2048 | 0.0624 | 0.0984 | 16,013 | 0.37% | 69 |
| anim.fftFramePrep.1024to300 | 0.0628 | 0.0981 | 15,924 | 0.38% | 1.3 |
| pipeline.stftFrames.3s.w4096h1024 | 3.1938 | 5.7870 | 313 | 19.16% | 74.1 |
| pipeline.sequenceFeatures.3s.hop20ms | 0.8239 | 1.7069 | 1,214 | 4.94% | 96.3 |
| io.wavEncode.stereo5s48k | 2.6462 | 2.9569 | 378 | 15.88% | 88.1 |
| io.stftWireToSpectrogram.500x1024 | 0.5994 | 1.2740 | 1,668 | 3.6% | 843.6 |
| render.oouraSpectrogram.3s.w1024h80 | 24.5753 | 25.7648 | 41 | 147.45% | 4799.6 |
| render.spectrogramTexFlatten.1755x2048 | 2.5114 | 3.4190 | 398 | 15.07% | 19.1 |

These are round 2 of the three post-fix serial runs on Apple M5 Pro / macOS arm64 / Node 24.9.0, with exposed GC. Microsecond cases include harness overhead. The 16.67 ms ratio is a numerical reference; an offline whole-file operation is not required to finish every animation frame. Net heap deltas are approximate and GC-sensitive, not exact allocations or peak RAM. The two pipeline cases deliberately use **stub Essentia** to isolate framing/control overhead; texture flattening is CPU upload-buffer preparation, not a GPU draw. Those values must not be called full FFT/F0/rendering performance.

The historical locked baseline uses **Node 26.0.0**. Before this follow-up, the first run reported four gate violations and the serial repeat still reported B-spline and polar-bin failures. The immutable pre-review commit 06705d4 reproduced those two slower kernels under Node 24.9.0. These earlier results remain available: [first run](metrics/repository-bench.json), [repeat](metrics/repository-bench-repeat.json), [same-environment source baseline](metrics/repository-bench-06705d4.json), [original gate logs](metrics/repository-bench-context.json).

**Both failures are now fixed.** B-spline repeats boundary clamping only at the first/last two outputs; the interior keeps the same arithmetic order. Polar RMS accumulates squared magnitude directly instead of computing a scaled hypot/square root and immediately squaring it. Float32 sample squares fit in a JS double; angular mapping, Float32 accumulation and neighbor spreading are unchanged.

| Original case | Same-environment before | After: three serial means | Historical gate ceiling |
| --- | ---: | ---: | ---: |
| quinticBSplineSmooth.300 | 0.0042 ms | 0.0011 / 0.0013 / 0.0013 ms | 0.00193 ms |
| stereoPolarField.instant4096x64 | 0.0298 ms | 0.0217 / 0.0215 / 0.0235 ms | 0.02591 ms |

All **15 original cases ran in each round**, and all three runs passed the unchanged historical speed and bundle gates. No fixtures, warmups, sample counts, thresholds or baseline files changed. This is a real kernel optimization, not a claim that Node version alone explained the earlier failures. The numerical corpus matches the immutable source byte-for-byte for **132 B-spline inputs (66,384 outputs)** and **4,096 polar frames (158,887 outputs)**, including short arrays, silence, near-gate values, anti-phase and extreme Float32 scales. It preserves existing Float32-accumulator overflow behavior; it does not certify arbitrary signal accuracy. [Before](metrics/repository-bench-before-fix.json) · [round 1](metrics/repository-bench-postfix-1.json) · [round 2](metrics/repository-bench-postfix-2.json) · [round 3](metrics/repository-bench-postfix-3.json) · [causes and complete gate logs](metrics/benchmark-fixes.json) · [numerical corpus](metrics/live-kernel-validation.json).

**Pre-release correctness correction:** The timings and old-source byte-equivalence report above are historical measurements from before the polar-geometry fix. The release now aligns bin projection/lookup with deposition, folds negative-mid PCM and clamps endpoint interpolation. Those intentionally change the prior wrong display, so the frozen `liveKernelValidation.mjs` polar comparison is expected to reject the new geometry; its assertions and baseline remain unchanged. Current validation separately passes **373 geometry cases**, **132 byte-identical spline cases** and **4,096 byte-identical energy cases against the hypot reference under corrected geometry**. This is not a claim of output equality with the old geometry. [Current explicit contracts and byte checks](metrics/polar-geometry-validation.json).

The final pre-release run also passed **all 15 original speed/size gates** with the corrected geometry; the polar case measured 0.0192 ms. This is a regression gate, not an end-to-end performance or cross-plugin claim. [Final full run](metrics/prerelease-benchmark.json).

The maintained native-rate comparison DSP check was also rerun: **4,096 byte-identical frames** against 06705d4. Current throughput ratios were 1.01× unweighted STFT, 1.15× A-weighted STFT, 1.54× short-window STFT and 1.10× Live. These compare EAR implementations, not different plugins. [Current raw run](metrics/comparison-dsp-current.json).

## Original STFT case against audio-preview

The existing **render.oouraSpectrogram.3s.w1024h80** case is used directly: **seed 19, 3 s mono, 48 kHz, periodic Hann, FFT 1024, hop 80, 2 warmups, 10 samples**. The adapter exposes the original buildCases/runCase functions and changes only the AnalyzeService implementation for the original upstream **2.6.0**, pinned to [3edd1bc](https://github.com/sukumo28/vscode-audio-preview/blob/3edd1bc0761d026a2f24d96055ee7430365ba2aa/src/webview/services/analyzeService.ts). It does not rewrite the test body or input and does not label EAR-only DSP kernels as competing implementations.

| Existing case, two runs | Original mean / p95 | EAR mean / p95 | Throughput |
| --- | ---: | ---: | ---: |
| 1 | 31.49 / 46.26 ms | 24.55 / 27.52 ms | 1.28× |
| 2 | 30.05 / 36.43 ms | 24.92 / 29.65 ms | 1.21× |

Full endpoints are included. Of **921,600 output cells** (1,800 frames × 512 bins), **918,528 finite pairs match byte-for-byte**. The original source produces **3,072 nonfinite cells in the final six frames** because its tail bound admits the sample immediately after the buffer. EAR produces none. Therefore **the entire outputs are not byte-identical**, and these timing ratios are not offered as an identical-full-output accuracy claim. The earlier 1.15× interior-region experiment excluded these boundaries and remains supplementary evidence only. [Original-case raw results](metrics/repository-upstream-stft.json) · [adapter](../bench/plugins/repositoryUpstream.mjs) · [supplementary interior experiment](metrics/upstream-stft.json).

## Actual installed-plugin workflows

All **six competing pinned VSIX packages were downloaded, CRC-checked, installed and run** alongside the local EAR package, using **VS Code 1.111.0**. Each plugin gets a separate user profile; other competing plugins are disabled. Original custom editors, file IPC, decoders, Workers, audio graphs and rendering run unchanged. The controller only invokes real editor/UI controls. No user's VS Code/Cursor profile is altered.

The real PCM16 WAVs reuse the repository's seeded 3 s mono / 5 s stereo fixtures and add 60 s stereo scaling. Every source is 48 kHz. The webview viewport is **1392 × 886 CSS pixels, DPR 2** for all seven plugins. First open is recorded separately; the table uses **three close/reopen trials' median**, ending at native chart-ready state plus two RAFs. Playback uses the repository integration harness's **15-second** window, with a progressing clock and foreground visibility required.

| Extension | 3 s mono ready | 5 s stereo ready | 60 s stereo ready | Playback RAF p95 |
| --- | ---: | ---: | ---: | ---: |
| EAR 0.6.0 | 143 ms | 196 ms | 246 ms | 9.2 ms |
| audio-preview 2.6.0 | 596 ms | 1088 ms | 1603 ms | 9.2 ms |
| Audio Player 0.1.4 | 70 ms | 71 ms | 129 ms | 10.1 ms |
| WaveExplorer 0.1.4 | 128 ms | 132 ms | 870 ms | 16.4 ms |
| SpecView 0.2.2 | 111 ms | 162 ms | 227 ms | 9.2 ms |
| audioscope 1.1.7 | 138 ms | 129 ms | 181 ms | 9.2 ms |
| AudioLens 1.10.0 | 72 ms | 87 ms | 255 ms | 9.2 ms |

EAR's 60 s workflow is about **246 ms versus original audio-preview's 1,603 ms** in this run. **This is a native preview workflow comparison, not matched-FFT speed.** Default windows, hops, downmixing, lazy computation and canvas dimensions differ. Audio Player displays only waveforms; WaveExplorer defaults to mel; EAR and the original explicitly enter STFT/analyze through their native controls. The stronger matched-test evidence is the existing-case table above. Faster previews by other plugins are retained in this table.

RAF p95 measures presentation cadence, not audio glitch freedom, audio-engine accuracy or meter freshness. The raw report also includes long tasks, renderer TaskDuration and post-GC V8 heap/backing storage; these exclude Worker/host CPU and are not whole-editor peak RAM. The first SpecView capture lost foreground visibility and was excluded from cadence comparison; a repeat was valid. audioscope initially timed out at the readiness condition, then completed unchanged conditions on repeat. Both earlier attempts remain recorded. EAR's rapid close/reopen stress also produced a **Webview is disposed** notification from delayed host replies; this run is not presented as an error-free lifecycle test. [Full trials, states, first opens and attempts](metrics/editor-plugins.json).

## Rapid reopen lifecycle fix

The earlier screenshot/notification failure is retained above. A controlled repeat with the old package reproduces **Webview is disposed**; the fixed production VSIX records **zero workbench notifications** under the same stress: **10 closes after preview-ready + 20 closes 25 ms after opening + a final reopen and 25 s wait**. This exceeds the AutoEq host's 20 s deadline. The final preview is ready, with no captured final-webview exceptions. Its three ordinary preview medians are **145 / 188 / 246 ms**, and 15 s foreground playback still has **9.2 ms RAF p95** with an advancing clock.

The cause is late async handlers accessing the disposed panel's webview getter; their error replies repeat that access and trigger the global notification. Replies and errors now check the original webview's lifetime, CONFIG avoids late URI conversion, rejected sends are observed, and document watchers/message listeners are disposed. A reopened panel cannot receive the old panel's replies. **13 host regression tests pass**, covering delayed success/failure, CONFIG, cancellation, STFT/features/preset completion and active transport errors. The original 8-test subset had seven failures before the fix. These tests complement the real-host run; this finite stress is not proof against every possible race. [Old/fixed package hashes, full states, notification captures and test logs](metrics/editor-lifecycle-fix.json).

## Downloaded package sizes

| Extension | Actual VSIX | Uncompressed archive entries | Files |
| --- | ---: | ---: | ---: |
| EAR 0.6.0 | 3.44 MiB | 9.86 MiB | 21 |
| audio-preview 2.6.0 | 0.75 MiB | 1.78 MiB | 15 |
| Audio Player 0.1.4 | 0.81 MiB | 3.17 MiB | 24 |
| WaveExplorer 0.1.4 | 3.21 MiB | 3.41 MiB | 15 |
| SpecView 0.2.2 | 0.11 MiB | 0.25 MiB | 10 |
| audioscope 1.1.7 | 4.56 MiB | 10.74 MiB | 65 |
| AudioLens 1.10.0 | 0.24 MiB | 0.71 MiB | 28 |

All archive bytes are now measured from complete downloaded files, with **every ZIP entry CRC checked and SHA-256 retained**, rather than HEAD-only estimates. EAR package figures describe the historical v0.6.0 test build saved with these results, not a newly measured release archive; the others are the pinned published packages. 1 MiB = 1,048,576 bytes. Uncompressed entry size includes everything in the archive, not editor RSS or optional downloads. SpecView's optional first-use model is separate. Several plugins are smaller than EAR; no smallest-package claim is made. [Archive hashes and code/WASM gzip measurements](metrics/downloaded-packages-postfix.json) · [publisher/version snapshots](metrics/plugin-catalog.json).

## Reproduce

```sh
npm run bench -- --save /tmp/repository-bench.json
npm run bench:size -- --save /tmp/repository-bench.json
node bench/compare.mjs bench/baseline.json /tmp/repository-bench.json
node --expose-gc bench/plugins/repositoryUpstream.mjs --save /tmp/repository-upstream.json
node bench/plugins/prepare.mjs /tmp/ear-plugin-benchmark
node bench/plugins/editorBenchmark.mjs /tmp/ear-plugin-benchmark
node bench/plugins/packageAudit.mjs /tmp/ear-plugin-benchmark --save /tmp/packages.json
```

[Full setup, pinned-source preparation and metric boundaries](../bench/plugins/README.md). Raw screenshots/logs stay in the external benchmark directory; their hashes and all numeric trials are saved here. The original benchmark and locked baseline remain unchanged. Older tmp_files rendering proxies and extrapolated timings are not used for these results. Cursor was not independently benchmarked; these measurements are from the named VS Code host.

## Eight-file capacity and comparison tools

Eight complete audio files played concurrently: the production browser build measured **16.8 ms** P95 animation-frame spacing and **18.5 ms** P95 live-presentation spacing. CQT and repeated interactions were checked separately. Native VS Code passed eight audible sources and six rapid close/reopen cycles without disposal notifications. The fixture loads four real 107–206 s MP3 recordings twice each.

Shared-region RMS matching attenuates only and affects listening and export. Equal-rate residual measurements report RMS, peak and relative energy. Optional headphone EQ export was checked with real OfflineAudioContext rendering. Alignment is now available in the comparison toolbar: same-rate constant integer delay, ±2 seconds within the first 60 seconds, explicit apply/reset and optional polarity compensation. [Limits](audio-alignment.md) · [Design article](blog/audio-alignment-dsp.en.md).

[Full verification record](metrics/v060-capacity-and-tools.json)
