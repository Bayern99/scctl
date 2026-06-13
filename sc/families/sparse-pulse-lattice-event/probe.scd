(
SynthDef(\scctl_lattice_probe, { |out = 0, freq = 220, amp = 0.1|
  var trig = Impulse.kr(3.0);
  var env = Decay2.kr(trig, 0.002, 0.09);
  var sig = Pulse.ar(freq * [1, 1.5], 0.18, 0.24).sum * env;
  sig = BPF.ar(sig, TExpRand.kr(500, 3200, trig), 0.18);
  sig = sig * amp;
  Out.ar(out, Pan2.ar(sig, LFNoise1.kr(0.4).range(-0.4, 0.4)));
}).add;

x = Synth(\scctl_lattice_probe, [\freq, 196, \amp, 0.12]);

Routine({
  2.2.wait;
  x.free;
}).play;
)
