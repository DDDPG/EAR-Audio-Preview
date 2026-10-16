# Development, packaging and release

[English overview](../README.md) · [中文概览](../README.zh-CN.md)

## Local checks

See the [test architecture and extension guide](testing.md) for module groups, focused commands, fixtures and regression-test boundaries.

Use Node.js 22 or later and `npm ci`. CI uses Node 22 and npm's lockfile cache.

```sh
npm run typecheck
npm run lint-check
npm run format-check
npm run test:tooling
npm run docs:check
NODE_OPTIONS=--max-old-space-size=4096 npm test -- --maxWorkers=2 --workerIdleMemoryLimit=512MB
npm run vsix -- --out artifacts/ear-audio-preview.vsix
node scripts/package-audit.mjs artifacts/ear-audio-preview.vsix --save artifacts/package-audit.json
```

`npm run ci` runs the checks and packages locally. `vsce package` invokes `vscode:prepublish`: it removes stale `dist/` files and builds production bundles. Do not run a development build immediately before packaging—the production build would repeat that work.

For interactive development, run `npm run webpack-dev`, then press F5 in VS Code. The three webpack targets cover the Node host, production webviews/workers and web extension host. Test the actual VS Code host for file dialogs, workspace persistence and AutoEq network operations; browser demos only replace the host bridge.

## One source for the latest highlights

1. Set matching versions in `package.json` and the root entries of `package-lock.json`.
2. Add `doc/releases/<version>.md`, beginning with `# EAR Audio Preview v<version>`, then `## English` and `## 简体中文` sections.
3. Run `npm run docs:sync`. It replaces only the marked latest-release block in each README. Previous release history belongs in `CHANGELOG.md` and versioned notes, not the README.
4. Update `CHANGELOG.md`, review the generated README blocks and run `npm run docs:check`.

Missing notes, duplicate markers, mismatched versions or stale README highlights fail validation. Do not change the markers by hand.

## CI and GitHub Releases

`.github/workflows/verify.yml` is shared by pull-request CI and releases. It checks types, lint, formatting, tooling tests, release documentation and the full Jest suite, then builds/packages once and audits the real archive. It uploads the VSIX, bilingual release body and package audit as a 14-day artifact. CI runs are cancelled when newer changes supersede the same PR/branch; release runs are serialized per tag.

After committing and reviewing the intended release, create and push `v<version>`. The release workflow checks out that tag, verifies it agrees with the package and versioned notes, and publishes the artifact. Its body starts with that version's English/Chinese highlights; GitHub's generated commit notes follow. The workflow does not publish to the VS Code Marketplace.

Manual dispatch takes an existing version **without** the `v` prefix, such as `0.6.0`, and checks out `refs/tags/v0.6.0`. It fails if the tag is absent or its package version differs, rather than releasing the current default branch under an unrelated version.

The hosted Actions run and actual publication can only be confirmed after the workflow is committed and triggered. Local validation does not establish that a GitHub Release was created.

## Benchmarks and demos

```sh
npm run bench
node bench/comparisonDsp.mjs --baseline 06705d4 --save /tmp/comparison-dsp.json
node bench/polarGeometryValidation.mjs --save /tmp/polar-geometry.json
node bench/bundleSize.mjs --save /tmp/package-size.json
```

Do not overwrite `bench/baseline.json` to hide a regression. The comparison check uses an immutable Git DSP source, deterministic audio, byte-equivalence checks and alternating timing batches. Run timing checks without concurrent builds or recording.

The historical `bench/liveKernelValidation.mjs` remains frozen and compares against the pre-fix polar geometry. Its polar byte check is expected to differ after the documented correctness correction; use `polarGeometryValidation.mjs` for current geometry contracts and strict energy/spline byte equality. This does not relax the original speed or bundle gates.

[Demo capture instructions](../bench/demos/README.md) · [Package audit](package-audit.md) · [Comparison evidence](comparison.md)
