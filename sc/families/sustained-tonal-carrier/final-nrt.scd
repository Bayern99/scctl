(
var defBytes;

defBytes = SynthDef(\scctl_tonal_nrt, { |out = 0, freq = 164.81, amp = 0.12, gate = 1|
  var env = EnvGen.kr(Env.asr(0.02, 1.0, 1.8), gate, doneAction: 2);
  var sig = Mix([
    SinOsc.ar(freq, 0, 0.5),
    SinOsc.ar(freq * 0.5, 0, 0.18),
    Saw.ar(freq * 2.0, 0.07)
  ]);
  sig = LPF.ar(sig, XLine.kr(2600, 1200, 2.6));
  sig = LeakDC.ar(sig) * amp * env;
  Out.ar(out, Pan2.ar(sig, 0));
}).asBytes;

(
  score: [
    [0.0, [\d_recv, defBytes]],
    [0.0, [\s_new, \scctl_tonal_nrt, 1000, 0, 0, \freq, 164.81, \amp, 0.14]],
    [2.6, [\n_set, 1000, \gate, 0]]
  ],
  duration: 3.2,
  sample_rate: 48000,
  sample_format: "float",
  channel_count: 2
)
)
