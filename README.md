<div align="center">
  <img src="ear_audio.png" alt="EAR Audio Preview" width="100" />
  <h1>EAR Audio Preview</h1>
  <p><strong>Hear the difference. See why.</strong><br>A professional audio workspace inside VS Code and Cursor.</p>

[![Marketplace](https://img.shields.io/visual-studio-marketplace/v/Eps-Acoustic-Revolution-Lab.ear-audio-preview?label=Marketplace)](https://marketplace.visualstudio.com/items?itemName=Eps-Acoustic-Revolution-Lab.ear-audio-preview)
[![CI](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/actions/workflows/ci.yml/badge.svg)](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**English** · [简体中文](README.zh-CN.md)

[Quick start](#quick-start) · [Workflows](#see-it-in-action) · [What's new](#whats-new-in-v060) · [Why EAR](#why-ear) · [Development](#development)
</div>

> **Engineering notes:** we share the ideas behind EAR in our [technical blog](doc/blog/), from CQT spectrum design to GPU spectrogram rendering.

## Introduction

**Play, inspect and compare audio right where you build it.** EAR Audio Preview brings waveforms, spectrograms, live stereo analysis and loudness measurement into your editor. Compare model outputs, check a dataset, audition sound effects or review a mix revision—all in one workspace.

**8-file comparison · FFT + CQT · LUFS / LRA / true peak · Headphone EQ · Local audio processing**

## Quick start

### Install

Search **EAR Audio Preview** in the Extensions panel, or install from the terminal:

```sh
code --install-extension Eps-Acoustic-Revolution-Lab.ear-audio-preview
```

[Install from Marketplace](https://marketplace.visualstudio.com/items?itemName=Eps-Acoustic-Revolution-Lab.ear-audio-preview) · [Download a VSIX](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/releases)

### Your first minute

1. **Open and listen.** Open an audio file and press **Space**. If another editor opens, choose **Reopen Editor With… → Audio Preview**.
2. **Inspect the sound.** Drag across the STFT plot to zoom into a detail. Switch to **Live Spec** for spectrum and stereo analysis, or **Loudness** to calculate loudness, pitch and onset timelines.
3. **Compare versions.** Select **2–8 mono/stereo files** in Explorer, right-click and choose **EAR Audio: Compare Files**. Press play to hear them together, and use each track's mute control to choose what you hear.

The first-open interactive guide walks you through the controls. Replay it anytime with **`?`** in the toolbar. In comparison view, **Ctrl/Cmd-drag** zooms time, **Shift-drag** zooms frequency, and double-click resets the view; right-click a plot for layout and fullscreen options.

Supports **WAV, MP3, AAC, OGG, FLAC, OPUS, M4A and SPH**. [Full user guide](doc/usage.md) · [Settings reference](doc/configuration.md)

## See it in action

### Compare model outputs, references and mix revisions

Put up to eight recordings on a shared timeline. Drag once to inspect the same time/frequency region across every spectrogram, then switch to Live Spec for color-coded spectrum, stereo-field and phase-correlation overlays. Keep a reference visible in analysis while muting it in playback.

![Four real recordings: linked STFT zoom and parallel Live Spec playback](assets/demos/multi-audio-workflow.gif)

### Check dynamics and tune your listening

Go from playback to LUFS, true peak, pitch and onset analysis. Open Monitor to audition L/R/M/S or individual frequency bands, then apply a headphone correction profile and switch bypass to hear the difference.

![Single-file playback, loudness and feature analysis, and headphone correction](assets/demos/single-audio-workflow.gif)

### Tools for the whole inspection workflow

| Workspace | What you can do |
| --- | --- |
| **STFT** | Inspect waveforms and GPU spectrograms; switch linear, log, mel or hybrid axes; zoom, compare and expand details fullscreen. |
| **Live Spec** | Watch FFT/CQT spectra, peak hold, three stereo-field views and frequency-by-frequency phase correlation during playback. |
| **Loudness** | Measure LUFS, LRA, PLR and true peak; follow loudness, F0 and onset curves on a shared timeline. |
| **Edit & Export** | Select a region and export a WAV or comparison mix with your choice of sample rate, channels and PCM8/16/24 or float32. |
| **Monitor** | Listen in L/R/M/S, solo individual bands in a five-band monitor, and search or import AutoEq headphone correction profiles. |

<a id="whats-new"></a>

<!-- release:en:start -->
## What's new in v0.6.0

- **Align before comparing.** Estimate a constant integer-sample delay between two same-rate files, review it, then apply or reset the session copy across playback, analysis and export. Polarity compensation is optional; source files stay unchanged.

- **Eight files, one workspace.** Parallel playback, linked waveform/STFT zoom and independent track focus, mute and analysis controls.
- **Live comparison at a glance.** Overlay FFT/CQT spectra, stereo fields and phase correlation; compare LUFS, F0 and onset timelines.
- **Match levels and inspect differences.** Match shared-region RMS without boosting peaks; measure same-rate residual RMS and peak against a reference.
- **Export the mix you choose.** Save a selected region with configurable sample rate, channels and PCM or float32 WAV encoding, with optional headphone EQ.
- **A smoother daily workflow.** Unified controls, a floating Monitor with headphone correction, an interactive comparison guide and a 48% smaller package.

- **More reliable diagnostics.** Correct sound-field direction and polarity handling, bound polar interpolation, and recover safely from malformed saved headphone EQ.
<!-- release:en:end -->

[Release history](CHANGELOG.md)

## Why EAR

Compare multiple renders while watching each source's spectrum, stereo field and loudness. Here's how EAR's analysis and monitoring tools compare.

| Capability | **EAR** | [audio-preview](https://marketplace.visualstudio.com/items?itemName=sukumo28.wav-preview) | [Audio Player](https://marketplace.visualstudio.com/items?itemName=huachao.audio-player) | [audioscope](https://marketplace.visualstudio.com/items?itemName=YongsooIm.audioscope) |
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

✓ Available · — Not provided in the compared version. [Versions and feature notes](doc/comparison.md#capabilities).

Keep a reference muted but visible in analysis. Channel routing, band solo and headphone EQ let you inspect what you hear while measurements stay independent of listening controls. After applying Align, measurements use the aligned session copy.

**Fast to inspect, light to install.**

- **21–28% higher STFT throughput** than audio-preview: a 3-second clip analyzed in about **25 ms**.
- **6.5× faster preview** than audio-preview for a 60-second stereo file: about **0.25 s** to open.
- **48% smaller download** after package optimization: **6.66 → 3.44 MiB**.

[Explore the comparison with six audio extensions](doc/comparison.md) · [Performance details](doc/comparison.md#repository-benchmark-suite)

## Under the hood

### Spectrograms that keep transients sharp

A WebGL2 renderer treats time and frequency differently: sharp timing preserves attacks, while interpolation along frequency keeps harmonic lines smooth. Adaptive FFT sizing and multiple window functions help you inspect both short events and sustained tones. [How the renderer works](doc/blog/anisotropic-spectrogram-rendering.en.md)

### A spectrum view for listening

Choose familiar FFT analysis or a PAZ-inspired CQT view with variable-Q bands, low-frequency detail, adjustable tilt and peak hold. Configurable release keeps the display readable as the sound changes. [CQT design notes](doc/blog/cqt-spectrum-analyzer.en.md)

### Reversible audio alignment

Choose **Align**, estimate the delay between two same-rate files, then review and apply it. Search covers ±2 seconds within the first 60 seconds; playback, plots and export use the shifted session copy. Reset restores the decoded original. Fractional delays and clock drift are outside this feature. [Design, failures and ablation](doc/blog/audio-alignment-dsp.en.md) · [Usage](doc/audio-alignment.md)

### Shared time, source-aware analysis

Comparison analyzes each track at its decoded sample rate and maps the results onto common time and frequency axes. A shared absolute dBFS scale supports direct STFT comparison. Source analysis, monitoring and export use separate paths, so you can change how you listen while keeping measurements independent of listening controls. Applying Align explicitly replaces the session audio used by all three paths.

[Documentation index](doc/README.md) · [Architecture](doc/knowledge-base/architecture.md) · [Audio DSP](doc/knowledge-base/audio-dsp-chain.md) · [Live monitoring](doc/live-monitoring.md)

## Roadmap

### Shipped

- [x] **Foundation:** per-format WASM decoding, WebGL2 spectrograms, stereo metering and phase correlation.
- [x] **v0.2:** four workspace panes, loudness/F0/onset timelines and region export.
- [x] **v0.3:** AutoEq headphone correction with global and workspace profiles.
- [x] **v0.4:** PAZ-inspired CQT spectrum and peak hold.
- [x] **v0.5:** anisotropic spectrogram rendering and interactive onboarding.
- [x] **v0.6:** eight-file parallel playback, linked STFT zoom and live analysis overlays.
- [x] **v0.6:** per-file loudness/features, shared Monitor controls and selection mix export.

- [x] **v0.6:** shared-region RMS matching, same-rate residual measurements and optional headphone EQ in WAV exports.

- [x] **v0.6:** reversible same-rate integer-delay alignment across playback, analysis and export, with optional polarity compensation.

### Planned

- [ ] Chroma timelines or polyphonic melody estimation with PredominantPitchMelodia.
- [ ] Optional feature strips, including spectral centroid.
- [ ] A/B/C frequency-weighted RMS.
- [ ] Worker-based F0/onset analysis for long single-file recordings.

[Release history](CHANGELOG.md) · [Suggest a feature](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/issues)

## Development

```sh
git clone https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview.git
cd EAR-Audio-Preview
npm ci
npm run webpack-dev
```

Press **F5** to launch the Extension Development Host, then open an audio file. Run **`npm run ci`** to check and package your changes, or **`npm run vsix`** to build an installable extension.

Bug reports, feature ideas and pull requests are welcome. [Open an issue](https://github.com/Eps-Acoustic-Revolution-Lab/EAR-Audio-Preview/issues) · [Development and release guide](doc/development.md) · [Test architecture and guide](doc/testing.md)

## Credits and license

Developed by [Eps Acoustic Revolution Lab](https://github.com/Eps-Acoustic-Revolution-Lab), building on the Custom Editor foundation of [sukumo28/vscode-audio-preview](https://github.com/sukumo28/vscode-audio-preview).

Powered by Ooura, Essentia.js, twgl.js, wasm-audio-decoders, loudness-worklet and ebur128-wasm.

Released under the [MIT License](LICENSE). Third-party libraries retain their respective licenses.
