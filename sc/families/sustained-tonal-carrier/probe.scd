(
SynthDef(\scctl_tonal_probe, { |out = 0, freq = 164.81, amp = 0.12, gate = 1|
  var env = EnvGen.kr(Env.asr(0.02, 1.0, 1.4), gate, doneAction: 2);
  var sig = Mix([
    SinOsc.ar(freq, 0, 0.55),
    SinOsc.ar(freq * 0.5, 0, 0.18),
    Saw.ar(freq * 2.0, 0.08)
  ]);
  sig = LPF.ar(sig, XLine.kr(2200, 1100, 2.0));
  sig = sig * amp * env;
  Out.ar(out, Pan2.ar(sig, 0));
}).add;

x = Synth(\scctl_tonal_probe, [
  \freq, 164.81,
  \amp, 0.14
]);

Routine({
  2.4.wait;
  x.set(\gate, 0);
}).play;
)
