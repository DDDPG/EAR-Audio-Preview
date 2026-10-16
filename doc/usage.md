# User guide

[English overview](../README.md) · [中文概览](../README.zh-CN.md)

## Open audio

Open WAV, MP3, AAC, OGG, FLAC, OPUS, M4A or SPH in VS Code. If a different editor opens, use **Reopen Editor With… → Audio Preview**. Local decoders handle MP3, FLAC, Ogg Vorbis/Opus, AAC-LC in ADTS or M4A, and uncompressed signed PCM in NIST SPHERE. Other AAC profiles and M4A codecs still depend on browser support; compressed SPHERE variants are not supported. No external conversion tool is required for the locally supported formats.

Optional editor associations:

```jsonc
"workbench.editorAssociations": {
  "*.wav": "earAudioPreview.audioPreview",
  "*.mp3": "earAudioPreview.audioPreview",
  "*.flac": "earAudioPreview.audioPreview"
}
```

Older upstream associations use `wavPreview.audioPreview`; replace them if migrating. Current settings use the `EarAudioPreview.*` namespace.

## Compare files

Select up to eight audio files in Explorer, then choose **EAR Audio: Compare Files**. The comparison page's `+` adds files. The single-file editor's title command adds one file to the most recent comparison. Comparison accepts nonempty mono/stereo audio.

Each track has a stable color and four independent actions:

- **Focus:** click the name to bring its waveform into the overview.
- **Active/bypass:** the color lamp controls participation in analysis, playback and export.
- **Mute:** the speaker controls playback and export; an active muted track stays in analysis.
- **Remove:** the cross removes the track from this comparison, without deleting the source file.

Hover a track banner to reveal its action buttons. When the source changes externally, a reload badge appears. Reload is manual and uses a new audio revision; removal cancels an in-progress read. A different/unknown source rate prompts for confirmation. Analysis retains decoded rates; playback adapts to the output device, and export rate is selectable.

Sources share one start time and one transport clock. Shorter sources end in silence/empty plots. Closing the panel ends the comparison session; it is not a saved DAW project.

## Align files

Open **Align** in the comparison toolbar. Choose a reference and target with the same decoded sample rate, then **Estimate**. Review the integer delay and correlation before **Apply alignment**; unreliable estimates cannot be applied. Search is limited to ±2 seconds within the first 60 seconds. **Also compensate inverted polarity** is optional and off by default.

Playback, plots, measurements and export then use the aligned session copy. **Reset alignments** restores originals; source files are unchanged. Moving earlier omits leading samples; moving later inserts silence. Reloading discards alignment. Fractional delay and clock drift are unsupported. [Full usage and limits](audio-alignment.md) · [Design article](blog/audio-alignment-dsp.en.md) · [中文](blog/audio-alignment-dsp.md)

## STFT

The STFT pane combines an overview waveform and spectrograms. Comparison shares time and frequency ranges across tracks and offers automatic 1×2, 1×3 or 2×2 layouts. Right-click a comparison spectrogram for layout and fullscreen.

Comparison controls:

- Drag a plot to zoom the selected time/frequency range.
- Ctrl/Cmd-drag constrains to time; Shift-drag constrains to frequency.
- Double-click or **Reset view** restores the range. The wheel scrolls the page.

The single-file view also supports drag zoom. Its right-click reset retains modifier actions: Ctrl resets time only; Shift resets the value/frequency axis only.

Settings include time range, waveform visibility/height/amplitude, spectrogram height/resolution, FFT backend, window size/type, frequency axis, frequency bounds and level range. Comparison uses a shared absolute dBFS scale; its Mel option changes the frequency axis, rather than applying a mel filter bank.

[How spectrogram rendering works](blog/anisotropic-spectrogram-rendering.en.md)

## Live Spec

Live Spec combines a spectrum, stereo field and frequency correlation. Comparison overlays use each track's color and native decoded rate; active muted sources stay visible. Analysis operates on session buffers (aligned copies after applying Align), independently of listening EQ and routing.

Spectrum settings offer FFT or CQT, FFT size, CQT low-frequency resolution, tilt, release and peak hold. Double-click the spectrum to clear peak hold. Stereo-field settings include polar sample, polar level and Lissajous modes. Pane splitters resize the visualizers; right-click provides fullscreen actions.

Use FFT for a familiar spectrum view and CQT for variable-Q bands with more useful low-frequency spacing. The CQT display keeps smoothing history when a native time slice differs by one sample.

[CQT design and calibration notes](blog/cqt-spectrum-analyzer.en.md) · [中文](blog/cqt-spectrum-analyzer.md)

## Loudness

The Loudness pane shows per-file integrated LUFS, loudness range and true peak. Comparison plots short-term LUFS, F0 and onset flux on linked time axes. These are separate measurements: F0 is a pitch estimate and can be absent/unreliable for unvoiced or complex polyphonic material; onset flux describes spectral change.

Whole-file analysis can take time. Switching/removing/reloading a track cancels stale work; a graph is not evidence of a completed profile until its analysis finishes. Real VS Code host sequence analysis is outside the browser GIF harness.

## Listening and Monitor

Space plays/pauses when focus is not inside an interactive control. Comparison has a floating bottom transport; hover/focus keeps it open. Enter a position in seconds and press Enter to seek, or Escape to discard the edit. Double-click its volume slider to reset to 100%.

**Monitor** opens L/R/M/S routing, five-band solo and headphone correction. Search or import correction data through the curve editor. Headphone metadata/curve requests use external services; audio remains local. These controls affect listening, not original-signal analysis. Headphone EQ enters exported audio only when explicitly selected. HPF/LPF can be explicitly synchronized to export.

[Detailed monitoring behavior](live-monitoring.md)

## Level matching and residuals

Right-click a track header or STFT figure. **Match RMS levels (shared region)** measures the current selection, or the complete shared duration if no region is selected. It attenuates louder files to the quietest active file, accounting for mono center-panning; it does not boost or normalize peaks. Hover a filename to see its matching gain. **Reset matching gains** restores unity. Reloading a file resets its gain. Source spectrograms and loudness measurements stay unchanged.

**Measure residual vs focused file…** subtracts each active file from the focused reference at the same timeline positions, using current matching gains. It reports residual RMS/peak in dBFS and energy relative to the reference. Silence is shown as −∞; a silent reference has no relative level. Files must have equal decoded sample rates for sample-exact subtraction. Residual measurement does not estimate a delay itself; apply **Align** first when needed. It then measures the current aligned session copies.

## Edit & Export

Choose a start/end range, source/channel mode, filter settings, sample rate and WAV encoding. Comparison exports the sum of active, unmuted sources without automatic normalization. Mono sources are center-panned at −3.01 dB per side. RMS matching gains are included; master volume is excluded. Enable **Apply headphone EQ to WAV** to bake the currently enabled correction profile into the export. This includes the correction preamp, enabled filters and listen-match gain; it defaults off.

Outputs support PCM8/16/24 or IEEE float32. For an integer-format overload, choose float32, attenuation, explicit clipping or cancel. A successful render still requires selecting a destination through the VS Code host. The GIF harness saves the same rendered bytes locally and omits that dialog.

The single-file view additionally offers Dry/Processed audition of its selected channel/filter chain. The headphone EQ export option applies to the saved WAV. Export channel settings and monitoring channel routing have separate purposes; do not assume listening in Mid/Side changes the saved channel layout.

## Help and limits

Use the toolbar guide and adjacent keyboard-help button for the current view. Pane settings scroll inside their own dialog. Settings persistence and first-open guides use the VS Code host; browser recordings substitute only this bridge.

Decoded PCM is held in memory, so long high-rate stereo files can be expensive. Comparison supports eight tracks. Reopen the panel if an analysis Worker fails. File operations require a trusted workspace.

[Configuration reference](configuration.md) · [Architecture](knowledge-base/architecture.md) · [Development and release](development.md)
