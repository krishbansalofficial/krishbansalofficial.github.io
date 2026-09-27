// The "ta-dum" login sting. If public/audio/tadum.mp3 exists it is played;
// otherwise an original sting is synthesized with the Web Audio API.
// Browsers only allow audio after a user gesture, so call this from a click
// handler, e.g. when a profile is picked. Passing an OfflineAudioContext
// renders the synthesized sting without playing it (used for testing).
const SAMPLE_URL = 'audio/tadum.mp3';
let ctx;
let sample = typeof Audio === 'function' ? Object.assign(new Audio(SAMPLE_URL), { preload: 'auto' }) : null;

export function playTadum(target) {
  if (target || !sample) return synthTadum(target);
  sample.currentTime = 0;
  sample.play().catch((err) => {
    if (err.name === 'NotAllowedError') return; // blocked by autoplay policy: stay silent
    sample = null; // file missing or undecodable: use the synth from now on
    synthTadum();
  });
}

function synthTadum(target) {
  let ac;
  try {
    ac = target ?? (ctx ??= new (window.AudioContext || window.webkitAudioContext)());
    if (!target && ac.state === 'suspended') ac.resume();
  } catch {
    return; // no Web Audio support: stay silent
  }

  const start = ac.currentTime + 0.03;

  // Master bus: dry signal plus a synthetic reverb tail, glued by a compressor.
  const master = ac.createGain();
  master.gain.value = 0.95;
  const comp = ac.createDynamicsCompressor();
  const reverb = ac.createConvolver();
  reverb.buffer = impulseResponse(ac, 2.6, 2.8);
  const wet = ac.createGain();
  wet.gain.value = 0.4;
  master.connect(comp);
  master.connect(reverb).connect(wet).connect(comp);
  comp.connect(ac.destination);

  // "ta": a short, muted low hit.
  hit(ac, master, start, { freqs: [98, 146.8], dur: 0.32, peak: 0.7, cutoff: 800 });
  // "DUM": a wide low chord (A1, E2, A2, E3) that opens up then decays.
  hit(ac, master, start + 0.38, { freqs: [55, 82.4, 110, 164.8], dur: 2.8, peak: 0.85, cutoff: 1600, endCutoff: 160 });
}

function hit(ac, out, t, { freqs, dur, peak, cutoff, endCutoff = cutoff / 3 }) {
  const env = ac.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(peak, t + 0.015);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.8;
  filter.frequency.setValueAtTime(cutoff, t);
  filter.frequency.exponentialRampToValueAtTime(endCutoff, t + dur);
  filter.connect(env).connect(out);

  // Each note is two slightly detuned saws (width) plus a sine an octave down (weight).
  for (const f of freqs) {
    for (const [type, freq, detune, level] of [
      ['sawtooth', f, -7, 0.18],
      ['sawtooth', f, 7, 0.18],
      ['sine', f / 2, 0, 0.5],
    ]) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detune;
      gain.gain.value = level / freqs.length;
      osc.connect(gain).connect(filter);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }

  // A tiny noise burst gives the attack its "thump".
  const noise = ac.createBufferSource();
  noise.buffer = noiseBuffer(ac, 0.06);
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 180;
  const noiseGain = ac.createGain();
  noiseGain.gain.value = peak * 0.6;
  noise.connect(band).connect(noiseGain).connect(out);
  noise.start(t);
}

function noiseBuffer(ac, seconds) {
  const buffer = ac.createBuffer(1, Math.ceil(ac.sampleRate * seconds), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  return buffer;
}

// Exponentially decaying stereo noise works as a cheap hall reverb.
function impulseResponse(ac, seconds, decay) {
  const length = Math.ceil(ac.sampleRate * seconds);
  const buffer = ac.createBuffer(2, length, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
  }
  return buffer;
}
