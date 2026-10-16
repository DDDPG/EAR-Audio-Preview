# Building an Audio Alignment Operator: Design, Failures, and Ablation

> **v0.6.0 integration update:** The integer-delay operator is now integrated into the comparison toolbar as **Align**. Playback, analysis and export use a reversible session copy after explicit application. The article below preserves the research-stage experiments and timings; they are not measurements of the complete extension. See the [current usage and limits](../audio-alignment.md) and [research source access](audio-alignment-research.md).

> 中文版：[音频对齐为什么会失败：一个 DSP 算子的设计、测试与消融](audio-alignment-dsp.md)
>
> October 17, 2026 · EAR Audio Preview research notes. The experiments below concern the integer, constant-delay prototype on the isolated research branch, before product integration. The v0.6.0 integration is described above. All reported timings use an Apple M5 Pro, Node.js v24.9.0, and the fixed inputs described below.

When comparing two audio files, we often want a precise answer to a small question: is one merely delayed by a few samples, louder, or inverted in polarity? After compensating for those differences, how much genuinely different audio remains?

Cross-correlation is a useful starting point, but finding its largest peak is not the whole problem. Averaging stereo channels can cancel the signal. The correct peak can be negative. A periodic waveform can support several equally plausible offsets. On long recordings, filtering, input preparation, and validation can cost more than the correlation step we initially focused on.

This project started with a pinned audioscope v1.1.8 implementation. We established a reproducible comparison, built our own operator, ran five rounds of independent adversarial review, and then used ablation to revisit our explanation of the results.

The final attribution is specific: channel handling and polarity support explain the positive-case advantage on our fixed corpus; multiple candidates help reject periodic ambiguity; a short window reduces long-input work. Partial whitening did not improve the number of successful cases, but affected runtime through early termination on some recordings. That is a narrower conclusion than our initial design rationale.

## 1. Define what alignment means

The inputs are decoded PCM at the same sample rate. A is the reference and B is the comparison signal. Our offset convention is:

$$
A[n] \approx p\,B[n+d],\qquad p\in\{-1,+1\}.
$$

A positive d means the corresponding content occurs later in B. The sign p describes overall polarity; amplitude differences are handled by a subsequent gain fit. Estimating an offset does not move or modify either input.

The prototype exposes two functions:

```js
estimateAlignment(aChannels, bChannels, sampleRate, options)
// { accepted, offsetSamples, polarity, confidence, reason }

compareResidual(aChannels, bChannels, sampleRate, offsetSamples)
// Linked gain, residual RMS, peak, null depth, and valid overlap
```

The first asks whether an integer offset is sufficiently credible to use. The second measures the remaining difference at a supplied offset. The `confidence` field is the absolute correlation coefficient, not a calibrated probability of correctness.

This work does not implement sample-rate conversion, fractional-sample delay, clock drift correction, dynamic time warping, or structural matching between different performances. A single constant integer delay must be an appropriate model of the relationship.

## 2. Pin the baseline before comparing it

The baseline is audioscope **v1.1.8**, commit `0cf177499eb3d80a06e37be6efa13ed4ac10c25e`. Its math implementation, original tests, and MIT license are stored in [vendor](audio-alignment-research.md) (`dsp-lab/vendor/`). [source.json](audio-alignment-research.md) (`dsp-lab/vendor/source.json`) records provenance and SHA-256 hashes. Our comparison concerns that code, not an assumption about other releases.

The baseline averages channels to mono, decimates up to the first 60 seconds to approximately 4 kHz, and selects one coarse peak using ordinary cross-correlation. It then searches a neighborhood at the original sample rate, using up to 65,536 samples for refinement. Both stages maximize positive correlation.

Our operator retains the coarse-to-fine structure but changes channel preparation, spectral weighting, candidate count, and analysis duration. Both implementations account for DC bias; mean removal is not an advantage unique to ours.

The operator lives in [operator.mjs](audio-alignment-research.md) (`dsp-lab/operator.mjs`), with its FFT in [fft.mjs](audio-alignment-research.md) (`dsp-lab/fft.mjs`). They run in the isolated `dsp-lab` directory. These research results alone do not validate the complete extension; current integration has separate acceptance records linked above.

## 3. Do not discard information before searching

### 3.1 Stereo averaging can erase valid audio

A simple stereo construction is enough to expose the problem:

$$
L=x,\quad R=-x,\quad (L+R)/2=0.
$$

Each channel contains useful information, but their average contains none. Such Side-only material also undermines a gain fit based on the mono average.

Our delay estimator selects a corresponding channel pair instead. For each channel, it measures mean-centered energy in A and B, takes the smaller energy as the pair's score, and chooses the pair with the largest score. This favors a pair with information on both sides rather than a loud channel in only one input.

It remains an energy heuristic. It is neither a joint multichannel estimator nor selection by correlation quality. A channel with strong interference can still win. The estimated delay is shared across all channels; left and right are never shifted independently.

### 3.2 A negative peak can be the correct match

If B is a delayed, inverted copy of A, correlation at the correct offset approaches −1. A positive-only search can discard that match and select a positive sidelobe instead.

We rank candidates by absolute correlation and report polarity separately. A large negative peak can therefore be a strong match. The estimator does not automatically invert a file; that would be a separate product decision.

These two edge cases eventually explained every positive-case difference from the pinned baseline on our ablation corpus. They do not establish uniformly better precision on ordinary, same-polarity material.

## 4. Generate coarse candidates from a short window

The current pipeline is:

```text
Validate PCM → select corresponding channel → find active audio
             → extract a window → low-pass and decimate
             → weighted correlation → up to three coarse peaks
             → native-rate refinement → accept or reject
```

### 4.1 Search radius and analysis duration are different choices

A default search radius of ±2 seconds does not require processing the entire 30-second recording in the coarse stage.

Within the common available input length, capped at the first 60 seconds, we locate an energetic region and choose an analysis duration of:

$$
T_{\text{window}}=\max(4,\;2T_{\text{lag}}+0.5)\ \text{seconds},
$$

capped by the available audio. The default is 4.5 seconds. The decimation factor is `floor(sampleRate / 2000)`, yielding an analysis rate near 2 kHz.

For a 30-second, 48 kHz input, audioscope's coarse signal has approximately 120,000 samples per input and uses a 262,144-point FFT. Our default window produces about 9,000 samples per input and uses a 32,768-point FFT. That is an eightfold difference in transform length, not a claim of eightfold end-to-end acceleration.

### 4.2 Keep a low-pass filter before decimation

The baseline's delay-analysis decimator averages blocks. Ours uses a Blackman-windowed sinc FIR with a radius of four times the decimation factor and a cutoff at 80% of the output Nyquist frequency, followed by kernel normalization.

The longer FIR is more expensive per output sample and provides more explicit anti-alias filtering. We did not independently ablate filter choice, so no measured accuracy gain can be assigned to it. Limiting the processed window keeps that cost manageable.

### 4.3 The initial case for partial whitening

Let X and Y be the input spectra, with cross-spectrum:

$$
S_k=\overline{X_k}Y_k.
$$

Ordinary cross-correlation applies an inverse FFT directly to S. Our coarse stage instead uses:

$$
C=\operatorname{IFFT}\!\left(
\frac{S_k}{\sqrt{\max(\epsilon,|S_k|)}}
\right),
$$

with the implementation floor:

$$
\epsilon=\max\left(10^{-20},\;10^{-5}\max_k |X_k||Y_k|\right).
$$

This reduces the dominance of strong frequency components without indefinitely amplifying weak bins. The weighting lies between ordinary correlation and full PHAT weighting.

The design hypothesis was that contributions from more frequency regions could make coarse peaks more discriminative. **It was a hypothesis to test. The ablation below did not demonstrate an accuracy gain on our corpus.**

## 5. A high correlation score does not establish a unique delay

The coarse stage retains up to three local peaks by absolute value. Each is refined sample by sample at the original rate, within two decimation factors on either side and within the permitted delay range.

Refinement uses up to 16,384 samples. A single pass over valid overlap accumulates `sum(A)`, `sum(B)`, `sum(A²)`, `sum(B²)`, and `sum(AB)`, producing a mean-centered normalized coefficient:

$$
\rho(d)=
\frac{\sum ab-\frac{\sum a\sum b}{N}}
{\sqrt{\left(\sum a^2-\frac{(\sum a)^2}{N}\right)
             \left(\sum b^2-\frac{(\sum b)^2}{N}\right)}}.
$$

The baseline uses separate passes for means and centered products. Our raw-moment formulation removes one traversal. They express the same kind of coefficient mathematically, but follow different floating-point paths; this is not a byte-identical substitution for arbitrary inputs. Extreme DC offsets and very low variance still require numerical care.

The current refinement function returns zero correlation when valid overlap contains fewer than 128 samples or variance is too low, rather than treating an uninformative region as reliable evidence.

The current acceptance threshold is `abs(rho) >= 0.75`. If a distinct alternative scores above 98.5% of the best score, the result is rejected as `ambiguous-peaks`. This checks the candidates actually searched, not every possible global ambiguity.

A pure tone explains why rejection matters. Shifts separated by a period can all correlate almost perfectly. Reporting a coefficient near 1 does not resolve which offset should be used.

There is also an early-exit rule: when the first refined candidate scores above 0.999 and the second coarse peak is less than half the first, remaining refinement can stop. This candidate-based heuristic later proved important to the runtime effect of whitening.

## 6. Test more than delayed copies

The generator is in [corpus.mjs](audio-alignment-research.md) (`dsp-lab/corpus.mjs`). Its deterministic base signal combines enveloped filtered noise, a changing-frequency sinusoid, and a fixed-frequency component. Positive families cover:

- Positive and negative integer delays, including search boundaries.
- Gain, DC offset, and added noise.
- Overall polarity inversion, Side-only stereo, and unequal channel energies.
- First-order low-pass filtering and leading silence.

Low-pass filtering changes waveform shape, so that family permits a two-sample error; the other original families generally permit one. Per-family success and the final gate requiring at least 95% of positives within one sample are separate checks.

Negative cases include signals with different noise components but shared tonal structure, silence, constants, and periodic ambiguity. A retained early development result still accepted **5 of 24 negative cases**, at correlations around 0.49–0.52. Shared tonal structure was not sufficient evidence for automatic alignment. After development-set adjustment, the final correlation threshold was 0.75. The [pre-adjustment results](audio-alignment-research.md) (`dsp-lab/results/dev-round-1.json`) were retained.

The initial held-out evaluation subsequently passed 72/72 positives and rejected all 32 negatives; the baseline passed 56/72 positives. “Held out” describes that original stage. Later optimization and ablation reused these inputs, making them a fixed regression corpus rather than another fresh blind evaluation.

Four local MP3 recordings were decoded by macOS `afconvert` to 48 kHz stereo Float32 PCM, retaining the first 30 seconds. Known delay, gain, polarity, and noise transformations produced 16 real-content variants: ours passed 16/16, versus 12/16 for the baseline. The four differing cases were polarity inversions.

The content is real audio, but the labels come from imposed transformations, not independently captured recordings with human alignment annotations. Additional confirmation included 52 cases from new seeds and six pairings of different recordings, for 58 cases, plus six separate gain/residual checks. These do not substitute for evaluation of real acquisition errors.

## 7. Fit gain and measure residuals only where audio overlaps

After alignment, one linked gain is fitted over all channels and valid overlap:

$$
g^*=\frac{\sum_{c,n\in\Omega} A_{c,n}B_{c,n+d}}
           {\sum_{c,n\in\Omega} B_{c,n+d}^{2}},
\qquad e_{c,n}=A_{c,n}-g^*B_{c,n+d}.
$$

A shared gain preserves channel ratios. The fit allows negative values and excludes zero-padded tails without corresponding content. Residual RMS, peak, and null depth use the same overlap.

For a nonzero reference, null depth is `10*log10` of reference energy divided by residual energy. A zero residual yields positive infinity; a zero-energy reference makes the ratio undefined, represented by a null value.

The baseline's `fitGain` accepts mono inputs and restricts the result to positive gain. Our definition is better suited to this stereo subtraction task, but does not guarantee a smaller residual for every signal. It does not fit a DC offset, frequency response, or nonlinear distortion. This is null-test gain matching, not LUFS-based listening-level matching.

## 8. The first implementation was slower

We retained raw timing samples from intermediate stages instead of keeping only the best final run. The speed ratio below means `baseline time / prototype time`; values above 1 favor the prototype.

1. **First implementation:** approximately 0.63–0.64 for 30-second inputs and 0.57–0.59 for 3-second inputs. Positive-case behavior improved, but runtime regressed.
2. **Second implementation:** after improving full-PCM checks and adding candidate early exit, approximately 1.02–1.04 for long inputs—close to parity—while short inputs remained slower.
3. **After shortening the window and simplifying FIR boundary loops:** two long-input timing passes produced approximately 1.71–1.88; short-input gains were not stable.
4. **After five review rounds:** two final timing passes against the pinned baseline produced approximately 2.80–2.87 for long inputs and 1.33–1.38 for short inputs.

See the [first timing stage](audio-alignment-research.md) (`dsp-lab/.cross-gan/baseline/timing-round-1.json`), [second stage](audio-alignment-research.md) (`dsp-lab/.cross-gan/baseline/timing-round-2.json`), and [final verification](audio-alignment-research.md) (`dsp-lab/results/final-verification.json`). These stages change multiple things. Their sequence does not assign an independent share of the improvement to each edit.

Timing includes complete PCM finite-value checks, channel preparation, and delay estimation. It excludes decoding, resampling, residual computation, IPC, and UI work. These are not application-wide speedups or promises for other hardware and input lengths.

## 9. What survived five rounds of review

Independent finders proposed candidates and independent discriminators challenged them. A candidate needed a reproducible trigger; efficiency changes additionally needed output equivalence on the existing corpus and gains in the actual benchmark. Findings, refutations, commits, and checks are recorded in the [.cross-gan checkpoint](audio-alignment-research.md) (`dsp-lab/.cross-gan/checkpoint.json`).

### Round 1: sparse samples were misclassified as silence

The cheap energy probe visited every 32nd sample. If nonzero samples occurred only at indices congruent to 1 modulo 32, the probe saw zeros everywhere. Two identical nonconstant inputs were rejected as silent.

A minimal construction, run from the repository root:

```js
import { estimateAlignment } from './dsp-lab/operator.mjs';

const x = new Float32Array(48000);
let state = 7;
for (let i = 1; i < x.length; i += 32) {
  state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
  x[i] = state / 4294967296 - 0.5;
}
console.log(estimateAlignment([x], [x.slice()], 48000));
```

The repair retains the cheap probe, but checks every sample before concluding that energy is insufficient. Regression cases vary the sampling phase and signed delay, while ensuring actual silence and constants remain rejected.

### Round 2: valid audio existed, but refinement examined silence

Moving sparse activity to the second half of a one-second recording passed the new channel-energy fallback. However, the window selector's stride-16 energy probe could still miss the activity and select the silent beginning.

This round added full-resolution fallback to window selection. Fixing “is there a signal?” had not fixed “where should we analyze it?” Independent reproduction exposed the distinction.

### Round 3: the final part of the recording was never visited

Half-window stepping can leave a tail shorter than one step. For 48,000 samples and a 16,384-sample refinement window, the old starts were 0, 8,192, 16,384, and 24,576. Coverage ended at 40,960. If the useful audio began at 46,000, rescanning those same windows more carefully could not find it.

The low-energy fallback now also compares an end-aligned window. Regression constructions cover 8, 44.1, 48, and 192 kHz with signed delays. These boundary checks are not comprehensive validation of every sample rate in the accepted range.

### Round 4: validate faster without checking fewer values

The full PCM scan was unrolled to check eight samples sequentially per iteration, with the remaining tail handled by the scalar loop. No sample or NaN/infinity check was removed.

Added tests cover every position in lengths 1–25, three invalid values, both inputs, mono/stereo, and both public functions. Paired comparisons of the pre-review and final operators reduced 30-second runtime by about 25–27% and 3-second runtime by about 6–7%.

This is a measured loop optimization, not a new alignment principle or a general recommendation to unroll every JavaScript loop.

### Round 5: tiny noise bypassed an exact-zero fallback

A tiny nonzero background could prevent a fallback guarded by energy equal to zero, while the selected region still lacked enough information for reliable refinement. Informative audio at the tail remained unexamined.

The final fallback condition uses energy below `1e-12`, matching the existing channel silence threshold. Full-resolution and tail checks remain. Regressions vary background amplitude, signed delay, and polarity.

Each round also compared JSON-serialized alignment and residual return objects on 250 fixed cases, requiring byte-identical results. That guarantee applies to those tested inputs and that serialized representation, not all possible inputs: fixing a boundary bug deliberately changes behavior on its new reproducer.

## 10. Two plausible optimizations we reverted

**Fuse the two forward FFTs.** Sharing bit-reversal indices and twiddle recurrence reduced some local work, and isolated tests showed gains. In the full operator, however, the median speed ratio across eight groups was only about 1.006, with regressions in some groups. The benefit was not distinguishable from noise, so we reverted it.

**Fuse the two FIR traversals.** The independent finder's in-memory experiment looked promising, but the actual file-based implementation regressed in two whole-operator timing passes. Even though 405 internal Float64 buffer comparisons were byte-identical, first-pass speed ratios were only about 0.84–0.88 for short inputs and 0.95–0.96 for long inputs. We reverted it as well.

We do not have enough evidence to explain the JIT behavior behind the discrepancy. The supported conclusion is simpler: fewer arithmetic or loop operations, or a faster in-memory experiment, does not establish that the shipped experimental implementation is faster. Both rejected implementations and their timing evidence remain in the record.

## 11. Ablation: identify which components explain the result

We froze the complete version, toggled channel selection, partial whitening, multiple candidates, and the short window, and evaluated all 16 combinations. Adding a polarity-disabled control and the pinned baseline yielded 18 versions.

The corpus contains 250 historical fixed cases, 52 cases from two additional seeds, and 16 predefined diagnostic cases: **318 total, with 230 positives and 88 negatives**. The complete snapshot matches the operator source, and all 318 full return objects match direct calls to the operator.

### 11.1 Accuracy attribution was narrower than expected

- **Complete version: 230/230 positives; all 88 negatives rejected.**
- **Channel selection disabled: 204/230.** All 26 losses are stereo cancellation cases.
- **Partial whitening disabled: 230/230.** Negative rejection is unchanged. No accuracy gain is demonstrated here.
- **Multiple candidates disabled: 230/230.** Positive success is unchanged, but 22 periodic-ambiguity cases switch from rejection to acceptance.
- **Short window disabled: 230/230.** No accuracy penalty from windowing is observed on this corpus.
- **Polarity support disabled: 204/230.** The 26 losses are 22 synthetic inversions and four inverted real-content variants.
- **audioscope: 178/230 positives.** Its 52 failures exactly match the union of the channel-policy and polarity-control failure sets; those sets do not overlap.

Thus the entire positive-case gap on this corpus corresponds to those two edge conditions. Both implementations pass the other 178 positives. The 16 combinations show no interaction in success counts, which is not a statistical proof that interactions do not exist elsewhere.

The 22 periodic cases also require care: they use 11 seed labels and two sample rates, but their pure-tone formula ignores the seed. There are only two distinct rate-specific waveforms. They are 22 test executions, not 22 independent pieces of evidence.

The single-candidate ablation also removes cross-candidate ambiguity rejection. It measures the combined “multiple-candidate refinement plus ambiguity check” policy, not refinement alone. Likewise, audioscope has no rejection state; the evaluation wrapper's `accepted: true` does not establish 88 false acceptances by the original API.

### 11.2 Runtime contributions are conditional

Main timing uses four recordings at 3 and 30 seconds, four warmups, 21 measured calls per group, and three passes. Variant order rotates and reverses by block. GC runs before the whole block, outside every timed call. This produces 504 blocks and 3,024 measured invocations.

For each component, define the ratio as “disabled time / complete time,” then take the median of the 12 recording-by-pass ratios:

- **Channel selection:** 1.332 at 3 seconds and 1.447 at 30 seconds. Enabling it reduces runtime by about 25% and 31%. The disabled version includes downmix allocation and full-length accumulation, so this is not merely a comparison of channel-scoring loops.
- **Partial whitening:** direction depends on content. Disabling it makes 3-second A/C/D about 35% slower but B about 8% faster. At 30 seconds, disabling it makes A about 12% slower and B/C/D about 9% faster.
- **Multiple candidates:** 1.005 at 3 seconds and 0.997 at 30 seconds. Changes are around ±2%, with no stable speed benefit.
- **Short window:** about 0.998 at 3 seconds, essentially unchanged, and 3.472 at 30 seconds. Long-input time falls from roughly 37 ms to 10.6 ms, a reduction of about 71%.

These are conditional differences with the other components enabled, not additive shares of a total speedup. They cannot be multiplied into the reported baseline ratio either. The long-window control retains our longer FIR and can be slower than the baseline; the saving from shortening that window can therefore exceed our total advantage over the baseline.

## 12. Why can adding whitening make an input faster?

Removing normalization should remove work. Why did it slow down some inputs? After the main experiment, we added explanatory work counters. All 40 instrumented return objects matched the uninstrumented variants; instrumented code was not used for timing.

The complete configuration exited after the first candidate on all eight recording-duration combinations, making 97 refinement-correlation calls. Without whitening, 3-second A/C/D and 30-second A lost that exit and made 291 calls. Those were exactly the combinations that became slower.

Window costs were visible as well. With the short window, each transform for a 30-second input had length 32,768 and the two FIR passes performed about 3.47 million multiply-accumulates. Using the full input increased those numbers to 131,072 and about 23.16 million. Refinement remained at 97 calls, locating the added work in filtering and FFTs.

We then ran a 2×2 timing experiment for whitening and multiple candidates while retaining channel selection and the short window. This was explicitly a post-hoc follow-up, with no algorithm threshold tuning. Once forced to a single candidate, disabling whitening was faster on all eight recording-duration combinations: about 6–13% less time for 3-second inputs and 8–10% less for 30-second inputs.

The evidence supports a precise account: **whitening costs computation, but for some recordings its changed coarse peaks trigger earlier termination of later search.** It does not support a positive-case accuracy claim for whitening on this corpus. Ordinary exact-copy timing also does not measure the full three-candidate cost on difficult inputs.

## 13. Reproduce the experiment, not just its headline

The operator and tests need Node.js 24+ and no additional npm dependencies. Real-content timing additionally requires the four local recordings, which are not committed. Cloning the repository alone cannot reproduce those measurements.

From the repository root, prepare your own `A.mp3` through `D.mp3`:

```sh
cd dsp-lab
node prepare-audio.mjs /path/to/audio-directory
npm test
npm run evaluate

# Final verification requires two timing files matching the current operator hash.
node --expose-gc timing.mjs
cp results/timing.json results/timing-pass-1.json
node --expose-gc timing.mjs
npm run verify
```

These commands update result files. Preserve the committed evidence first, or use a separate checkout. Different source recordings need not produce the timings in this article.

The ablation snapshots and original PCM hashes are frozen. Passing the original manifest checks requires the original experimental PCM:

```sh
node ablation/run.mjs accuracy > ablation/accuracy.log
node --expose-gc ablation/run.mjs bench > ablation/timing.log
node ablation/work-counts.mjs
node --expose-gc ablation/interaction.mjs > ablation/interaction.log
node ablation/run.mjs report > ablation/report.log
node ablation/run.mjs verify
```

The runner does not silently rebuild its snapshots. Initial `prepare` freezes the protocol and variants, refusing to overwrite an existing manifest. Changes to the original tests, corpus, baseline, operator, or PCM trigger verification failure. This prevents old results from validating new code and makes input mismatches explicit.

## 14. What we can claim, and what remains open

The experiments establish that stereo cancellation and overall polarity inversion need explicit handling; short windows can remove substantial long-input work; rejecting periodic ambiguity is useful behavior; local optimization must be measured in the actual operator; and ablation can change the explanation of an improvement.

They do not establish reliability for independent recordings, long-term clock drift, fractional-sample precision, strong nonlinear distortion, complex response changes, or unrepresentative local windows. Energy-based channel selection and early termination remain heuristics. Accepting 8–192 kHz inputs does not mean the entire range has been comprehensively evaluated.

The next useful step is independent, difficult material with annotated ground truth, testing the boundaries of whitening, candidate search, and window selection before simplifying the configuration. The default experimental operator remains unchanged after ablation.

## Source and evidence index

- [Delay and residual operator](audio-alignment-research.md) (`dsp-lab/operator.mjs`), [FFT implementation](audio-alignment-research.md) (`dsp-lab/fft.mjs`): the current calculation path.
- [Original unit tests](audio-alignment-research.md) (`dsp-lab/operator.test.mjs`), [added regressions](audio-alignment-research.md) (`dsp-lab/review-regressions.test.mjs`), [corpus generator](audio-alignment-research.md) (`dsp-lab/corpus.mjs`): constructions, tolerances, and assertions.
- [Original protocol](audio-alignment-research.md) (`dsp-lab/protocol.json`), [early development results](audio-alignment-research.md) (`dsp-lab/results/dev-round-1.json`), [historical timings](audio-alignment-research.md) (`dsp-lab/.cross-gan/baseline/`): including slower and unsuccessful stages.
- [Five-round checkpoint](audio-alignment-research.md) (`dsp-lab/.cross-gan/checkpoint.json`), [round artifacts](audio-alignment-research.md) (`dsp-lab/.cross-gan/run-20261016/`): proposals, refutations, repairs, reversions, and commits.
- [Complete-version verification](audio-alignment-research.md) (`dsp-lab/results/final-verification.json`), [additional confirmation and gain checks](audio-alignment-research.md) (`dsp-lab/results/confirmation.json`): final gates and measurement definitions.
- [Ablation documentation](audio-alignment-research.md) (`dsp-lab/ablation/README.md`), [case-level data](audio-alignment-research.md) (`dsp-lab/ablation/accuracy.json`), [three-pass timings](audio-alignment-research.md) (`dsp-lab/ablation/timing.json`), [summary](audio-alignment-research.md) (`dsp-lab/ablation/summary.json`), [verification](audio-alignment-research.md) (`dsp-lab/ablation/verification.json`): the evidence behind the attribution.

This article covers the work through ablation commit `dcc14d8` on `research/alignment-dsp-lab-20261016`. The research experiments preceded product integration; the current v0.6.0 integration is described at the top of this article. Article dates use Shanghai time; raw JSON timestamps use UTC.
