'use strict';

// ---------------------------------------------------------------------------
// Synthesised sound (Web Audio). Nothing is loaded from disk: engines are
// oscillators through a filter, effects are shaped noise bursts and tones.
// The context can only start after a key press, so init() is called from input.
// Effects and engines go through `fx`, whose level N steps through; the music
// has its own level (M, see music.js). Both feed `master`.
// ---------------------------------------------------------------------------

// Volume steps, in the order a key press moves through them.
const VOLUME_STEPS = [['HIGH', 1], ['OFF', 0], ['LOW', 0.25], ['MID', 0.5]];
const volumeStep = name => Math.max(0, VOLUME_STEPS.findIndex(([n]) => n === name));

const Sfx = {
  ctx: null,
  master: null,
  fx: null,
  vol: 0,           // index into VOLUME_STEPS
  noise: null,

  get muted() { return VOLUME_STEPS[this.vol][1] === 0; },

  load() {
    try { this.vol = volumeStep(localStorage.getItem('drive-challenge.sound')); } catch (e) { /* storage blocked */ }
  },

  // Next volume step for the effects; returns its name for the on-screen note.
  cycle() {
    this.vol = (this.vol + 1) % VOLUME_STEPS.length;
    try { localStorage.setItem('drive-challenge.sound', VOLUME_STEPS[this.vol][0]); } catch (e) { /* ignore */ }
    if (this.fx) this.fx.gain.setTargetAtTime(VOLUME_STEPS[this.vol][1], this.ctx.currentTime, 0.02);
    return VOLUME_STEPS[this.vol][0];
  },

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.fx = this.ctx.createGain();
    this.fx.gain.value = VOLUME_STEPS[this.vol][1];
    this.fx.connect(this.master);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  },

  tone(freq, dur, type, vol, delay) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol || 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.fx);
    o.start(t);
    o.stop(t + dur + 0.05);
  },

  noiseBurst(dur, filterFreq, vol, type) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.fx);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  },

  beep(freq, dur) { this.tone(freq, dur, 'square', 0.18); },
  blip() { this.tone(660, 0.06, 'square', 0.1); },
  select() { this.tone(520, 0.07, 'square', 0.12); this.tone(1040, 0.1, 'square', 0.12, 0.07); },
  checkpoint() { [784, 988, 1175].forEach((f, i) => this.tone(f, 0.12, 'square', 0.14, i * 0.08)); },
  outOfTime() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.25, 'sawtooth', 0.14, i * 0.18)); },
  fanfare(good) {
    const notes = good ? [523, 659, 784, 1047, 784, 1047] : [392, 349, 330, 262];
    notes.forEach((f, i) => this.tone(f, 0.18, 'square', 0.14, i * 0.12));
  },
  crash() { this.noiseBurst(0.6, 500, 0.9); this.tone(70, 0.4, 'sawtooth', 0.3); },
  bump() { this.noiseBurst(0.18, 900, 0.5); },

  // A looping engine voice that follows a car's revs and throttle.
  engine(def, volume) {
    if (!this.ctx) return null;
    const ac = this.ctx, E = def.engine;
    const out = ac.createGain();
    out.gain.value = 0;
    out.connect(this.fx);

    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 3;
    filter.connect(out);

    const main = ac.createOscillator();
    main.type = 'sawtooth';
    main.connect(filter);
    const subGain = ac.createGain();
    subGain.gain.value = E.sub;
    const sub = ac.createOscillator();
    sub.type = 'square';
    sub.connect(subGain).connect(filter);

    // Roughness: amplitude wobble at the firing rate.
    const wobble = ac.createOscillator();
    const wobbleGain = ac.createGain();
    wobbleGain.gain.value = E.rough * 0.15 * volume;
    wobble.connect(wobbleGain).connect(out.gain);

    let whistle = null, whistleGain = null;
    if (E.turbo) {
      whistle = ac.createOscillator();
      whistle.type = 'sine';
      whistleGain = ac.createGain();
      whistleGain.gain.value = 0;
      whistle.connect(whistleGain).connect(out);
      whistle.start();
    }

    // Tyre squeal: band-passed noise.
    const squeal = ac.createBufferSource();
    squeal.buffer = this.noise;
    squeal.loop = true;
    const sqFilter = ac.createBiquadFilter();
    sqFilter.type = 'bandpass';
    sqFilter.frequency.value = 1800;
    sqFilter.Q.value = 8;
    const sqGain = ac.createGain();
    sqGain.gain.value = 0;
    squeal.connect(sqFilter).connect(sqGain).connect(this.fx);

    main.start(); sub.start(); wobble.start(); squeal.start();
    let lastThrottle = 0;

    return {
      update(rpm, throttle, skid, offroad) {
        const t = ac.currentTime;
        const r = U.clamp((rpm - PHYS.IDLE_RPM) / (def.redline - PHYS.IDLE_RPM), 0, 1.1);
        const f = E.low + (E.high - E.low) * r;
        main.frequency.setTargetAtTime(f, t, 0.03);
        sub.frequency.setTargetAtTime(f / 2, t, 0.03);
        wobble.frequency.setTargetAtTime(f / 4, t, 0.03);
        filter.frequency.setTargetAtTime(300 + 900 * throttle + 1600 * r, t, 0.05);
        out.gain.setTargetAtTime(volume * (0.22 + 0.18 * throttle + 0.1 * r), t, 0.05);
        if (whistleGain) {
          whistle.frequency.setTargetAtTime(2200 + 2600 * r, t, 0.1);
          whistleGain.gain.setTargetAtTime(E.turbo * throttle * r * volume, t, 0.15);
          // Blow-off valve when lifting at high revs.
          if (lastThrottle > 0.5 && throttle < 0.1 && r > 0.5) Sfx.noiseBurst(0.25, 3000, 0.12 * volume, 'highpass');
        }
        lastThrottle = throttle;
        const sq = Math.max(skid, offroad ? 0.25 : 0);
        sqFilter.frequency.setTargetAtTime(offroad ? 500 : 1800, t, 0.05);
        sqGain.gain.setTargetAtTime(sq * 0.35 * volume, t, 0.05);
      },
      stop() {
        const t = ac.currentTime;
        out.gain.setTargetAtTime(0, t, 0.05);
        wobbleGain.gain.setTargetAtTime(0, t, 0.05);
        sqGain.gain.setTargetAtTime(0, t, 0.05);
        if (whistleGain) whistleGain.gain.setTargetAtTime(0, t, 0.05);
        setTimeout(() => {
          for (const node of [main, sub, wobble, squeal, whistle]) if (node) try { node.stop(); } catch (e) { /* already stopped */ }
          out.disconnect();
          sqGain.disconnect();
        }, 300);
      },
    };
  },

  // Steady hiss of rain while racing in spring.
  ambience(kind) {
    if (!this.ctx || kind !== 'rain') return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2500;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    src.connect(f).connect(g).connect(this.fx);
    src.start();
    return { stop: () => { try { src.stop(); } catch (e) { /* ignore */ } g.disconnect(); } };
  },
};
