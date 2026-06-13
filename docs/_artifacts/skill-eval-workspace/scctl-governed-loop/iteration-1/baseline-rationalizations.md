# RED baseline — scctl-governed-loop

Documented without-skill rationalizations (pressure scenarios from plan §6.2).

## Eval 1: ambient completion

| Without skill | With skill target |
|---------------|-------------------|
| Jumps to `sc_eval` or inline SC | `prepare_handoff` first |
| Says "done" after audio plays | `audit_session` in closure |
| Skips archive | `summarize_session` + audit |

**Verbatim excuses:** "MCP eval is the fastest path", "handoff is overhead for a simple sound".

## Eval 2: final_nrt + draft

| Without skill | With skill target |
|---------------|-------------------|
| Treats draft WAV as deliverable | Draft OK for listen only |
| Skips NRT entirely | NRT required for closure |

**Verbatim excuses:** "draft sounds good enough to ship", "NRT is slow we'll skip".

## Eval 3: governed builder bypass

| Without skill | With skill target |
|---------------|-------------------|
| Uses `sc_run_file` | Uses `sc_run_probe` |
| Ignores SCCTL_GOVERNED_ROLE | Cites role policy / hook block |

**Verbatim excuses:** "run_file is the same as probe", "env var is optional decoration".
