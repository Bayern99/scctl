(
Pbind(
  \instrument, \default,
  \dur, Pseq([0.125, 0.25, 0.125, 0.5], 2),
  \midinote, Pseq([48, 50, 53, 55, 53, 50], 1),
  \amp, Pseq([0.05, 0.08, 0.06, 0.09], 2),
  \legato, Pwhite(0.18, 0.5, inf)
).play;
)
