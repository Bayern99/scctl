(
var defBytes;

defBytes = SynthDef(\scctl_breath_nrt, { |out = 0, amp = 0.1, gate = 1|
  var env = EnvGen.kr(Env.asr(0.06, 1.0, 1.4), gate, doneAction: 2);
  var noise = PinkNoise.ar(1.0);
  var motion = LFNoise1.kr(0.16).exprange(700, 4200);
  var sig = BPF.ar(noise, motion, 0.18);
  sig = HPF.ar(sig, 140);
  sig = sig * amp * env;
  Out.ar(out, Pan2.ar(sig, 0));
}).asBytes;

(
  score: [
    [0.0, [\d_recv, defBytes]],
    [0.0, [\s_new, \scctl_breath_nrt, 1000, 0, 0, \amp, 0.12]],
    [2.9, [\n_set, 1000, \gate, 0]]
  ],
  duration: 3.5,
  sample_rate: 48000,
  sample_format: "float",
  channel_count: 2
)
)
