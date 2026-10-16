# Final local v0.6.0 acceptance — 2026-10-17

This pass closes the first-quantum limitation recorded in round 7 and verifies its seven repairs against the final installed package. It does not repeat the earlier whole-repository review or claim new performance gains. All changes remain uncommitted.

## Startup transient: reproduced and fixed

The defect also occurs in real-time playback. For equal stereo sine input with amplitude 0.25, Side monitoring incorrectly emits a peak of 0.125 (approximately -18.06 dBFS) during the first 128-frame quantum. At 44.1/48 kHz this lasts about 2.90/2.67 ms. A real signal error is established; subjective audibility depends on playback conditions and was not measured.

Both inline analysers sit after individual splitter outputs, but previously used dynamic/default channel configuration. Explicitly declaring each analyser mono before connecting the graph removes the mismatch. Controlled node experiments isolate the analyser configuration; setting only gain nodes to mono does not remove it. The fix changes four property assignments and adds two tests asserting the configuration at connection time.

The actual `PlayerService` was bundled into a real browser harness. Sixteen representative scenarios were run with both real-time `AudioContext` and `OfflineAudioContext`: 44.1/48 kHz, mono/stereo, equal/antiphase/left-only sources, LR/M/S/L/R and initial Live visibility. Both channels and every frame are checked, including the startup quantum. Real-time capture rejects missing/duplicate frames.

- Final before-fix run: 18 of 32 cases fail, exclusively in frames 1–127. The extra failing subset varies with scheduling; equal-stereo Side failures repeat across both rates and engines.
- After-fix run: all 32 pass, maximum measured PCM error exactly zero. Independent second review found no blocker.
- Evidence: `startup-before.json`, `startup-after.json`, both `startup-*-review.json` reports, and red/green unit logs. The first review's before/after `sha256` fields identify source files; the second review distinguishes source and report hashes.
- Reproduction: `bench/monitorStartupValidation.mjs`; instructions in `doc/testing.md`. The preserved pre-fix source is `playerService.before.txt` (copy to a temporary `.ts` file for a red run).

## Final installed VSIX

Package: `ear-audio-preview-0.6.0.vsix`, 3,609,033 bytes, 21 archive entries.

SHA-256: `19ef0bc3f429b0fd0a0c22e9996a3df50514321a722139310a9b4807ca0662fd`.

The package was installed into isolated VS Code 1.111.0 profiles. All 13 packaged runtime files match both the installation and current build byte-for-byte (`native-integrity.json`). A separate controller extension drives real editor commands and provides a real custom filesystem provider. Product files are unchanged; DOM events operate installed webviews. Observers capture source starts/stops and PCM, and a controlled timer exposes the final measurement-yield race.

| Fix | Installed-package result | Evidence |
| --- | --- | --- |
| R7-1 Reload ordering | Newer read completes first; only its data reaches the webview. Late success/failure after closing does not resurrect the editor or notify an error. | `native-host.json` |
| R7-2 Edit loop handoff | Entering Edit during full-file playback stops the old source and starts the selected 1–3 second loop. | `native-single.json` |
| R7-3 Live/meter continuity | Opening Live and toggling meters preserves the single source and advances the AudioContext clock; no stop/restart. | `native-single.json` |
| R7-4 Exact endpoints | A final-frame impulse produces residual RMS -46.81 dBFS / peak 0 dBFS; RMS matching against a half-amplitude endpoint produces -6.02 dB. | `native-comparison.json` |
| R7-5 Hidden monitoring | Hidden-panel Side null, Mid positive control and low-band attenuation all pass. A fresh-preview check additionally covers never mounting Live. | `native-single.json`, `native-hidden-monitor.json` |
| R7-6 Cancellation | Mute/pane changes permit measurement to finish; changing selection at the second track's final yield cancels with terminal status, and the next measurement succeeds. | `native-comparison.json` |
| R7-7 Provider export | Export writes a valid stereo WAV beside the source using the original custom URI scheme and authority. | `native-host.json` |

Native checks run in background isolated windows. They establish installed runtime behavior, host filesystem integration and signal contracts, not foreground pointer hit-testing or display performance. Real-time PCM is sampled before a muted hardware sink; no physical-output measurement or subjective listening is claimed. Native screenshot capture cannot establish those missing claims. The complete round-7 unit regressions remain the broader edge-case coverage; this table records targeted installed-package acceptance, not every possible input.

## Verification and retained boundaries

- 79 source suites pass: 712 tests pass, 1 existing skip. Eleven tooling tests pass.
- TypeScript, ESLint, source formatting, release-note/README consistency, production compilation and VSIX audit pass.
- No existing test assertion or benchmark threshold was weakened. Earlier failing results remain preserved.
- Initial harness setup/oracle failures were corrected: seek-to-play already starts playback; a monitor probe must tap the destination path rather than pre-matrix nodes; Chrome PCM16 decode may differ from nominal amplitude by one source LSB; screenshots require the outer page. These were test-harness corrections, not additional product changes.
- Runtime controller tokens and profiles are excluded from retained repository evidence. Temporary reproduction runners and the installed package remain under `/tmp/ear-final-acceptance-20261017`.
- HEAD remains `06705d4807e121e60737a080daa0a2d6bd2827dd`; no staging, commit, push, tag or publication.
