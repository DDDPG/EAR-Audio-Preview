# Audio alignment in file comparison

[Design article](blog/audio-alignment-dsp.en.md) · [中文技术文章](blog/audio-alignment-dsp.md) · [User guide](usage.md)

Open **EAR Audio: Compare Files**, load at least two files, then choose **Align** in the comparison toolbar.

1. Choose a reference and the file to move. The focused file is the initial reference.
2. Choose **Estimate**. The worker searches within ±2 seconds using at most the first 60 seconds. The files must have the same decoded sample rate; this feature does not resample them.
3. Review the sample/ms delay, polarity, and absolute correlation. Correlation is not a success probability. Ambiguous, weak, silent, or too-short results cannot be applied.
4. Optionally check **Also compensate inverted polarity**. This is off by default. The displayed signed gain and null depth describe the analysis excerpt; gain is measured, not applied.
5. Choose **Apply alignment**. Only the selected target changes. **Reset alignments** restores every still-loaded original adjusted by this tool.

## Scope and data behavior

Alignment is an integer, constant-delay transform of a session-local copy. Playback, waveforms, STFT, Live, Loudness/pitch analysis, and mix export all consume that copy through the existing comparison session. Analysis caches receive a new local audio revision, while host sequence requests retain the real file revision.

Moving earlier omits the target's leading samples from its session copy. Moving later adds leading silence and extends the copy to retain its remaining content. Left/right channels move together. Polarity compensation multiplies both channels by −1 only when explicitly selected. No loudness or least-squares gain is applied by this tool.

Original decoded samples are retained for reset. Source files are never overwritten by alignment; writing aligned audio still requires the existing explicit WAV export action. Closing/reopening the comparison discards session alignment. Reloading or removing a file discards its saved alignment instead of restoring obsolete audio.

Changing an input or closing the dialog cancels pending estimation. Estimation uses a dedicated instance of the existing CSP-safe analysis worker bundle. It transfers copies of at most 62 seconds per channel: 60 seconds for search plus the 2-second delay margin. The original AudioBuffer storage is never transferred or detached. Applying a shift copies the full target in cancellable chunks.

The operator supports mono/stereo input, accepts 8–192 kHz PCM, rejects nonfinite values in its supplied analysis PCM, and has a 100 ms minimum available duration. Fractional delay, clock drift, dynamic warping, and strong distortion are not covered. Energy-based channel selection, short-window representativeness, and early termination remain heuristics; rejection is preferable to an unsupported automatic shift.

## Implementation and validation

- Runtime: [audioAlignment.ts](../src/shared/audioAlignment.ts), [alignmentFft.ts](../src/shared/alignmentFft.ts).
- UI/lifecycle: [comparisonAlignment.ts](../src/webview/comparison/comparisonAlignment.ts), [alignmentClient.ts](../src/webview/comparison/alignmentClient.ts).
- Existing integration files: `comparisonApp.ts` and `analysisWorker.ts`; no new host IPC message, build entry, runtime dependency, or playback/export graph was required.
- Colocated tests cover delays, polarity, Side-only stereo, sparse/tail cases, invalid PCM lanes, request cancellation, buffer reset/reload, and host/local revision separation.
- The TS arithmetic port is compared with the final research snapshot (`operator.mjs` SHA-256 `64589229f83f940cdd8ede655ae81c4372891140cce7077775f321e3b2b7c0ed`). All 318 fixed cases match exact alignment and residual objects, including the stored ablation estimates. [Parity result](metrics/alignment/parity.json).
- Browser acceptance runs the actual production bundle, Blob worker, Web Audio playback, and two WAV exports. It verifies rejection, optional polarity correction, exact shifted/restored samples, file-update invalidation, mixed-rate rejection, and a narrow viewport. VS Code file/save dialogs are mocked in this automated browser run. A separate native VS Code extension-host check confirmed +523 samples, opt-in polarity correction, and a real save-dialog export whose 38,400 PCM bytes exactly match the browser result. [Native result](metrics/alignment/native.json). [Browser result](metrics/alignment/browser.json).

From the repository root:

```sh
npm test -- --maxWorkers=2 --workerIdleMemoryLimit=512MB
npx tsc --noEmit
npx webpack --mode production --devtool hidden-source-map

# The original local PCM must be available for the frozen real-audio cases.
node bench/alignmentParity.mjs doc/research/audio-alignment /tmp/alignment-parity.json

# Set this variable if Playwright is installed outside this repository.
EAR_PLAYWRIGHT_MODULE=/path/to/playwright node bench/alignmentBrowserAcceptance.mjs /tmp/alignment-acceptance
```

Runtime code and focused acceptance tools are integrated. The bilingual development articles are indexed in [doc/blog](blog/README.md). Full experimental history and ablation variants remain in the fixed research snapshot; see [research source access](blog/audio-alignment-research.md). Research tools and blog files are not bundled into the extension.

## 中文使用说明

在多文件比较页点击 **Align**，选择参考与目标文件，先 **Estimate** 查看延迟与极性，再决定是否 **Apply alignment**。不可靠结果无法应用；“补偿反相”默认关闭。操作仅影响当前会话中的副本，播放、分析与显式导出使用同一个副本；**Reset alignments** 恢复原始解码音频。原文件不会被改写。

当前只支持相同解码采样率下的整数固定延迟，默认范围 ±2 秒、分析前 60 秒。显示的相关度不是成功概率；拟合增益仅用于测量，不会自动改变播放增益。重新加载文件会丢弃旧对齐，避免把旧版本恢复到新文件上。
