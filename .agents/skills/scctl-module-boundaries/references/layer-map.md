# Layer map (excerpt from AGENTS.md §3)

Full table lives in repository root `AGENTS.md`. Update AGENTS first; keep this file as a short mirror only.

Transport calls runtime; workflow/lab/archive call runtime through driver interfaces — never import `SclangController` from lab.

Orchestration writes `.scctl/governed-role` via harness helper; hooks read it; do not move marker logic into Cursor skills.

Tests mirror src layout: `src/runtime/*` → `tests/runtime/*`, etc.
