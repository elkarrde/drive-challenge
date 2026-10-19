'use strict';

// ---------------------------------------------------------------------------
// Course builder. A course is a closed loop of segments, each with a curve
// value (−6..6, positive bends right) and a start/end height. The layout is
// generated from the season's seed, so a season always has the same course.
// ---------------------------------------------------------------------------
const START_SEG = 80;   // index of the start/finish line
const GRID_FRONT = 76;  // segment of the front row of the grid
const GRID_GAP = 7;     // segments between grid rows

class Track {
  constructor(season) {
    this.season = season;
    this.segments = [];
    this.rng = U.rng(season.seed);
    this.build();
    this.length = this.segments.length * SEG_LEN;
    this.startZ = START_SEG * SEG_LEN;
    this.checkpointSeg = (START_SEG + Math.floor(this.segments.length / 2)) % this.segments.length;
    this.decorate();
    if (season.mist) this.mistBanks();
  }

  segAt(z) {
    const n = this.segments.length;
    return this.segments[Math.floor(U.mod(z, this.length) / SEG_LEN) % n];
  }

  heightAt(z) {
    const seg = this.segAt(z);
    const pct = U.mod(z, SEG_LEN) / SEG_LEN;
    return U.lerp(seg.y1, seg.y2, pct);
  }

  // Grid slot 0 is pole position; slot FIELD_SIZE-1 is the back of the grid.
  gridSlot(slot) {
    const row = Math.floor(slot / 2);
    return {
      dist: (GRID_FRONT - row * GRID_GAP) * SEG_LEN,
      x: slot % 2 === 0 ? -0.45 : 0.45,
    };
  }

  // ---- layout -------------------------------------------------------------
  lastY() {
    const s = this.segments;
    return s.length ? s[s.length - 1].y2 : 0;
  }

  addSegment(curve, y) {
    const n = this.segments.length;
    this.segments.push({
      index: n,
      y1: this.lastY(),
      y2: y,
      curve,
      light: Math.floor(n / RUMBLE_LEN) % 2 === 0,
      sprites: [],
      cars: [],
    });
  }

  addRoad(enter, hold, leave, curve, height) {
    enter = Math.round(enter); hold = Math.round(hold); leave = Math.round(leave);
    const startY = this.lastY();
    const endY = startY + height * SEG_LEN;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) {
      this.addSegment(U.easeIn(0, curve, n / enter), U.easeInOut(startY, endY, (n + 1) / total));
    }
    for (let n = 0; n < hold; n++) {
      this.addSegment(curve, U.easeInOut(startY, endY, (enter + n + 1) / total));
    }
    for (let n = 0; n < leave; n++) {
      this.addSegment(U.easeInOut(curve, 0, n / leave), U.easeInOut(startY, endY, (enter + hold + n + 1) / total));
    }
  }

  // Height change for a piece of `len` segments, kept within a sane band.
  hillFor(len) {
    const S = this.season, r = this.rng;
    if (!r.chance(S.hilly)) return 0;
    const cur = this.lastY() / SEG_LEN;
    let h = r.range(-1, 1) * Math.min(45, len * 0.32);
    if (Math.abs(cur + h) > 70) h = -h;
    return h;
  }

  build() {
    const S = this.season, r = this.rng;
    const target = S.lapSegments;

    this.addRoad(0, START_SEG + 40, 0, 0, 0); // flat start straight with the grid

    let last = 'straight';
    while (this.segments.length < target - 220) {
      const piece = r.weighted([
        ['straight', S.straights * (last === 'straight' ? 0.4 : 1)],
        ['curve', S.curvy],
        ['scurve', S.curvy * 0.5],
        ['hills', S.hilly * 0.35],
      ]);
      last = piece;
      const dir = r.chance(0.5) ? 1 : -1;
      const strength = () => r.weighted([[2, 1], [3, 1.2], [4, 0.6 + S.curvy], [5, S.curvy], [6, S.curvy * 0.8]]);
      if (piece === 'straight') {
        const len = r.int(30, 70 + S.straights * 140);
        this.addRoad(len * 0.25, len * 0.5, len * 0.25, 0, this.hillFor(len));
      } else if (piece === 'curve') {
        const e = r.int(12, 28), h = r.int(15, 60), l = r.int(12, 28);
        this.addRoad(e, h, l, dir * strength(), this.hillFor(e + h + l));
      } else if (piece === 'scurve') {
        const s1 = strength(), s2 = strength();
        const e = r.int(10, 20), h = r.int(12, 35), l = r.int(10, 20);
        this.addRoad(e, h, l, dir * s1, this.hillFor(e + h + l) / 2);
        this.addRoad(e, h, l, -dir * s2, this.hillFor(e + h + l) / 2);
      } else {
        const bumps = r.int(2, 4);
        for (let i = 0; i < bumps; i++) {
          const up = r.range(4, 12);
          this.addRoad(10, 6, 10, 0, up);
          this.addRoad(10, 6, 10, 0, -up);
        }
      }
    }

    // Bring the road back down to the start height and run into the grid.
    const back = -this.lastY() / SEG_LEN;
    const len = Math.max(90, Math.abs(back) * 3.2);
    this.addRoad(len * 0.3, len * 0.4, len * 0.3, 0, back);
    this.addRoad(0, 40, 0, 0, 0);
  }

  // ---- scenery ------------------------------------------------------------
  addSprite(segIndex, key, offset) {
    const def = SPRITE_DEFS[key];
    const seg = this.segments[U.mod(segIndex, this.segments.length)];
    seg.sprites.push({ key, offset, def });
  }

  // Place a roadside sprite so its near edge clears the verge.
  roadside(segIndex, key, side, extra) {
    const def = SPRITE_DEFS[key];
    const half = def.w / ROAD_W / 2;
    this.addSprite(segIndex, key, side * (1.2 + half + extra));
  }

  // Fog banks: seg.mist runs 0 (clear) to 1 (thick), from whole-lap sines so
  // the banks join up across the start line. Own RNG, so the layout and
  // scenery stay as they were.
  mistBanks() {
    const segs = this.segments, n = segs.length, r = U.rng(this.season.seed * 13 + 5);
    const waves = [[5, 1], [8, 0.7], [13, 0.45], [21, 0.25]].map(([k, a]) => ({ k, a, ph: r() * Math.PI * 2 }));
    const total = waves.reduce((s, w) => s + w.a, 0);
    for (let i = 0; i < n; i++) {
      const v = waves.reduce((s, w) => s + w.a * Math.sin((w.k * 2 * Math.PI * i) / n + w.ph), 0) / total;
      segs[i].mist = U.clamp((v + 0.1) * 2.2, 0, 1);
    }
  }

  decorate() {
    const S = this.season, r = U.rng(S.seed * 7 + 3);
    const segs = this.segments, n = segs.length;
    const nearBanner = i => {
      const d1 = Math.abs(i - START_SEG), d2 = Math.abs(i - this.checkpointSeg);
      return Math.min(d1, n - d1, d2, n - d2) < 4;
    };

    // Overhead banners.
    this.addSprite(START_SEG, 'banner_start', 0);
    this.addSprite(this.checkpointSeg, 'banner_checkpoint', 0);

    // Spectators around the start/finish line.
    for (let i = START_SEG - 16; i <= START_SEG + 20; i += 4) {
      if (Math.abs(i - START_SEG) < 3) continue;
      this.roadside(i, 'crowd', -1, 0.3 + r() * 0.3);
      this.roadside(i + 2, 'crowd', 1, 0.3 + r() * 0.3);
    }

    // Marker posts.
    for (let i = 0; i < n; i += 10) {
      if (nearBanner(i)) continue;
      this.addSprite(i, 'post', -1.2);
      this.addSprite(i, 'post', 1.2);
    }

    // Chevron boards on the outside of every proper bend.
    for (let i = 0; i < n; i++) {
      const c = segs[i].curve;
      if (Math.abs(c) >= 3 && i % 6 === 0 && !nearBanner(i)) {
        const side = c > 0 ? -1 : 1; // outside of the bend
        this.addSprite(i, c > 0 ? 'chevron_r' : 'chevron_l', side * 1.4);
      }
    }

    // Scenery zones: dense woods, scattered trees, open fields and billboards.
    let i = START_SEG + 24;
    while (i < n + START_SEG - 20) {
      const zone = r.weighted([['dense', 3], ['scattered', 4], ['open', 2], ['billboards', 1]]);
      const len = r.int(60, 180);
      for (let k = 0; k < len && i < n + START_SEG - 20; k++, i++) {
        const idx = i % n;
        if (nearBanner(idx)) continue;
        const seg = segs[idx];
        for (const side of [-1, 1]) {
          if (zone === 'dense' && k % 3 === 0) {
            this.roadside(idx, r.weighted(S.scenery), side, r() * 0.5);
            if (r.chance(0.6)) this.roadside(idx + 1, r.weighted(S.scenery), side, 1.2 + r() * 2.5);
          } else if (zone === 'scattered' && r.chance(0.09)) {
            this.roadside(idx, r.weighted(S.scenery), side, r() * 2.5);
          } else if (zone === 'open' && r.chance(0.025)) {
            this.roadside(idx, r.weighted(S.scenery), side, 0.5 + r() * 3);
          } else if (zone === 'billboards' && k % 45 === 0 && seg.curve === 0) {
            this.roadside(idx, r.pick(['billboard_a', 'billboard_b', 'billboard_c']), side, 0.2);
          } else if (zone === 'billboards' && r.chance(0.04)) {
            this.roadside(idx, r.weighted(S.scenery), side, 0.6 + r() * 2.5);
          }
        }
      }
    }
  }
}
