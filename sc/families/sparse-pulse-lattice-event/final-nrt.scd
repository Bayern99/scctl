(
var defBytes;

defBytes = SynthDef(\scctl_lattice_nrt, { |out = 0, freq = 196, amp = 0.1, gate = 1|
  var density = Line.kr(2.0, 4.0, 2.6);
  var trig = Impulse.kr(density);
  var env = Decay2.kr(trig, 0.002, 0.08);
  var sig = Pulse.ar(freq * [1, 1.5], 0.16, 0.2).sum * env;
  sig = BPF.ar(sig, TExpRand.kr(480, 2800, trig), 0.16);
  sig = sig * amp * Lag.kr(gate, 0.02);
  Out.ar(out, Pan2.ar(sig, LFNoise1.kr(0.35).range(-0.45, 0.45)));
}).asBytes;

(
  score: [
    [0.0, [\d_recv, defBytes]],
    [0.0, [\s_new, \scctl_lattice_nrt, 1000, 0, 0, \freq, 196, \amp, 0.12]],
    [2.8, [\n_set, 1000, \gate, 0]]
  ],
  duration: 3.3,
  sample_rate: 48000,
  sample_format: "float",
  channel_count: 2
)
)
