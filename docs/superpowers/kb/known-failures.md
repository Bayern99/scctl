# Known Failures

- Raw SC execution happened outside governed workflow tools, so no durable trace exists.
- A render task ended without a non-empty render artifact.
- A session ended without `summarize_session`, so later audit and memory are weak.
- Candidate promotion was attempted without an explicit review note.
- The loop drifted into Python or external sidecars instead of `sc_run_probe`.
