# SuperCollider smoke troubleshooting

Use this when local `scctl check`, `run`, or `render` fails outside CI. CI does not install SuperCollider; failures here are environment-specific.

## Quick smoke

```bash
npm run build
node dist/cli.js check
node dist/cli.js render fixtures/smoke/sine-play.scd -o /tmp/scctl-smoke.wav -d 2
test -s /tmp/scctl-smoke.wav
```

`check` should return structured JSON with `success: true`, a non-error `state`, and a useful `summary`.

## Symptoms

| Symptom | What to try |
|---------|-------------|
| `error_kind: boot_timeout` | Inspect `raw_output`; kill stale `scsynth` / `sclang` (`pkill -f scsynth`, `pkill -f sclang`) and retry `scctl reclaim` or `scctl health` |
| `error_kind: sc_runtime_error` | Read `raw_output` first; then use `scctl logs --tail 1000` to inspect recent post output |
| `error_kind: render_failed` with 0-byte WAV | Re-run the same `.scd` through `scctl run path/to/file.scd` and inspect `raw_output` plus logs |
| `state: degraded` | Use `scctl reclaim` first; if that fails, `scctl reboot` |
| macOS SIGABRT / no audio | Check Audio MIDI Setup; quit DAWs or apps that are holding the output device |
| `check` succeeds but `health` says server not ready | Use `scctl reboot` or `scctl reclaim` to rebuild a fresh ready session |

## Manual cleanup

If audio behaves oddly after `sc_stop`, `scctl reclaim`, or CLI exit:

```bash
pkill -f scsynth
pkill -f sclang
```

## CI vs local

GitHub Actions runs mock-based tests only (no `sclang` install). A green CI does not prove render works on your machine — use the smoke commands above locally, and prefer `npm run test:live` when you want a real engine check.

## Related

- [scctl scope enhancement design](design/scctl-scope-enhancement.md)
- [README smoke section](../README.md)
