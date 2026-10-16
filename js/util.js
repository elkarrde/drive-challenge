'use strict';

// Small math / colour / canvas helpers shared by every module.
const U = {
  clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v),
  lerp: (a, b, t) => a + (b - a) * t,
  easeIn: (a, b, t) => a + (b - a) * t * t,
  easeOut: (a, b, t) => a + (b - a) * (1 - (1 - t) * (1 - t)),
  easeInOut: (a, b, t) => a + (b - a) * (0.5 - Math.cos(t * Math.PI) / 2),
  mod: (n, m) => ((n % m) + m) % m,
  sign: v => (v > 0 ? 1 : v < 0 ? -1 : 0),
  // Exponential fog: 1 = clear, 0 = fully fogged.
  fog: (d, density) => 1 / Math.exp(d * d * density),

  // Deterministic PRNG (mulberry32) so every season always builds the same course.
  rng(seed) {
    let s = seed >>> 0;
    const next = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.range = (a, b) => a + (b - a) * next();
    next.int = (a, b) => Math.floor(a + (b - a + 1) * next());
    next.pick = arr => arr[Math.floor(next() * arr.length)];
    next.chance = p => next() < p;
    next.weighted = table => {
      // table: [[value, weight], ...]
      let total = 0;
      for (const [, w] of table) total += w;
      let r = next() * total;
      for (const [v, w] of table) {
        if ((r -= w) <= 0) return v;
      }
      return table[table.length - 1][0];
    };
    return next;
  },

  canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    return [c, ctx];
  },

  rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },
  hex(r, g, b) {
    const c = v => U.clamp(Math.round(v), 0, 255);
    return '#' + ((1 << 24) | (c(r) << 16) | (c(g) << 8) | c(b)).toString(16).slice(1);
  },
  mix(a, b, t) {
    const x = U.rgb(a), y = U.rgb(b);
    return U.hex(U.lerp(x[0], y[0], t), U.lerp(x[1], y[1], t), U.lerp(x[2], y[2], t));
  },
  // f > 0 lightens toward white, f < 0 darkens toward black.
  shade(hex, f) {
    return f >= 0 ? U.mix(hex, '#ffffff', f) : U.mix(hex, '#000000', -f);
  },

  ordinal(n) {
    const s = ['TH', 'ST', 'ND', 'RD'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  },
  formatTime(t) {
    if (!isFinite(t)) return '--:--.--';
    const m = Math.floor(t / 60);
    const s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  },
};
