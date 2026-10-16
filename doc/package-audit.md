# Package audit — v0.6.0

[English overview](../README.md) · [中文概览](../README.zh-CN.md)

Measured on **2026-10-16**, against the local production VSIX before and after this packaging pass. These are historical packaging measurements from the comparison implementation at that time, not measurements of the current release archive or Marketplace download.

## Result

- **Download:** about **6.66 → 3.44 MiB**, a **48% reduction** (6,981,996 → 3,605,292 bytes; see the JSON for the exact final archive).
- **Installed archive contents:** about **13.99 → 9.86 MiB**. Download and installed sizes are different metrics.
- **Shipped files:** 21, including both READMEs and required runtime/worker entries. Demo GIFs, documentation sources, raw recordings, benchmarks, tooling, tests, node_modules and source maps are excluded.

[Machine-readable audit](metrics/package-audit.json) records exact per-file compressed and installed byte counts. Documentation edits can change the final compressed size by a few bytes; the rounded result above is stable.

## Removed or reduced

1. **Unused Opus enhancement model chunk:** the decoder can optionally load LACE/NoLACE speech models, but this application never enables `speechQualityEnhancement`. A webpack IgnorePlugin excludes that optional import at build time. Standard Opus decoding and its Worker remain. The [decoder's official documentation](https://raw.githubusercontent.com/eshaz/wasm-audio-decoders/main/src/ogg-opus-decoder/README.md) explicitly permits omitting the model build when unused.
2. **Unused Essentia package add-ons:** the package root eagerly imports model, extractor and plotting modules. A build-only alias exports only the same Core API and WASM objects used by the application. No analysis algorithm or WASM backend was replaced.
3. **Icon compression:** PNG recompression reduces 403,450 to 346,982 bytes. Width, height and decoded pixels are identical.
4. **Development and promotional assets:** `.vscodeignore` excludes `assets/`, `scripts/`, `bench/`, `artifacts/`, task/audit records and source. The package audit inspects the actual ZIP directory and fails on these paths, source maps, missing runtime entries or a returning `opus-ml` file.
5. **Repeated builds:** shared CI/release validation packages through `vsce` once. Its prepublish hook already cleans `dist/` and builds production, so the preceding redundant development build has been removed.

## Retained intentionally

The Essentia WASM backend still appears in the isolated Node host, web host and comparison Worker bundles. All three routes are reachable. Sharing one external binary across them would require loader, Worker and CSP changes, so it is not treated as dead code. Standard per-format decoders, the EBU R128 WASM and loudness worklet are also retained because they implement documented functionality.

This pass favors deleting unreachable payloads without narrowing supported formats or changing decoded samples. No optional enhancement quality is silently traded away: those options were never exposed or enabled.

## Verification and reproduction

```sh
npm run vsix -- --out artifacts/ear-audio-preview.vsix
node scripts/package-audit.mjs artifacts/ear-audio-preview.vsix --save artifacts/package-audit.json
```

The build-only Essentia alias returns the exact same Core constructor and WASM object as the package root. Browser smoke checks decoded a generated Opus file through the native-rate WASM path without the fallback-rate confirmation, then rendered an Essentia-backend STFT with the production Worker. After the pre-release adversarial review, all 78 Jest suites passed (646 tests passed, one skipped), including the CQT slice-jitter regression uncovered during real demo recording.

The two real-audio GIFs are assembled from actual production-UI captures: about 3.58 MiB for the four-file workflow (56 frames, 12.22 s) and 3.00 MiB for the single-file workflow (60 frames, 12.94 s). Every frame is decoded and checked against its ordered source; playback and EQ bypass states are verified. They are repository assets and contribute **zero bytes** to VSIX. Original MP3 recordings remain outside the repository. Local readability and decoding were verified; live GitHub rendering can only be checked after commit and push.
