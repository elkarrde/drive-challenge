'use strict';

// ---------------------------------------------------------------------------
// Chiptune music: a small step sequencer on top of Sfx's audio context.
// Each song is a chord progression plus a hand-written lead line; bass,
// arpeggios and drums are generated from the chords in the song's style.
// Notes are scheduled a little ahead of time from the main loop.
// ---------------------------------------------------------------------------

// Lead lines are "NOTE:steps" tokens (16 steps per bar); "." is a rest.
const SONGS = {
  title: {
    bpm: 128, lead: 'pulse', bass: 'drive', arp: 'up',
    drums: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    parts: [
      { chords: 'Cm Cm Ab G', lead: '', drums: 'hats' },
      {
        chords: 'Cm Ab Eb Bb Cm Ab Bb G',
        lead: 'G5:4 C6:4 Eb6:4 D6:2 C6:2 | C6:4 Ab5:4 Eb5:8 | G5:4 Bb5:4 Eb6:4 F6:2 G6:2 | F6:8 D6:4 Bb5:4 |' +
              'G5:4 C6:4 Eb6:4 G6:4 | Ab6:4 G6:2 F6:2 Eb6:4 C6:4 | D6:4 Eb6:2 F6:2 D6:4 Bb5:4 | B5:8 D6:4 G6:4',
      },
      {
        chords: 'Fm Cm Ab G Fm Cm Bb G',
        lead: 'Ab5:6 G5:2 F5:4 C6:4 | Eb6:6 D6:2 C6:8 | C6:4 Eb6:4 Ab6:4 G6:2 F6:2 | G6:8 D6:4 B5:4 |' +
              'F6:4 Eb6:2 D6:2 C6:4 Ab5:4 | G5:4 C6:4 Eb6:8 | D6:4 F6:4 Bb6:4 Ab6:2 G6:2 | G6:4 F6:4 D6:4 B5:4',
        fill: true,
      },
    ],
    order: [0, 1, 2], loop: 1,
  },

  // Autumn: A minor, driving and a little wistful.
  autumn: {
    bpm: 136, lead: 'pulse', bass: 'drive', arp: 'up',
    drums: { k: 'x.......x.x.....', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    parts: [
      { chords: 'Am Am F G', lead: '', drums: 'hats' },
      {
        chords: 'Am F C G Am F G E',
        lead: 'E5:4 A5:2 G5:2 E5:4 D5:2 C5:2 | D5:2 C5:2 A4:4 C5:8 | E5:4 G5:2 E5:2 C6:4 B5:2 G5:2 | B5:6 A5:2 G5:8 |' +
              'E5:4 A5:2 G5:2 E5:4 D5:2 C5:2 | D5:2 C5:2 A4:2 C5:2 F5:4 E5:2 D5:2 | D5:4 B4:2 D5:2 G5:4 F5:2 D5:2 | B4:2 E5:2 G#5:8 .:4',
      },
      {
        chords: 'Dm Am Dm E F G Am Am',
        lead: 'F5:6 E5:2 D5:4 A4:4 | C5:6 B4:2 A4:8 | F5:4 A5:4 G5:2 F5:2 E5:2 D5:2 | E5:8 G#5:4 B5:4 |' +
              'A5:4 G5:2 F5:2 C6:8 | B5:4 A5:2 G5:2 D5:8 | E5:2 A5:2 C6:2 B5:2 A5:4 E5:4 | A5:12 .:4',
        fill: true,
      },
    ],
    order: [0, 1, 2], loop: 1,
  },

  // Winter: D minor, slower and sparse, bell lead over chip chords.
  winter: {
    bpm: 112, lead: 'bell', bass: 'quarters', arp: 'chip',
    drums: { k: 'x.......x.......', s: '........x.......', h: 'x...x...x...x.x.' },
    parts: [
      { chords: 'Dm Dm Bb A', lead: '', drums: false },
      {
        chords: 'Dm Bb F C Dm Bb Gm A',
        lead: 'A5:6 F5:2 D5:8 | D6:6 C6:2 Bb5:8 | A5:4 C6:4 F5:8 | G5:6 E5:2 C5:8 |' +
              'A5:6 F5:2 D5:4 E5:2 F5:2 | G5:6 F5:2 D5:8 | Bb5:4 A5:4 G5:4 D5:4 | C#5:8 E5:4 A5:4',
      },
      {
        chords: 'Gm Dm Bb A Gm Dm Bb A7',
        lead: 'D6:8 Bb5:4 G5:4 | A5:8 F5:4 D5:4 | F5:4 Bb5:4 D6:4 C6:2 Bb5:2 | A5:12 .:4 |' +
              'G5:4 Bb5:4 D6:8 | F6:4 E6:4 D6:4 A5:4 | Bb5:4 C6:4 D6:4 F6:4 | E6:8 C#6:4 A5:4',
        fill: true,
      },
    ],
    order: [0, 1, 2], loop: 1,
  },

  // Spring: F major, bouncy despite the rain.
  spring: {
    bpm: 144, lead: 'pulse', bass: 'bounce', arp: 'up',
    drums: { k: 'x.....x...x.....', s: '....x.......x..x', h: '..x...x...x...x.' },
    parts: [
      { chords: 'F F Bb C', lead: '', drums: 'hats' },
      {
        chords: 'F C Dm Bb F C Bb C',
        lead: 'C5:2 F5:2 A5:2 C6:2 A5:4 F5:4 | G5:2 E5:2 C5:2 E5:2 G5:8 | F5:2 A5:2 D6:2 A5:2 F5:4 D5:4 | D5:2 F5:2 Bb5:4 A5:4 G5:4 |' +
              'A5:4 C6:2 A5:2 F5:4 A5:4 | G5:4 E5:2 G5:2 C6:8 | Bb5:4 A5:2 G5:2 F5:2 G5:2 A5:4 | G5:8 E5:4 C5:4',
      },
      {
        chords: 'Bb C Am Dm Bb C F F',
        lead: 'D6:4 C6:4 Bb5:4 F5:4 | E5:2 G5:2 C6:4 Bb5:4 G5:4 | C6:4 A5:4 E5:4 A5:4 | F5:4 D5:2 F5:2 A5:8 |' +
              'Bb5:2 A5:2 Bb5:2 D6:2 F6:8 | E6:4 D6:2 C6:2 Bb5:4 G5:4 | A5:4 C6:4 F6:4 C6:4 | F6:8 .:8',
        fill: true,
      },
    ],
    order: [0, 1, 2], loop: 1,
  },

  // Summer: G major, fast and sunny, four on the floor.
  summer: {
    bpm: 152, lead: 'pulse', bass: 'drive', arp: 'up',
    drums: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.' },
    parts: [
      { chords: 'G G C D', lead: '', drums: 'hats' },
      {
        chords: 'G D Em C G D C D',
        lead: 'B5:2 D6:2 B5:2 G5:2 A5:4 B5:4 | A5:2 F#5:2 D5:4 A5:4 F#5:4 | G5:2 B5:2 E6:4 D6:4 B5:4 | C6:4 B5:2 A5:2 G5:4 E5:4 |' +
              'D5:2 G5:2 B5:2 D6:2 G6:8 | F#6:4 E6:2 D6:2 A5:8 | E6:4 D6:2 C6:2 G5:4 C6:4 | A5:8 F#5:4 D5:4',
      },
      {
        chords: 'C D Bm Em C D G G',
        lead: 'E5:4 G5:4 C6:6 B5:2 | A5:4 F#5:4 D6:8 | D6:4 B5:4 F#5:4 B5:4 | G5:4 E5:4 B5:8 |' +
              'C6:2 D6:2 E6:4 G6:4 E6:4 | F#6:4 E6:2 D6:2 A5:4 D6:4 | B5:4 D6:4 G6:4 D6:4 | G6:12 .:4',
        fill: true,
      },
    ],
    order: [0, 1, 2], loop: 1,
  },
};

const NOTE_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const CHORD_SHAPES = { '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], m7: [0, 3, 7, 10] };

function noteMidi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  return NOTE_PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}

function parseChord(name) {
  const m = /^([A-G][#b]?)(.*)$/.exec(name);
  const root = U.mod(noteMidi(m[1] + '0') - 12, 12);
  return { root, shape: CHORD_SHAPES[m[2]] };
}

// Turn a lead string into one entry per step: {midi, steps} on note starts.
function parseLead(str, steps) {
  const out = new Array(steps).fill(null);
  let pos = 0;
  for (const tok of str.replace(/\|/g, ' ').split(/\s+/).filter(Boolean)) {
    const [n, d] = tok.split(':');
    const len = Number(d);
    if (n !== '.') out[pos] = { midi: noteMidi(n), steps: len };
    pos += len;
  }
  if (str && pos !== steps) throw new Error('lead is ' + pos + ' steps, expected ' + steps);
  return out;
}

const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

function compileSongs() {
  for (const song of Object.values(SONGS)) {
    for (const part of song.parts) {
      part.bars = part.chords.split(' ').map(parseChord);
      part.leadSteps = parseLead(part.lead, part.bars.length * 16);
    }
  }
}
compileSongs();

// ---- player -----------------------------------------------------------------
const Music = {
  vol: 0,           // index into VOLUME_STEPS (audio.js)
  want: null,        // id of the song that should be playing
  song: null,
  id: null,
  paused: false,
  levelK: 1,
  out: null,
  waves: {},

  init() {
    try {
      // Older versions stored 'on' / 'off'.
      const saved = localStorage.getItem('drive-challenge.music');
      this.vol = volumeStep(saved === 'off' ? 'OFF' : saved);
    } catch (e) { /* storage blocked */ }
  },

  setup() {
    const ac = Sfx.ctx;
    this.out = ac.createGain();
    this.out.gain.value = 0;
    this.out.connect(Sfx.master);
    // Echo on the lead, a classic tracker trick.
    this.echoIn = ac.createGain();
    const delay = ac.createDelay(1);
    const fb = ac.createGain();
    const wet = ac.createGain();
    fb.gain.value = 0.3;
    wet.gain.value = 0.28;
    this.echoIn.connect(delay);
    delay.connect(fb).connect(delay);
    delay.connect(wet).connect(this.out);
    this.delay = delay;
    for (const duty of [0.125, 0.25, 0.5]) this.waves[duty] = this.pulseWave(duty);
  },

  // Band-limited pulse wave of the given duty cycle.
  pulseWave(duty) {
    const n = 32, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) re[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty);
    return Sfx.ctx.createPeriodicWave(re, im);
  },

  play(id) { this.want = id; },
  stop() { this.want = null; },
  pause(on) {
    this.paused = on;
    if (!on && this.song) this.nextTime = Math.max(this.nextTime, Sfx.ctx.currentTime + 0.05);
    this.applyLevel();
  },
  level(k) { this.levelK = k; this.applyLevel(); },

  get enabled() { return VOLUME_STEPS[this.vol][1] > 0; },

  // Next volume step for the music; returns its name for the on-screen note.
  cycle() {
    this.vol = (this.vol + 1) % VOLUME_STEPS.length;
    try { localStorage.setItem('drive-challenge.music', VOLUME_STEPS[this.vol][0]); } catch (e) { /* ignore */ }
    this.applyLevel();
    return VOLUME_STEPS[this.vol][0];
  },

  applyLevel() {
    if (!this.out) return;
    const on = this.enabled && !this.paused && this.song;
    this.out.gain.setTargetAtTime(on ? 0.42 * this.levelK * VOLUME_STEPS[this.vol][1] : 0, Sfx.ctx.currentTime, 0.04);
  },

  // Called every frame: start/switch songs and schedule notes ahead.
  update() {
    if (!Sfx.ctx) return;
    if (!this.out) this.setup();
    const ac = Sfx.ctx;
    if (this.want !== this.id) {
      this.id = this.want;
      this.song = this.id ? SONGS[this.id] : null;
      if (this.song) {
        this.orderIdx = 0;
        this.bar = 0;
        this.step = 0;
        this.nextTime = ac.currentTime + 0.1;
        this.delay.delayTime.value = (60 / this.song.bpm) * 0.75;
      }
      this.applyLevel();
    }
    if (!this.song || this.paused || !this.enabled) {
      if (this.song && !this.enabled) this.nextTime = ac.currentTime + 0.05;
      return;
    }
    const stepDur = 60 / this.song.bpm / 4;
    if (!(this.orderIdx < this.song.order.length)) { this.orderIdx = this.song.loop; this.bar = 0; this.step = 0; }
    if (this.nextTime < ac.currentTime - 0.2) this.nextTime = ac.currentTime + 0.05; // after a stall
    while (this.nextTime < ac.currentTime + 0.15) {
      this.scheduleStep(this.nextTime, stepDur);
      this.nextTime += stepDur;
      if (++this.step === 16) {
        this.step = 0;
        const part = this.song.parts[this.song.order[this.orderIdx]];
        if (++this.bar === part.bars.length) {
          this.bar = 0;
          this.orderIdx++;
          if (this.orderIdx >= this.song.order.length) this.orderIdx = this.song.loop;
        }
      }
    }
  },

  scheduleStep(t, stepDur) {
    const song = this.song, part = song.parts[song.order[this.orderIdx]];
    const chord = part.bars[this.bar], s = this.step;
    const lastBar = this.bar === part.bars.length - 1;

    // Lead.
    const n = part.leadSteps[this.bar * 16 + s];
    if (n) this.lead(t, midiHz(n.midi), n.steps * stepDur, song.lead);

    // Bass.
    const root = 36 + chord.root;
    const fifth = root + 7, oct = root + 12;
    const bassNote = {
      drive: [root, null, root, null, oct, null, root, null, root, null, root, null, oct, null, fifth, null][s],
      bounce: [root, null, null, oct, null, null, root, null, fifth, null, null, oct, null, null, root, null][s],
      quarters: [root, null, null, null, fifth, null, null, null, oct, null, null, null, fifth, null, null, null][s],
    }[song.bass];
    if (bassNote != null) this.bass(t, midiHz(bassNote), (song.bass === 'quarters' ? 3.5 : 1.6) * stepDur);

    // Arpeggio / chords.
    const tones = chord.shape.map(i => 60 + chord.root + i);
    if (song.arp === 'up') {
      const seq = [0, 1, 2, 3, 2, 1];
      const k = seq[(this.bar * 16 + s) % seq.length];
      const midi = k < tones.length ? tones[k] : tones[0] + 12;
      this.arp(t, midiHz(midi + 12), stepDur * 0.9);
    } else if (song.arp === 'chip' && s % 8 === 0) {
      this.chipChord(t, tones.map(midiHz), stepDur * 7.6);
    }

    // Drums.
    if (part.drums === false) return;
    const D = song.drums;
    const fill = part.fill && lastBar && s >= 8;
    if (part.drums === 'hats') {
      if (D.h[s] === 'x') this.hat(t, 0.6);
      return;
    }
    if (fill) {
      if (s % 2 === 0 || s >= 12) this.snare(t, 0.6 + (s - 8) * 0.05);
      if (s === 8) this.kick(t);
      return;
    }
    if (D.k[s] === 'x') this.kick(t);
    if (D.s[s] === 'x') this.snare(t, 1);
    if (D.h[s] === 'x') this.hat(t, 1);
  },

  // ---- instruments ------------------------------------------------------------
  env(t, dur, peak, sustain, release) {
    const g = Sfx.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.005);
    g.gain.setTargetAtTime(peak * sustain, t + 0.01, 0.06);
    g.gain.setValueAtTime(peak * sustain, t + Math.max(0.02, dur - 0.01));
    g.gain.linearRampToValueAtTime(0, t + dur + release);
    return g;
  },

  osc(type, freq, t, end) {
    const o = Sfx.ctx.createOscillator();
    if (this.waves[type]) o.setPeriodicWave(this.waves[type]);
    else o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(end);
    return o;
  },

  lead(t, f, dur, kind) {
    const ac = Sfx.ctx;
    if (kind === 'bell') {
      const g = this.env(t, dur * 0.4, 0.22, 0.4, dur * 0.6);
      const a = this.osc('triangle', f, t, t + dur + 0.1);
      const b = this.osc(0.125, f * 2, t, t + dur + 0.1);
      const bg = ac.createGain();
      bg.gain.value = 0.25;
      a.connect(g);
      b.connect(bg).connect(g);
      g.connect(this.out);
      g.connect(this.echoIn);
      return;
    }
    const g = this.env(t, dur * 0.92, 0.16, 0.7, 0.04);
    const o = this.osc(0.25, f, t, t + dur + 0.1);
    // Delayed vibrato on held notes.
    if (dur > 0.3) {
      const lfo = ac.createOscillator(), depth = ac.createGain();
      lfo.frequency.value = 6;
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(f * 0.012, t + Math.min(0.4, dur));
      lfo.connect(depth).connect(o.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.1);
    }
    o.connect(g);
    g.connect(this.out);
    g.connect(this.echoIn);
  },

  bass(t, f, dur) {
    const g = this.env(t, dur, 0.3, 0.6, 0.03);
    const a = this.osc('triangle', f, t, t + dur + 0.05);
    const b = this.osc(0.5, f, t, t + dur + 0.05);
    const bg = Sfx.ctx.createGain();
    bg.gain.value = 0.18;
    a.connect(g);
    b.connect(bg).connect(g);
    g.connect(this.out);
  },

  arp(t, f, dur) {
    const g = this.env(t, dur, 0.055, 0.5, 0.01);
    this.osc(0.125, f, t, t + dur + 0.03).connect(g);
    g.connect(this.out);
  },

  // C64-style "chip chord": one voice cycling through the chord at 50 Hz.
  chipChord(t, freqs, dur) {
    const g = this.env(t, dur, 0.07, 0.6, 0.05);
    const o = this.osc(0.25, freqs[0], t, t + dur + 0.08);
    for (let k = 0, tt = t; tt < t + dur; k++, tt += 0.02) o.frequency.setValueAtTime(freqs[k % freqs.length] * 2, tt);
    o.connect(g);
    g.connect(this.out);
  },

  kick(t) {
    const ac = Sfx.ctx, o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.2);
  },

  noise(t, dur, freq, type, vol) {
    const ac = Sfx.ctx, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = Sfx.noise;
    f.type = type;
    f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  },

  snare(t, k) {
    this.noise(t, 0.14, 1200, 'highpass', 0.28 * k);
    const ac = Sfx.ctx, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.06);
    g.gain.setValueAtTime(0.2 * k, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.1);
  },

  hat(t, k) {
    this.noise(t, 0.035, 7000, 'highpass', 0.12 * k);
  },
};
