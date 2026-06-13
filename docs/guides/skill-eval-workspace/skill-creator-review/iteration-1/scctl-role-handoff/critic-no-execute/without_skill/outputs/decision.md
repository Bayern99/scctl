# Decision: Refuse to run `sc_eval`

**Verdict:** I cannot run `sc_eval`, and I will not do it — even as a "quick" check.

## Why I am refusing

1. **Direct SuperCollider execution is outside the critic role.**
   `docs/superpowers/roles/critic.md` states the critic's mission is to read the governed trace, add review notes, and recommend a verdict. It explicitly forbids "Any direct SuperCollider execution" and lists `sc_eval` as a forbidden path.

2. **The role-tool policy blocks it.**
   `docs/superpowers/kb/role-tool-policies.json` lists the critic's `forbidden_paths` as:
   - `sc_eval`
   - `sc_run_file`
   - `sc_render`
   - `sc_render_nrt`
   - `sc_run_probe`
   - `direct_supercollider_execution`

   Running `sc_eval` would violate this policy regardless of how small the snippet is.

3. **A "quick check" is still a raw-runtime shortcut.**
   In a governed session, raw runtime tools like `sc_eval` are operator/debug surfaces. Using them to verify creative work bypasses the Pilot route, leaves no governed trace, and makes later audit impossible.

## What I can do instead

My allowed tools are:

- `sc_audit_session`
- `sc_candidate_action` with `add_review`
- `sc_memory_summary`

## What the builder should do

The builder should run the verification through the governed path using their own allowed tool:

```text
sc_run_probe --code "{ ... your line of SuperCollider code ... }"
```

After the probe returns, I will:

1. Audit the session.
2. Read the probe result and governed trace.
3. Add a review note via `sc_candidate_action` with `add_review`.
4. Recommend retry, revision, promotion, acceptance, or archival.

## Bottom line

I am not a runtime executor. I am the critic. If you want a line of SuperCollider code checked, run it as a probe and I will review the trace.

## References

- `docs/superpowers/roles/critic.md` — critic mission, allowed tools, and forbidden paths
- `docs/superpowers/roles/sc-builder.md` — builder allowed tools, including `sc_run_probe`
- `docs/superpowers/kb/role-tool-policies.json` — canonical role-tool allowlists and forbidden paths
- `AGENTS.md` section 6 — governed loop and raw-runtime-tool intent
