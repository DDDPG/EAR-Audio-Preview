# Real-audio README recordings

Two actual production-webview recordings use the user's local `A.mp3`, `B.mp3`, `C.mp3` and `D.mp3`. The original files are read unchanged and are never copied into Git or VSIX. There is no generated audio, synthetic chart or recreated product UI.

- **Multi-audio workflow:** four files, linked STFT drag zoom, shared playback, four Live Spec overlays, independent mute and participation switches.
- **Single-audio workflow:** B.mp3 playback, STFT/Live Spec, actual offline LUFS/LRA/true-peak measurement and Essentia F0/onset calculation, then an imported headphone preset and correction bypass.

The local adapter replaces VS Code file IPC and the file-picker result. Production decoding, Web Audio transport, Worker analysis, rendering, EQ parsing and filtering run unchanged. Feature analysis calls the project's actual `sequenceFeatureHost.ts`, using the original full decoded B.mp3. The single-file adapter starts with headphone correction enabled and no profile, so importing the real preset activates correction; both subsequent bypass states are captured. The browser output is muted so recording does not disturb the desktop; its audio graph and analysis still run. GIF itself contains no sound.

The correction example imports the published [AutoEq / oratory1990 Sennheiser HD650 parametric preset](https://github.com/jaakkopasanen/AutoEq/tree/master/results/oratory1990/over-ear/Sennheiser%20HD%20650), cached outside Git with source URL and SHA-256. It demonstrates an example headphone profile, not a measurement of the user's headphones. Online model search, save/open dialogs and extension installation are outside this recording. The adapter returns an explicit offline-catalog response; no catalog or correction algorithm is fabricated.

## Reproduce

Prerequisites: Node.js, curl, Playwright/Chromium, Python/Pillow and the locally installed `build-demo-gif` skill's `scripts/assemble_gif.py`. These are recording tools, not application dependencies.

```sh
npm ci
npm run vscode:prepublish
node bench/demos/prepare.mjs
# Supply an external directory containing A.mp3 through D.mp3.
node bench/demos/server.mjs /path/to/real-audio
```

In another terminal:

```sh
PLAYWRIGHT_MODULE_PATH=/path/to/playwright \
CHROME_EXECUTABLE=/path/to/chrome \
node bench/demos/capture.mjs
```

The server listens only on `127.0.0.1:9344`. Each scene opens in an independent page. The script launches and closes its own browser; existing browser sessions and the user's editor are unaffected. The four recordings remain local. Only `prepare.mjs` downloads the public headphone preset; no audio is sent to that service.

Capture evidence lives in ignored `bench/demo-captures/`: numbered PNG/state pairs, SHA-256 hashes, ordered storyboards, production-bundle hashes and source-audio hashes. The single-file state also records playback, measured loudness and actual feature-frame counts. Raw files and absolute source-directory paths are excluded from published metadata.

## Assemble and verify

```sh
# GIF_ASSEMBLER points to your local build-demo-gif/scripts/assemble_gif.py.
python "$GIF_ASSEMBLER" \
  bench/demo-captures/multi-audio-workflow/storyboard.json \
  /tmp/multi-audio-workflow-original.gif
```

Repeat for `single-audio-workflow`. The assembler checks source/screenshot hashes and frame order. It adds a title, caption and progress footer around the actual screenshot. Capture is 1160 × 820; framed output is 1160 × 940. The multi-file scene contains 56 frames (12.22 s); the single-file scene contains 60 frames (12.94 s). Frames use 180 ms, with a 900 ms first frame and 1600 ms last frame. Preparation and analysis waits are edited out between shots; this is an operation showcase, not a latency benchmark.

Published files use 1040-pixel width and a shared 128-color palette:

```sh
ffmpeg -i /tmp/multi-audio-workflow-original.gif \
  -filter_complex 'scale=1040:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle' \
  -fps_mode passthrough -loop 0 -final_delay 160 \
  assets/demos/multi-audio-workflow.gif
```

Decode every final frame and verify count, order, duration and readability. Inspect the complete contact sheet plus full-size first, ordinary, parameter-overlay and final frames. [Published metadata](../../assets/demos/manifest.json) records final sizes and hashes. Demo assets contribute zero bytes to VSIX; the packaging audit enforces their exclusion. Local validation does not establish live GitHub rendering before commit and push.
