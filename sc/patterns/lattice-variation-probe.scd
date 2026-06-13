(
Pbind(
  \instrument, \default,
  \dur, Prand([0.125, 0.25, 0.375], inf),
  \midinote, Pseq([45, 52, 57, 59], inf),
  \amp, Pwhite(0.04, 0.09, inf),
  \pan, Pwhite(-0.35, 0.35, inf)
).play;
)
