# Sustained Tonal Carrier

- family: `sustained-tonal-carrier`
- candidate_name: `sustained-tonal-carrier-v1`
- probe_source: `sc/families/sustained-tonal-carrier/probe.scd`
- render_source: `sc/families/sustained-tonal-carrier/final-nrt.scd`
- preserved_behaviors:
  - slow amplitude contour on a stable sine carrier
  - gentle overtone layer without harsh transients
- failure_notes:
  - draft renders can clip if amplitude stack is too high
  - NRT closure requires absolute paths and a valid `\score` Event
- review_focus:
  - sustain stability
  - overtone balance
  - release tail cleanliness

Dogfood reference: governed loop exercised via `tests/workflow/governed-loop.test.ts` and operator runbook examples.
