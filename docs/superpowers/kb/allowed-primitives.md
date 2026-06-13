# Allowed Primitives

- Start with foundational UGens and patterns that are easy to audit.
- Examples:
  - `SinOsc`, `Saw`, `Pulse`, `WhiteNoise`, `PinkNoise`
  - `EnvGen`, `LPF`, `HPF`, `BPF`, `Pan2`, `Mix`
  - `Pbind`, `Pseq`, `Prand`, `Pwhite`
- Current bootstrap families in `sc/families/`:
  - `sustained-tonal-carrier`
  - `filtered-noise-breath-texture`
  - `sparse-pulse-lattice-event`
- Keep this list sparse at first; do not pretend the Zhou Yi primitive ontology is already settled.
- Expand only when a primitive proves useful in governed probe loops.
