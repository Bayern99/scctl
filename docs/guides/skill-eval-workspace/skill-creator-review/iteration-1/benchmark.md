# Skill Benchmark: scctl-skills-review

**Date**: 2026-06-13T16:47:16Z
**Evals**: 6

## Summary

| Metric | With Skill | Without Skill | Delta |
|--------|-----------|---------------|-------|
| Pass Rate | 100% ± 0% | 100% ± 0% | +0.00 |
| Time | 65.7s ± 57.1s | 61.5s ± 37.4s | +4.2s |
| Tokens | 0 ± 0 | 0 ± 0 | +0 |

## Notes

- All evals achieved 100% pass rate in both with-skill and without-skill configurations.
- Baseline (without skill) performs correctly because project docs (AGENTS.md, role-tool-policies.json, operator-runbook.md) are explicit.
- Skill value is qualitative: with-skill outputs cite the skill and canonical files more directly; without-skill outputs perform broader file searches.
- Average execution time is similar between configurations; per-skill variance is high due to only one run per eval.

## Per-run Results

| Eval | Config | Pass Rate | Time |
|------|--------|-----------|------|
| scctl-draft-vs-final / draft-as-final | with_skill | 4/4 | 34.3s |
| scctl-draft-vs-final / draft-as-final | without_skill | 4/4 | 33.5s |
| scctl-draft-vs-final / quick-draft-explore | with_skill | 3/3 | 42.7s |
| scctl-draft-vs-final / quick-draft-explore | without_skill | 3/3 | 36.7s |
| scctl-governed-loop / final-nrt-closure | with_skill | 8/8 | 179.7s |
| scctl-governed-loop / final-nrt-closure | without_skill | 8/8 | 131.6s |
| scctl-governed-loop / raw-eval-shortcut | with_skill | 4/4 | 61.2s |
| scctl-governed-loop / raw-eval-shortcut | without_skill | 4/4 | 53.9s |
| scctl-role-handoff / builder-final-nrt-allowlist | with_skill | 5/5 | 49.1s |
| scctl-role-handoff / builder-final-nrt-allowlist | without_skill | 5/5 | 73.4s |
| scctl-role-handoff / critic-no-execute | with_skill | 3/3 | 26.9s |
| scctl-role-handoff / critic-no-execute | without_skill | 3/3 | 39.8s |