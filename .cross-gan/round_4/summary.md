# Pre-release review: accepted fixes

Three independent finders plus a root interpolation candidate; both independent discriminators confirmed all four defects and verified the actual fixes. No new performance optimization was accepted.

- C4-1: Align polar projection and lookup with angular deposition.
- C4-2: Fold negative-mid PCM without false anti-phase classification.
- C4-3: Bound polar interpolation at first and last bin centers.
- R4-R1: Validate external headphone EQ before restoring or installing profiles.

Baseline: 76 suites / 622 passed / 1 skipped. Final: 78 suites / 646 passed / 1 skipped. All 15 original benchmark cases and unchanged speed/size gates passed. Frozen old polar geometry output is intentionally different; current geometry and strict energy checks pass. No commits or publication.
