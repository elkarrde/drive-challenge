'use strict';

// ---------------------------------------------------------------------------
// Segment-based pseudo-3D renderer. Each view (full screen, or one half of
// the split screen) projects the course from behind its own car.
// ---------------------------------------------------------------------------
// Night: how far the light reaches, in segments (beam for the road and
// scenery, MARKS for the kerbs and lane lines, which catch it further out),
// the light left beyond it, and how much of it reaches the verges and the
// roadside scenery.
const NIGHT = { BEAM: 16, MARKS: 40, AMBIENT: 0.05, VERGE: 0.6, SIDE: 0.7 };
// Mist: light lost per segment in clear air and in the thickest bank.
const MIST = { CLEAR: 0.012, BANK: 0.13 };

const Render = {
  makeView(x, y, w, h, split) {
    const S = w / 2;                         // uniform projection scale
    const dpx = split ? h * 0.66 : h * 0.5;  // pixels from eye line to the road under the car
    const carBottom = h - (split ? 3 : 6);
    const view = {
      x, y, w, h, S, split,
      cx: w / 2,
      carBottom,
      horizon: carBottom - dpx,
      playerZ: (CAM_DEPTH * CAM_HEIGHT * S) / dpx,
      proj: [],
      particles: [],
      weatherFor: null,
      lastSky: 0,
    };
    for (let k = 0; k < DRAW_DIST; k++) view.proj.push({});
    return view;
  },

  // ---- the world ----------------------------------------------------------
  world(ctx, view, race, car, time) {
    const T = race.track, segs = T.segments, n = segs.length, L = T.length;
    const C = race.season.colors;
    const { w, h, S, cx, horizon } = view;

    const camZ = U.mod(car.z - view.playerZ, L);
    const baseIdx = Math.floor(camZ / SEG_LEN);
    const basePct = (camZ % SEG_LEN) / SEG_LEN;
    const camY = T.heightAt(car.z) + CAM_HEIGHT;
    const camX = car.x * ROAD_W;

    // Curve offset at the car, so the road under the car lines up with it.
    let dx0 = -segs[baseIdx].curve * basePct;
    const pN = U.mod(Math.floor(car.z / SEG_LEN) - baseIdx, n);
    let xP = 0;
    {
      let xx = 0, ddx = dx0;
      for (let k = 0; k < pN; k++) { xx += ddx; ddx += segs[(baseIdx + k) % n].curve; }
      xP = xx + ddx * ((car.z % SEG_LEN) / SEG_LEN);
    }

    this.background(ctx, view, race, car);

    // Ground below the eye line, in the far (fogged) grass colour.
    const season = race.season, density = season.fog;
    ctx.fillStyle = season.night ? C.fog : U.mix(C.grass[1], C.fog, density > 0 ? 0.85 : 0.3);
    ctx.fillRect(0, Math.round(horizon), w, h - Math.round(horizon));

    // Project every segment, near to far, tracking the clip line. P.fog is how
    // much of a segment shows through haze, mist or the dark (1 = all of it).
    let x = 0, dx = dx0, maxy = h, mist = 1;
    for (let k = 0; k < DRAW_DIST; k++) {
      const seg = segs[(baseIdx + k) % n];
      const P = view.proj[k];
      const cz1 = seg.index * SEG_LEN + (seg.index < baseIdx ? L : 0) - camZ;
      const cz2 = cz1 + SEG_LEN;
      P.seg = seg;
      P.clip = maxy;
      P.visible = false;
      P.behind = cz1 <= CAM_DEPTH;
      P.fog = density > 0 ? U.fog(k / DRAW_DIST, density) : 1;
      if (season.mist) {
        P.fog *= mist;
        mist *= Math.exp(-(MIST.CLEAR + MIST.BANK * seg.mist));
      }
      if (season.night) {
        P.fog = this.beam(k, NIGHT.BEAM);
        P.marks = this.beam(k, NIGHT.MARKS);
      }
      if (P.behind) { x += dx; dx += seg.curve; continue; }
      const s1 = CAM_DEPTH / cz1, s2 = CAM_DEPTH / cz2;
      P.s1 = s1; P.s2 = s2;
      P.x1 = cx + s1 * (x - xP - camX) * S;
      P.x2 = cx + s2 * (x + dx - xP - camX) * S;
      P.y1 = Math.round(horizon - s1 * (seg.y1 - camY) * S);
      P.y2 = Math.round(horizon - s2 * (seg.y2 - camY) * S);
      P.w1 = s1 * ROAD_W * S;
      P.w2 = s2 * ROAD_W * S;
      x += dx;
      dx += seg.curve;
      if (P.y2 >= P.y1 || P.y2 >= maxy) continue;
      P.visible = true;
      maxy = P.y2;
    }

    // Road, painted far to near.
    for (let k = DRAW_DIST - 1; k >= 0; k--) {
      const P = view.proj[k];
      if (P.visible) this.segment(ctx, view, P, C, race.season);
    }

    // Sprites and cars, far to near, clipped behind hill crests. At night they
    // are darkened rather than faded, so nothing behind shows through.
    for (let k = DRAW_DIST - 1; k > 0; k--) {
      const P = view.proj[k];
      if (P.behind) continue;
      const seg = P.seg;
      const fade = season.night ? 1 : P.fog < 1 ? U.clamp(P.fog * 1.3, 0, 1) : 1;
      ctx.globalAlpha = fade;
      for (const s of seg.sprites) {
        const img = Sprites.scenery[s.key];
        const sx = P.x1 + P.s1 * s.offset * ROAD_W * S;
        this.sprite(ctx, view, img, s.def.w, s.def.h, P.s1, sx, P.y1, P.clip);
        if (season.night) this.darken(ctx, view, img, s.def.w, s.def.h, P.s1, sx, P.y1, P.clip, 1 - P.fog * NIGHT.SIDE, C.fog);
      }
      if (seg.cars.length) {
        const cars = seg.cars.length > 1 ? seg.cars.slice().sort((a, b) => b.z - a.z) : seg.cars;
        for (const other of cars) {
          if (other === car) continue;
          const pct = (other.z % SEG_LEN) / SEG_LEN;
          const sc = U.lerp(P.s1, P.s2, pct);
          const sx = U.lerp(P.x1, P.x2, pct) + sc * other.x * ROAD_W * S;
          const sy = U.lerp(P.y1, P.y2, pct);
          ctx.globalAlpha = fade;
          this.car(ctx, view, race, other, sc, sx, sy, P.clip, time, P.fog);
        }
      }
      ctx.globalAlpha = 1;
      if (k === pN) this.ownCar(ctx, view, race, car, time);
    }
    if (pN === 0) this.ownCar(ctx, view, race, car, time);
  },

  // Headlight falloff with distance k (segments): 1 near the car, AMBIENT far away.
  beam(k, range) {
    return NIGHT.AMBIENT + (1 - NIGHT.AMBIENT) * Math.exp(-(k / range) * (k / range));
  },

  // Draw a sprite's silhouette over it, `amount` opaque.
  darken(ctx, view, img, worldW, worldH, scale, sx, sy, clipY, amount, color) {
    if (amount < 0.02) return;
    const a0 = ctx.globalAlpha;
    ctx.globalAlpha = a0 * amount;
    this.sprite(ctx, view, Sprites.tint(img, color), worldW, worldH, scale, sx, sy, clipY);
    ctx.globalAlpha = a0;
  },

  background(ctx, view, race, car) {
    const season = race.season, C = season.colors, bg = Backgrounds.get(season);
    const { w, horizon, split } = view;
    const hz = Math.round(horizon);
    const g = ctx.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, C.skyTop);
    g.addColorStop(1, C.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, hz + 1);

    for (const st of bg.stars) {
      const sx = U.mod(st.x - car.skyOffset * 0.25 * bg.W, bg.W);
      if (sx < w) Px.rect(ctx, Math.floor(sx), Math.floor(st.y * hz * 0.9), 1, 1, st.bright ? '#ffffff' : '#7d88a8');
    }
    if (C.moon) {
      const sx = U.mod(w * 0.25 - car.skyOffset * 0.25 * bg.W, bg.W);
      if (sx < w + 20) {
        ctx.globalAlpha = 0.12;
        Px.disc(ctx, sx, hz * 0.28, split ? 10 : 15, C.moon);
        ctx.globalAlpha = 1;
        Px.disc(ctx, sx, hz * 0.28, split ? 5 : 7, C.moon);
        Px.disc(ctx, sx + (split ? 1 : 2), hz * 0.28 - 1, split ? 1 : 2, U.shade(C.moon, -0.12));
      }
    }

    if (C.sun) {
      const sy = race.season.id === 'summer' ? hz * 0.3 : hz * 0.62;
      const sx = U.mod(w * 0.7 - car.skyOffset * 0.25 * bg.W, bg.W);
      if (sx < w + 20) {
        ctx.globalAlpha = 0.35;
        Px.disc(ctx, sx, sy, split ? 11 : 16, C.sun);
        ctx.globalAlpha = 1;
        Px.disc(ctx, sx, sy, split ? 7 : 10, C.sun);
      }
    }
    const k = split ? 0.6 : 1;
    this.layer(ctx, bg.clouds, w, car.skyOffset * 0.25, hz - bg.clouds.height * k - (split ? 4 : 30), k);
    this.layer(ctx, bg.far, w, car.skyOffset * 0.5, hz - bg.far.height * k + 2, k);
    this.layer(ctx, bg.near, w, car.skyOffset * 1.0, hz - bg.near.height * k + 2, k);

    // Mist hides the hills, all the more inside a bank.
    if (season.mist) {
      ctx.globalAlpha = 0.45 + 0.45 * race.track.segAt(car.z).mist;
      ctx.fillStyle = C.fog;
      ctx.fillRect(0, 0, w, hz + 1);
      ctx.globalAlpha = 1;
    }
  },

  layer(ctx, img, w, offset, y, k) {
    const W = img.width;
    const ox = Math.round(U.mod(offset * W, W));
    const dh = Math.round(img.height * k);
    ctx.drawImage(img, ox, 0, Math.min(w, W - ox), img.height, 0, Math.round(y), Math.min(w, W - ox), dh);
    if (W - ox < w) ctx.drawImage(img, 0, 0, w - (W - ox), img.height, W - ox, Math.round(y), w - (W - ox), dh);
  },

  segment(ctx, view, P, C, season) {
    const seg = P.seg, light = seg.light;
    const { x1, y1, w1, x2, y2, w2 } = P;
    const w = view.w;
    // At night each part is drawn lit, then darkened by how far the light reaches it.
    const night = season.night;
    const dim = night ? 1 - P.fog : 0, dimMarks = night ? 1 - P.marks : 0;
    ctx.fillStyle = C.grass[light ? 0 : 1];
    ctx.fillRect(0, y2, w, y1 - y2);
    if (night) {
      ctx.globalAlpha = 1 - P.fog * NIGHT.VERGE;
      ctx.fillStyle = C.fog;
      ctx.fillRect(0, y2, w, y1 - y2);
      ctx.globalAlpha = 1;
    }

    const r1 = w1 * 0.14, r2 = w2 * 0.14;
    const kerbs = [
      [x1 - w1 - r1, y1, x1 - w1, y1, x2 - w2, y2, x2 - w2 - r2, y2],
      [x1 + w1 + r1, y1, x1 + w1, y1, x2 + w2, y2, x2 + w2 + r2, y2],
    ];
    for (const q of kerbs) this.quad(ctx, ...q, C.rumble[light ? 0 : 1]);
    if (night) for (const q of kerbs) this.shade(ctx, q, C.fog, dimMarks);
    const road = [x1 - w1, y1, x1 + w1, y1, x2 + w2, y2, x2 - w2, y2];
    this.quad(ctx, ...road, C.road[light ? 0 : 1]);
    if (night) this.shade(ctx, road, C.fog, dim);

    if (seg.index === START_SEG) {
      this.checker(ctx, P);
      if (night) this.shade(ctx, road, C.fog, dim);
    } else if (light) {
      const l1 = w1 * 0.035, l2 = w2 * 0.035;
      for (let lane = 1; lane < LANES; lane++) {
        const t = -1 + (2 * lane) / LANES;
        const lx1 = x1 + w1 * t, lx2 = x2 + w2 * t;
        const q = [lx1 - l1 / 2, y1, lx1 + l1 / 2, y1, lx2 + l2 / 2, y2, lx2 - l2 / 2, y2];
        this.quad(ctx, ...q, C.lane);
        if (night) this.shade(ctx, q, C.fog, dimMarks);
      }
    }
    if (season.surface === 'rain' && !light) {
      // A faint sheen on the wet tarmac.
      ctx.globalAlpha = 0.12;
      this.quad(ctx, x1 - w1 * 0.4, y1, x1 - w1 * 0.1, y1, x2 - w2 * 0.1, y2, x2 - w2 * 0.4, y2, '#d8e0ea');
      ctx.globalAlpha = 1;
    }
    if (P.fog < 1 && !night) {
      ctx.globalAlpha = 1 - P.fog;
      ctx.fillStyle = C.fog;
      ctx.fillRect(0, y2, w, y1 - y2);
      ctx.globalAlpha = 1;
    }
  },

  checker(ctx, P) {
    const cols = 12;
    const ym = (P.y1 + P.y2) / 2;
    const xm = (P.x1 + P.x2) / 2, wm = (P.w1 + P.w2) / 2;
    for (let row = 0; row < 2; row++) {
      const [ya, xa, wa, yb, xb, wb] = row === 0 ? [P.y1, P.x1, P.w1, ym, xm, wm] : [ym, xm, wm, P.y2, P.x2, P.w2];
      for (let c = 0; c < cols; c++) {
        if ((c + row) % 2) continue;
        const t0 = -1 + (2 * c) / cols, t1 = -1 + (2 * (c + 1)) / cols;
        this.quad(ctx, xa + wa * t0, ya, xa + wa * t1, ya, xb + wb * t1, yb, xb + wb * t0, yb, '#f4f4f4');
      }
    }
  },

  // Lay `color` over a quad [x1, y1, … x4, y4], `amount` opaque.
  shade(ctx, q, color, amount) {
    if (amount < 0.02) return;
    ctx.globalAlpha = amount;
    this.quad(ctx, ...q, color);
    ctx.globalAlpha = 1;
  },

  quad(ctx, x1, y1, x2, y2, x3, y3, x4, y4, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.lineTo(x4, y4);
    ctx.closePath();
    ctx.fill();
  },

  sprite(ctx, view, img, worldW, worldH, scale, sx, sy, clipY) {
    const dw = worldW * scale * view.S, dh = worldH * scale * view.S;
    const x = sx - dw / 2, y = sy - dh;
    if (dh < 0.5 || x > view.w || x + dw < 0) return;
    let drawH = dh, srcH = img.height;
    if (clipY < sy) {
      const cut = sy - clipY;
      if (cut >= dh) return;
      drawH = dh - cut;
      srcH = Math.max(1, (img.height * drawH) / dh);
    }
    ctx.drawImage(img, 0, 0, img.width, srcH, Math.round(x), Math.round(y), Math.max(1, Math.round(dw)), Math.max(1, Math.round(drawH)));
  },

  carPose(car) {
    return car.steer > 0.3 ? 1 : car.steer < -0.3 ? -1 : 0;
  },

  car(ctx, view, race, car, scale, sx, sy, clip, time, vis) {
    const img = Sprites.car(car.def, car.paint, this.carPose(car), car.brake > 0.1);
    const ww = car.def.worldW, wh = Sprites.carWorldH(car.def);
    this.spray(ctx, view, race, car, scale, sx, sy, time);
    this.sprite(ctx, view, img, ww, wh, scale, sx, sy, clip);
    this.lights(ctx, view, race, car, img, scale, sx, sy, clip, vis);
    if (car.human >= 0 && race.humans.length > 1) {
      const dh = wh * scale * view.S;
      if (sy - dh - 10 > 0 && clip >= sy) {
        Px.text(ctx, 'P' + (car.human + 1), sx, sy - dh - 10, 8, car.human === 0 ? '#ffe040' : '#40e0ff');
      }
    }
  },

  ownCar(ctx, view, race, car, time) {
    const scale = CAM_DEPTH / view.playerZ;
    let sy = view.carBottom;
    const v = car.speed / PHYS.REF_SPEED;
    if (car.speed > 1) sy += Math.round(Math.sin(time * 40) * (car.offroad ? 2 : v > 0.3 ? 0.6 : 0));
    let sx = view.cx;
    if (car.crash > 0) sx += Math.sin(time * 70) * 4;
    this.spray(ctx, view, race, car, scale, sx, sy, time);
    if (car.offroad && car.speed > 10 * KMH) this.dust(ctx, view, race, car, scale, sx, sy, time);
    const img = Sprites.car(car.def, car.paint, this.carPose(car), car.brake > 0.1);
    this.sprite(ctx, view, img, car.def.worldW, Sprites.carWorldH(car.def), scale, sx, sy, view.h + 100);
    this.lights(ctx, view, race, car, img, scale, sx, sy, view.h + 100, 0.55);
  },

  // In the dark or the mist a car's rear lights show before (or instead of)
  // the car: darken it, then draw its lights on top.
  lights(ctx, view, race, car, img, scale, sx, sy, clip, vis) {
    const season = race.season;
    if (!season.night && !season.mist) return;
    const ww = car.def.worldW, wh = Sprites.carWorldH(car.def), a0 = ctx.globalAlpha;
    if (season.night) this.darken(ctx, view, img, ww, wh, scale, sx, sy, clip, 1 - vis, season.colors.fog);
    ctx.globalAlpha = season.night ? 1 : U.clamp(vis * 3, 0, 1);
    this.sprite(ctx, view, Sprites.carLights(car.def, car.brake > 0.1), ww, wh, scale, sx, sy, clip);
    ctx.globalAlpha = a0;
  },

  // Rooster tails of spray (rain) or powder (snow) behind fast cars.
  spray(ctx, view, race, car, scale, sx, sy, time) {
    if (!race.surf.wet || car.speed < 70 * KMH) return;
    const amt = U.clamp((car.speed - 70 * KMH) / (150 * KMH), 0, 1);
    const dw = car.def.worldW * scale * view.S;
    const col = race.surf.id === 'snow' ? '#ffffff' : '#dfe6ee';
    ctx.globalAlpha = 0.25 + 0.3 * amt;
    for (const side of [-0.33, 0.33]) {
      for (let i = 0; i < 3; i++) {
        const jitter = Math.sin(time * 31 + i * 2 + side * 7);
        const rx = Math.max(1, Math.round(dw * (0.14 + 0.06 * i) * (0.6 + amt)));
        const ry = Math.max(1, Math.round(rx * 0.55));
        Px.ellipse(ctx, sx + side * dw + jitter * dw * 0.04, sy - ry - i * ry * 0.8, rx, ry, col);
      }
    }
    ctx.globalAlpha = 1;
  },

  dust(ctx, view, race, car, scale, sx, sy, time) {
    const dw = car.def.worldW * scale * view.S;
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 4; i++) {
      const r = Math.round(dw * (0.08 + 0.03 * i));
      Px.disc(ctx, sx + Math.sin(time * 23 + i * 3) * dw * 0.4, sy - r - i * 3, r, race.season.colors.grass[0]);
    }
    ctx.globalAlpha = 1;
  },

  // ---- weather ------------------------------------------------------------
  weather(ctx, view, race, car, dt) {
    const type = race.season.weather;
    if (type === 'clear') return;
    if (view.weatherFor !== race) {
      view.weatherFor = race;
      view.particles = [];
      const count = { snow: 90, rain: 110, leaves: 14 }[type] * (view.split ? 0.6 : 1);
      for (let i = 0; i < count; i++) view.particles.push({ x: Math.random() * view.w, y: Math.random() * view.h, z: Math.random(), r: Math.random() * 6.28 });
      view.lastSky = car.skyOffset;
    }
    const v = car.speed / PHYS.REF_SPEED;
    const drift = (car.skyOffset - view.lastSky) * 2400 + car.steer * v * dt * -60;
    view.lastSky = car.skyOffset;
    const { w, h } = view;
    for (const p of view.particles) {
      if (type === 'snow') {
        p.y += (18 + 40 * p.z + 60 * v) * dt;
        p.x += drift * (0.5 + p.z) + Math.sin(p.r += dt * 2) * 0.3 + (p.x - w / 2) * v * dt * 1.2;
        ctx.fillStyle = '#ffffff';
        const s = p.z > 0.6 ? 2 : 1;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), s, s);
      } else if (type === 'rain') {
        p.y += (260 + 200 * p.z) * dt;
        p.x += drift * (0.5 + p.z) - 40 * dt;
        ctx.strokeStyle = p.z > 0.5 ? 'rgba(220,230,245,0.55)' : 'rgba(200,210,230,0.35)';
        ctx.beginPath();
        ctx.moveTo(Math.round(p.x), Math.round(p.y));
        ctx.lineTo(Math.round(p.x - 2), Math.round(p.y + 6 + 5 * p.z));
        ctx.stroke();
      } else if (type === 'leaves') {
        p.y += (14 + 18 * p.z) * dt;
        p.x += drift * (0.5 + p.z) + Math.sin(p.r += dt * 3) * 0.6 - 12 * dt;
        ctx.fillStyle = ['#d8781e', '#b8361c', '#f0c040'][Math.floor(p.z * 3)];
        ctx.fillRect(Math.round(p.x), Math.round(p.y), Math.sin(p.r) > 0 ? 3 : 2, 2);
      }
      if (p.y > h) { p.y = -4; p.x = Math.random() * w; }
      if (p.x < -10) p.x += w + 20;
      if (p.x > w + 10) p.x -= w + 20;
    }
  },

  // ---- HUD ----------------------------------------------------------------
  text(ctx, str, x, y, size, color, align) {
    Px.text(ctx, str, x + 1, y + 1, size, '#000000', align);
    Px.text(ctx, str, x, y, size, color, align);
  },

  hud(ctx, view, race, car, time) {
    const { w, h, split } = view;
    const label = '#f0d040', value = '#ffffff';
    const tag = race.humans.length > 1 ? 'P' + (car.human + 1) + ' ' : '';
    if (race.season.mist) {
      // White on pale mist is hard to read: a dark band behind the top rows.
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, 0, w, 31);
    }

    this.text(ctx, tag + 'LAP', 6, 5, 8, label, 'left');
    this.text(ctx, race.lapOf(car) + '/' + LAPS, 6, 15, 8, value, 'left');
    this.text(ctx, 'POS', 74, 5, 8, label, 'left');
    this.text(ctx, race.positionOf(car) + '/' + FIELD_SIZE, 74, 15, 8, value, 'left');

    // Time remaining.
    const tl = Math.ceil(car.timeLeft);
    const low = tl <= 10 && !car.finished;
    this.text(ctx, 'TIME', w / 2, 4, 8, label);
    const flash = low && Math.floor(time * 4) % 2 === 0;
    this.text(ctx, String(car.finished ? '--' : tl), w / 2, 14, 16, flash ? '#ff3020' : low ? '#ff8060' : value);

    // Speed, gear and rev counter.
    const kmh = Math.round(car.speed / KMH);
    this.text(ctx, String(kmh), w - 50, 4, 16, value, 'right');
    this.text(ctx, 'KM/H', w - 6, 4, 8, label, 'right');
    this.text(ctx, (car.manual ? 'M' : 'A') + (car.gear + 1), w - 6, 14, 8, value, 'right');
    const cells = 14, rpmT = (car.rpm - PHYS.IDLE_RPM) / (car.def.redline - PHYS.IDLE_RPM);
    for (let i = 0; i < cells; i++) {
      const on = i < Math.round(rpmT * cells);
      const col = i >= cells - 2 ? '#ff2020' : i >= cells - 5 ? '#ffd020' : '#40e040';
      ctx.fillStyle = on ? col : 'rgba(0,0,0,0.45)';
      ctx.fillRect(w - 128 + i * 6, 24, 5, 4);
    }

    // Start lights.
    if (race.state === 'countdown' || (race.state === 'running' && race.time < 1)) {
      const lit = race.state === 'countdown' ? U.clamp(4 - Math.ceil(race.countdown), 0, 3) : 4;
      const cy = split ? 44 : 60;
      Px.rect(ctx, w / 2 - 34, cy - 10, 68, 20, '#202020');
      Px.rect(ctx, w / 2 - 34, cy - 10, 68, 1, '#606060');
      for (let i = 0; i < 3; i++) {
        const col = lit === 4 ? '#30ff40' : i < lit ? '#ff2a20' : '#4a1010';
        Px.disc(ctx, w / 2 - 20 + i * 20, cy, 6, col);
      }
    }

    if (car.msg) {
      const my = split ? h * 0.36 : h * 0.3;
      this.text(ctx, car.msg.text, w / 2, my, 16, car.msg.text === 'OUT OF TIME' ? '#ff4030' : '#ffe040');
      if (car.msg.sub) this.text(ctx, car.msg.sub, w / 2, my + 20, 8, '#ffffff');
    }
    if (car.out || car.finished) {
      if (race.humans.some(o => !o.finished && !o.out)) {
        this.text(ctx, 'WAITING FOR THE OTHER DRIVER', w / 2, h - 16, 8, '#ffffff');
      }
    }
  },
};
