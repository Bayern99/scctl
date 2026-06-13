(
SynthDef(\scctl_breath_probe, { |out = 0, amp = 0.12, gate = 1|
  var env = EnvGen.kr(Env.asr(0.08, 1.0, 1.2), gate, doneAction: 2);
  var noise = PinkNoise.ar(1.0);
  var motion = LFNoise1.kr(0.18).exprange(650, 3800);
  var sig = BPF.ar(noise, motion, 0.22);
  sig = HPF.ar(sig, 120);
  sig = sig * amp * env;
  Out.ar(out, Pan2.ar(sig, 0));
}).add;

x = Synth(\scctl_breath_probe, [\amp, 0.11]);

Routine({
  2.8.wait;
  x.set(\gate, 0);
}).play;
)
