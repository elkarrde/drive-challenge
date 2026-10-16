'use strict';

// ---------------------------------------------------------------------------
// Screens: title (with a demo race behind it), car setup, stage intro, the
// race itself, results, championship standings and the final screens.
// Each screen has update(dt) and draw(ctx); Game.go() switches with a fade.
// ---------------------------------------------------------------------------
const COL = {
  title: '#ffe040',
  text: '#ffffff',
  dim: '#9aa4b4',
  hi: '#40e0ff',
  p: ['#ffe040', '#40e0ff'],
  good: '#60f060',
  bad: '#ff5040',
  panel: 'rgba(8,10,24,0.78)',
};

const Game = {
  screen: null,
  next: null,
  fade: 0,          // 0 = clear, 1 = black
  fadeDir: 0,
  time: 0,
  attractSeason: 0,

  go(screen) {
    this.next = screen;
    this.fadeDir = 1;
  },

  update(dt) {
    this.time += dt;
    if (this.fadeDir) {
      this.fade = U.clamp(this.fade + this.fadeDir * dt * 4, 0, 1);
      if (this.fadeDir > 0 && this.fade >= 1) {
        if (this.screen && this.screen.leave) this.screen.leave();
        this.screen = this.next;
        this.next = null;
        if (this.screen.enter) this.screen.enter();
        this.fadeDir = -1;
      } else if (this.fadeDir < 0 && this.fade <= 0) {
        this.fadeDir = 0;
      }
      if (this.fadeDir > 0) return; // no input while fading out
    }
    this.screen.update(dt);
  },

  draw(ctx) {
    this.screen.draw(ctx);
    if (this.fade > 0) {
      ctx.fillStyle = 'rgba(0,0,0,' + this.fade + ')';
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    }
  },
};

// ---- shared drawing helpers -------------------------------------------------
const UI = {
  text(ctx, str, x, y, size, color, align) {
    Render.text(ctx, str, x, y, size, color, align);
  },

  panel(ctx, x, y, w, h) {
    ctx.fillStyle = COL.panel;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(x, y, w, 1);
    ctx.fillRect(x, y + h - 1, w, 1);
  },

  logo(ctx, x, y) {
    const t = Game.time;
    for (const [i, word] of ['DRIVE', 'CHALLENGE'].entries()) {
      const size = i ? 24 : 32, yy = y + i * 38;
      Px.text(ctx, word, x + 3, yy + 3, size, '#000000');
      Px.text(ctx, word, x, yy + 1, size, '#a01818');
      Px.text(ctx, word, x, yy, size, i ? '#ffffff' : '#ffd030');
    }
    const sub = 'THE FOUR SEASONS CHAMPIONSHIP';
    UI.text(ctx, sub, x, y + 70, 8, Math.floor(t * 2) % 2 ? '#ffffff' : '#ffe8a0');
  },

  blink(on) {
    return on && Math.floor(Game.time * 3) % 2 === 0;
  },

  // A 1..5 rating as a row of blocks.
  bar(ctx, label, value, x, y, w, color) {
    UI.text(ctx, label, x, y, 8, COL.dim, 'left');
    const bx = x + w - 5 * 10;
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = i < value ? color : 'rgba(255,255,255,0.15)';
      ctx.fillRect(bx + i * 10, y, 8, 7);
    }
  },

  carImage(ctx, def, paint, cx, bottom, scale, pose) {
    const img = Sprites.car(def, paint, pose || 0, false);
    const w = img.width * scale, h = img.height * scale;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(Math.round(cx - w * 0.48), Math.round(bottom - 3), Math.round(w * 0.96), 5);
    ctx.drawImage(img, Math.round(cx - w / 2), Math.round(bottom - h), Math.round(w), Math.round(h));
  },

  // Vertical list menu; returns nothing, draws a cursor on `sel`.
  menu(ctx, items, sel, x, y, gap) {
    items.forEach((label, i) => {
      const on = i === sel;
      UI.text(ctx, (on ? '> ' : '  ') + label + (on ? ' <' : '  '), x, y + i * gap, 8, on ? COL.title : COL.text);
    });
  },
};

// A full-screen view shared by every screen that shows a race in the back.
const FULL_VIEW = () => Render.makeView(0, 0, SCREEN_W, SCREEN_H, false);

// ---- title -----------------------------------------------------------------
class TitleScreen {
  constructor() {
    this.items = ['1 PLAYER', '2 PLAYERS', 'CONTROLS'];
    this.sel = 0;
    this.showControls = false;
    this.view = FULL_VIEW();
    this.newDemo();
  }

  newDemo() {
    const season = SEASONS[Game.attractSeason++ % SEASONS.length];
    this.demo = new Race({ season, roster: makeRoster(U.rng(7 + Game.attractSeason)), attract: true });
    this.demoTime = 0;
    this.pickCar();
    // Let the field spread out a little before we show it.
    for (let i = 0; i < 240; i++) this.demo.update(1 / 60, []);
  }

  pickCar() {
    const pool = this.demo.cars;
    this.follow = pool[Math.floor(Math.random() * pool.length)];
    this.followTime = 0;
  }

  update(dt) {
    this.demo.update(dt, []);
    this.demoTime += dt;
    if ((this.followTime += dt) > 9) this.pickCar();
    if (this.demoTime > 50) this.newDemo();

    const m = Input.menu(0, true);
    if (this.showControls) {
      if (m.fire || m.back) { this.showControls = false; Sfx.blip(); }
      return;
    }
    if (m.up) { this.sel = U.mod(this.sel - 1, this.items.length); Sfx.blip(); }
    if (m.down) { this.sel = U.mod(this.sel + 1, this.items.length); Sfx.blip(); }
    if (m.fire) {
      Sfx.select();
      if (this.sel === 2) this.showControls = true;
      else Game.go(new SetupScreen(this.sel + 1));
    }
  }

  draw(ctx) {
    Render.world(ctx, this.view, this.demo, this.follow, Game.time);
    Render.weather(ctx, this.view, this.demo, this.follow, 1 / 60);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);

    if (this.showControls) return this.drawControls(ctx);

    UI.logo(ctx, SCREEN_W / 2, 26);
    UI.panel(ctx, SCREEN_W / 2 - 90, 132, 180, 64);
    UI.menu(ctx, this.items, this.sel, SCREEN_W / 2, 142, 18);

    UI.text(ctx, this.demo.season.name + ' · ' + this.follow.name + ' · ' + this.follow.def.short, SCREEN_W / 2, 214, 8, COL.dim);
    UI.text(ctx, '3 CARS · 4 SEASONS · 20 DRIVERS', SCREEN_W / 2, 262, 8, COL.text);
    UI.text(ctx, 'M: SOUND ON/OFF    ESC: BACK / PAUSE', SCREEN_W / 2, 278, 8, COL.dim);
  }

  drawControls(ctx) {
    UI.panel(ctx, 16, 14, SCREEN_W - 32, SCREEN_H - 28);
    UI.text(ctx, 'CONTROLS', SCREEN_W / 2, 24, 16, COL.title);
    const rows = [
      ['', 'PLAYER 1', 'PLAYER 2'],
      ['STEER', 'LEFT RIGHT', 'A D'],
      ['ACCELERATE', 'UP', 'W'],
      ['BRAKE', 'DOWN', 'S'],
      ['GEAR UP', 'R.SHIFT /', 'E'],
      ['GEAR DOWN', '.', 'Q'],
      ['SELECT', 'ENTER', 'SPACE'],
    ];
    rows.forEach((r, i) => {
      const y = 54 + i * 16, c = i ? COL.text : COL.title;
      UI.text(ctx, r[0], 36, y, 8, COL.dim, 'left');
      UI.text(ctx, r[1], 250, y, 8, c);
      UI.text(ctx, r[2], 380, y, 8, c);
    });
    const notes = [
      'ONE PLAYER: EITHER SET OF KEYS WORKS.',
      'GAMEPAD: STICK STEERS, A/RT GAS, X/LT BRAKE,',
      'RB/LB CHANGE GEAR, START PAUSES.',
      'MANUAL GEARS SHIFT FASTER THAN AUTOMATIC.',
      'REACH EACH CHECKPOINT BEFORE TIME RUNS OUT.',
      'FINISH IN THE TOP 10 TO REACH THE NEXT STAGE.',
    ];
    notes.forEach((n, i) => UI.text(ctx, n, SCREEN_W / 2, 176 + i * 14, 8, i < 3 ? COL.dim : COL.text));
    if (UI.blink(true)) UI.text(ctx, 'PRESS FIRE', SCREEN_W / 2, 266, 8, COL.title);
  }
}

// ---- car setup ---------------------------------------------------------------
class SetupScreen {
  constructor(players) {
    this.players = players;
    this.solo = players === 1;
    this.slots = [];
    for (let i = 0; i < players; i++) this.slots.push({ car: i === 1 ? 2 : 0, manual: false, row: 0, ready: false });
    this.bg = Backgrounds.get(SEASONS[3]);
  }

  paintFor(i) {
    const def = CARS[this.slots[i].car];
    if (i === 1 && this.slots[0].car === this.slots[1].car) return def.altPaint;
    return def.paint;
  }

  update(dt) {
    let back = false;
    this.slots.forEach((s, i) => {
      const m = Input.menu(i, this.solo);
      back = back || m.back;
      if (s.ready) {
        if (m.fire || m.left || m.right || m.up) { s.ready = false; Sfx.blip(); }
        return;
      }
      if (m.up) { s.row = U.mod(s.row - 1, 3); Sfx.blip(); }
      if (m.down) { s.row = U.mod(s.row + 1, 3); Sfx.blip(); }
      const dir = (m.right ? 1 : 0) - (m.left ? 1 : 0);
      if (dir && s.row === 0) { s.car = U.mod(s.car + dir, CARS.length); Sfx.blip(); }
      if (dir && s.row === 1) { s.manual = !s.manual; Sfx.blip(); }
      if (m.fire) {
        if (s.row < 2) { s.row++; Sfx.blip(); } else { s.ready = true; Sfx.select(); }
      }
    });
    if (back) { Sfx.blip(); Game.go(new TitleScreen()); return; }
    if (this.slots.every(s => s.ready)) {
      const humans = this.slots.map((s, i) => ({
        slot: i,
        def: CARS[s.car],
        manual: s.manual,
        paint: this.paintFor(i),
        name: 'PLAYER ' + (i + 1),
      }));
      Game.go(new StageScreen(new Championship(humans), 0));
    }
  }

  draw(ctx) {
    // Summer sky and hills as a backdrop.
    const C = SEASONS[3].colors, g = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
    g.addColorStop(0, C.skyTop); g.addColorStop(0.6, C.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    const off = Game.time * 0.01, hz = SCREEN_H - 110;
    Render.layer(ctx, this.bg.clouds, SCREEN_W, off * 0.5, hz - this.bg.clouds.height - 40, 1);
    Render.layer(ctx, this.bg.far, SCREEN_W, off, hz - this.bg.far.height + 2, 1);
    Render.layer(ctx, this.bg.near, SCREEN_W, off * 2, hz - this.bg.near.height + 2, 1);
    ctx.fillStyle = C.grass[1];
    ctx.fillRect(0, hz, SCREEN_W, SCREEN_H - hz);

    UI.text(ctx, 'CHOOSE YOUR CAR', SCREEN_W / 2, 6, 16, COL.title);
    const pw = SCREEN_W / this.players;
    this.slots.forEach((s, i) => this.drawSlot(ctx, s, i, i * pw, pw));
    UI.text(ctx, 'UP/DOWN SELECT · LEFT/RIGHT CHANGE · ESC BACK', SCREEN_W / 2, SCREEN_H - 11, 8, COL.text);
  }

  drawSlot(ctx, s, i, x0, pw) {
    const def = CARS[s.car], cx = x0 + pw / 2, wide = this.players === 1;
    UI.panel(ctx, x0 + 6, 28, pw - 12, SCREEN_H - 44);
    UI.carImage(ctx, def, this.paintFor(i), cx, wide ? 150 : 140, 2, Math.sin(Game.time * 1.5) > 0.85 ? 1 : 0);
    if (!wide) UI.text(ctx, 'PLAYER ' + (i + 1), cx, 34, 8, COL.p[i]);
    const arrows = s.row === 0 && !s.ready;
    if (arrows) {
      UI.text(ctx, '◄', x0 + 18, 100, 8, COL.title, 'left');
      UI.text(ctx, '►', x0 + pw - 18, 100, 8, COL.title, 'right');
    }
    UI.text(ctx, def.maker, cx, wide ? 160 : 148, 8, COL.dim);
    UI.text(ctx, def.model, cx, wide ? 172 : 159, 8, s.row === 0 && !s.ready ? COL.title : COL.text);
    if (wide) UI.text(ctx, def.year + ' · ' + def.spec, cx, 184, 8, COL.dim);

    const bw = wide ? 300 : 196, bx = cx - bw / 2;
    let y = wide ? 200 : 174;
    const st = def.stats;
    const bars = [['TOP SPEED', st.speed], ['CORNERING', st.corner], ['ACCEL DRY', st.accelDry], ['ACCEL WET', st.accelWet]];
    for (const [label, v] of bars) {
      UI.bar(ctx, label, v, bx, y, bw, label === 'ACCEL WET' ? '#60b0ff' : '#ff9030');
      y += 11;
    }
    y += 6;
    const gear = (s.manual ? 'MANUAL' : 'AUTOMATIC');
    UI.text(ctx, 'GEARS', bx, y, 8, COL.dim, 'left');
    UI.text(ctx, (s.row === 1 && !s.ready ? '◄ ' + gear + ' ►' : gear), bx + bw, y, 8, s.row === 1 && !s.ready ? COL.title : COL.text, 'right');
    y += 16;
    const label = s.ready ? 'READY!' : 'START';
    const on = s.row === 2 || s.ready;
    if (!s.ready || UI.blink(true) || this.players === 1) {
      UI.text(ctx, s.ready ? label : on ? '> ' + label + ' <' : label, cx, y, 8, s.ready ? COL.good : on ? COL.title : COL.text);
    }
    if (s.ready && this.players > 1 && !this.slots.every(o => o.ready)) {
      UI.text(ctx, 'WAITING...', cx, y + 12, 8, COL.dim);
    }
  }
}

// ---- championship state -------------------------------------------------------
class Championship {
  // humans: [{slot, def, manual, paint, name}]
  constructor(humans) {
    this.humans = humans.map(h => ({ ...h, points: 0, alive: true }));
    this.roster = makeRoster(U.rng(Math.floor(Math.random() * 1e9)));
    this.points = new Map(this.roster.map(r => [r.name, 0]));
    for (const h of this.humans) this.points.set(h.name, 0);
    this.stage = 0;
    this.history = [];
  }

  get twoPlayer() { return this.humans.length > 1; }
  alive() { return this.humans.filter(h => h.alive); }

  // Feed one race's result rows in; marks humans that failed to qualify.
  record(rows, raceHumans) {
    for (const r of rows) {
      const name = r.human >= 0 ? raceHumans[r.human].name : r.name;
      this.points.set(name, (this.points.get(name) || 0) + r.points);
      if (r.human >= 0) {
        const h = raceHumans[r.human];
        h.points += r.points;
        h.lastPos = r.dnf ? null : r.pos;
        if (!r.qualified) h.alive = false;
      }
    }
    this.history.push(rows);
  }

  standings() {
    const rows = [];
    for (const [name, pts] of this.points) {
      const human = this.humans.find(h => h.name === name);
      const ai = this.roster.find(r => r.name === name);
      rows.push({ name, pts, human: human || null, def: human ? human.def : ai.def });
    }
    rows.sort((a, b) => b.pts - a.pts || (a.human ? -1 : 1));
    rows.forEach((r, i) => { r.pos = i > 0 && rows[i - 1].pts === r.pts ? rows[i - 1].pos : i + 1; });
    return rows;
  }
}

// ---- stage intro ----------------------------------------------------------------
class StageScreen {
  constructor(champ, stage) {
    this.champ = champ;
    this.stage = stage;
    this.season = SEASONS[stage];
    const humans = champ.alive();
    this.humans = humans;
    this.race = new Race({ season: this.season, stage, humans, roster: champ.roster });
    this.view = FULL_VIEW();
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    let fire = false;
    for (let i = 0; i < this.champ.humans.length; i++) fire = fire || Input.menu(i, true).fire;
    if (this.t > 0.6 && fire) {
      Sfx.select();
      Game.go(new RaceScreen(this.champ, this.race, this.humans));
    }
    if (Input.menu(0, true).back) Game.go(new TitleScreen());
  }

  draw(ctx) {
    const car = this.race.humans[0];
    Render.world(ctx, this.view, this.race, car, Game.time);
    const S = this.season, surf = SURFACES[S.surface];
    UI.panel(ctx, 40, 40, SCREEN_W - 80, 170);
    UI.text(ctx, 'STAGE ' + (this.stage + 1) + ' OF ' + SEASONS.length, SCREEN_W / 2, 52, 8, COL.dim);
    UI.text(ctx, S.name, SCREEN_W / 2, 66, 32, COL.title);
    UI.text(ctx, S.blurb, SCREEN_W / 2, 106, 8, COL.text);
    UI.text(ctx, 'SURFACE: ' + surf.name + (surf.wet ? '  ·  LOW GRIP' : ''), SCREEN_W / 2, 126, 8, surf.wet ? COL.hi : COL.text);
    UI.text(ctx, LAPS + ' LAPS  ·  ' + FIELD_SIZE + ' CARS  ·  TOP ' + QUALIFY_POS + ' QUALIFY', SCREEN_W / 2, 142, 8, COL.text);
    this.humans.forEach((h, i) => {
      const accel = surf.wet ? h.def.stats.accelWet : h.def.stats.accelDry;
      const line = (this.humans.length > 1 ? 'P' + (h.slot + 1) + ' ' : '') + h.def.short + '  ACCEL ' + accel + '/5' + (h.points ? '  ' + h.points + ' PTS' : '');
      UI.text(ctx, line, SCREEN_W / 2, 162 + i * 12, 8, COL.p[h.slot]);
    });
    if (UI.blink(this.t > 0.6)) UI.text(ctx, 'PRESS FIRE TO START', SCREEN_W / 2, 190, 8, COL.title);
  }
}

// ---- the race ---------------------------------------------------------------------
class RaceScreen {
  constructor(champ, race, humans) {
    this.champ = champ;
    this.race = race;
    this.humans = humans;           // championship entries, in race.humans order
    this.solo = humans.length === 1;
    if (this.solo) {
      this.views = [FULL_VIEW()];
    } else {
      const h = (SCREEN_H - 4) / 2;
      this.views = [Render.makeView(0, 0, SCREEN_W, h, true), Render.makeView(0, h + 4, SCREEN_W, h, true)];
    }
    this.paused = false;
    this.pauseSel = 0;
    this.engines = [];
    this.ambience = null;
  }

  enter() { this.startSound(); }
  leave() { this.stopSound(); }

  startSound() {
    const vol = this.solo ? 1 : 0.65;
    this.engines = this.race.humans.map(car => Sfx.engine(car.def, vol));
    this.ambience = Sfx.ambience(this.race.season.weather);
  }

  stopSound() {
    for (const e of this.engines) if (e) e.stop();
    this.engines = [];
    if (this.ambience) this.ambience.stop();
    this.ambience = null;
  }

  controls() {
    return this.humans.map(h => Input.drive(this.solo ? 0 : h.slot, this.solo));
  }

  update(dt) {
    if (this.paused) return this.updatePause();
    if (Input.pause()) {
      this.paused = true;
      this.pauseSel = 0;
      this.stopSound();
      Sfx.blip();
      return;
    }
    this.race.update(dt, this.controls());
    this.race.humans.forEach((car, i) => {
      const e = this.engines[i];
      if (e) e.update(car.rpm, car.out || car.finished ? 0.3 : car.throttle, car.skid, car.offroad && car.speed > 5 * KMH);
    });
    if (this.race.state === 'over') {
      Game.go(new ResultsScreen(this.champ, this.race, this.humans));
    }
  }

  updatePause() {
    const m = Input.menu(0, true);
    if (m.up || m.down) { this.pauseSel = 1 - this.pauseSel; Sfx.blip(); }
    if (Input.pause() || m.back || (m.fire && this.pauseSel === 0)) {
      this.paused = false;
      this.startSound();
      Sfx.blip();
    } else if (m.fire) {
      Sfx.select();
      Game.go(new TitleScreen());
    }
  }

  draw(ctx) {
    this.race.humans.forEach((car, i) => {
      const v = this.views[i];
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.beginPath();
      ctx.rect(0, 0, v.w, v.h);
      ctx.clip();
      Render.world(ctx, v, this.race, car, Game.time);
      Render.weather(ctx, v, this.race, car, this.paused ? 0 : 1 / 60);
      Render.hud(ctx, v, this.race, car, Game.time);
      ctx.restore();
    });
    if (!this.solo) {
      ctx.fillStyle = '#101010';
      ctx.fillRect(0, this.views[0].h, SCREEN_W, 4);
      ctx.fillStyle = '#505050';
      ctx.fillRect(0, this.views[0].h + 1, SCREEN_W, 1);
    }
    if (this.paused) {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
      UI.panel(ctx, SCREEN_W / 2 - 90, 100, 180, 90);
      UI.text(ctx, 'PAUSED', SCREEN_W / 2, 112, 16, COL.title);
      UI.menu(ctx, ['RESUME', 'QUIT RACE'], this.pauseSel, SCREEN_W / 2, 144, 18);
    }
  }
}

// ---- results ----------------------------------------------------------------------
class ResultsScreen {
  constructor(champ, race, humans) {
    this.champ = champ;
    this.race = race;
    this.rows = race.results();
    this.humans = humans;
    champ.record(this.rows, humans);
    this.t = 0;
    const anyQ = humans.some(h => h.alive);
    Sfx.fanfare(anyQ);
  }

  update(dt) {
    this.t += dt;
    if (this.t > 0.8 && Input.anyFire()) {
      Sfx.select();
      Game.go(new StandingsScreen(this.champ, this.race.stage));
    }
  }

  draw(ctx) {
    drawBackdrop(ctx, this.race.season);
    UI.text(ctx, this.race.season.name + ' · RESULT', SCREEN_W / 2, 6, 16, COL.title);
    const top = 30, rowH = 11;
    UI.text(ctx, 'POS', 22, top, 8, COL.dim, 'left');
    UI.text(ctx, 'DRIVER', 62, top, 8, COL.dim, 'left');
    UI.text(ctx, 'CAR', 222, top, 8, COL.dim, 'left');
    UI.text(ctx, 'TIME', 392, top, 8, COL.dim, 'right');
    UI.text(ctx, 'PTS', 458, top, 8, COL.dim, 'right');
    const shown = Math.min(this.rows.length, Math.floor(this.t * 30) + 1);
    for (let i = 0; i < shown; i++) {
      const r = this.rows[i], y = top + 12 + i * rowH;
      const h = r.human >= 0 ? this.humans[r.human] : null;
      const c = h ? COL.p[h.slot] : i < QUALIFY_POS ? COL.text : COL.dim;
      if (h) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(16, y - 2, SCREEN_W - 32, rowH); }
      UI.text(ctx, String(r.pos), 42, y, 8, c, 'right');
      UI.text(ctx, h ? h.name : r.name, 62, y, 8, c, 'left');
      UI.text(ctx, r.def.short, 222, y, 8, c, 'left');
      UI.text(ctx, r.dnf ? 'OUT' : U.formatTime(r.time), 392, y, 8, r.dnf ? COL.bad : c, 'right');
      UI.text(ctx, r.points ? String(r.points) : '-', 458, y, 8, c, 'right');
      if (i === QUALIFY_POS - 1) { ctx.fillStyle = COL.title; ctx.fillRect(16, y + rowH - 2, SCREEN_W - 32, 1); }
    }
    if (shown < this.rows.length) return;
    const y = SCREEN_H - 24;
    const lines = this.humans.map(h => {
      const car = this.race.humans[this.humans.indexOf(h)];
      const best = isFinite(car.bestLap) ? '  BEST LAP ' + U.formatTime(car.bestLap) : '';
      return { text: (this.humans.length > 1 ? 'P' + (h.slot + 1) + ' ' : '') + (h.alive ? 'QUALIFIED' : 'NOT QUALIFIED') + best, c: h.alive ? COL.good : COL.bad };
    });
    lines.forEach((l, i) => UI.text(ctx, l.text, SCREEN_W / 2, y - (lines.length - 1 - i) * 10, 8, l.c));
  }
}

function drawBackdrop(ctx, season) {
  const C = season.colors, g = ctx.createLinearGradient(0, 0, 0, SCREEN_H);
  g.addColorStop(0, U.shade(C.skyTop, 0.35));
  g.addColorStop(1, U.shade(C.grass[1], 0.3));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
}

// ---- standings ----------------------------------------------------------------------
class StandingsScreen {
  constructor(champ, stage) {
    this.champ = champ;
    this.stage = stage;
    this.rows = champ.standings();
    this.t = 0;
    this.last = stage === SEASONS.length - 1;
    this.over = champ.alive().length === 0;
  }

  update(dt) {
    this.t += dt;
    if (this.t > 0.8 && Input.anyFire()) {
      Sfx.select();
      if (this.over) Game.go(new EndScreen(this.champ, false));
      else if (this.last) Game.go(new EndScreen(this.champ, true));
      else Game.go(new StageScreen(this.champ, this.stage + 1));
    }
  }

  draw(ctx) {
    drawBackdrop(ctx, SEASONS[this.stage]);
    UI.text(ctx, 'CHAMPIONSHIP · AFTER ' + (this.stage + 1) + ' OF ' + SEASONS.length, SCREEN_W / 2, 6, 8, COL.dim);
    UI.text(ctx, 'STANDINGS', SCREEN_W / 2, 18, 16, COL.title);
    const per = 11, top = 42, rowH = 11;
    this.rows.forEach((r, i) => {
      const col = Math.floor(i / per), y = top + (i % per) * rowH;
      const x = col ? 248 : 16;
      const c = r.human ? COL.p[r.human.slot] : COL.text;
      if (r.human) { ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x, y - 2, 216, rowH); }
      UI.text(ctx, String(r.pos), x + 22, y, 8, c, 'right');
      UI.text(ctx, r.name, x + 30, y, 8, c, 'left');
      UI.text(ctx, String(r.pts), x + 212, y, 8, c, 'right');
    });
    const msg = this.over ? 'NO DRIVER QUALIFIED' : this.last ? 'FINAL STANDINGS' : 'NEXT: ' + SEASONS[this.stage + 1].name;
    UI.text(ctx, msg, SCREEN_W / 2, SCREEN_H - 40, 8, this.over ? COL.bad : COL.title);
    if (UI.blink(this.t > 0.8)) UI.text(ctx, 'PRESS FIRE', SCREEN_W / 2, SCREEN_H - 20, 8, COL.text);
  }
}

// ---- end of the championship ----------------------------------------------------------
class EndScreen {
  constructor(champ, completed) {
    this.champ = champ;
    this.completed = completed;
    this.rows = champ.standings();
    this.t = 0;
    const champRow = this.rows[0];
    this.won = completed && !!champRow.human;
    this.view = FULL_VIEW();
    const season = SEASONS[completed ? SEASONS.length - 1 : champ.history.length - 1];
    this.demo = new Race({ season, roster: champ.roster, attract: true });
    this.follow = this.demo.cars[0];
  }

  enter() { Sfx.fanfare(this.won); }

  update(dt) {
    this.t += dt;
    this.demo.update(dt, []);
    if (this.t > 1.5 && Input.anyFire()) {
      Sfx.select();
      Game.go(new TitleScreen());
    }
  }

  draw(ctx) {
    Render.world(ctx, this.view, this.demo, this.follow, Game.time);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
    UI.panel(ctx, 0, 36, SCREEN_W, 210);
    const cx = SCREEN_W / 2;
    if (!this.completed) {
      UI.text(ctx, 'GAME OVER', cx, 70, 32, COL.bad);
      UI.text(ctx, 'NOBODY FINISHED IN THE TOP ' + QUALIFY_POS, cx, 120, 8, COL.text);
      UI.text(ctx, 'STAGES COMPLETED: ' + (this.champ.history.length - 1) + ' OF ' + SEASONS.length, cx, 136, 8, COL.dim);
    } else if (this.won) {
      UI.text(ctx, 'CHAMPION!', cx, 50, 32, COL.title);
      const h = this.rows[0].human;
      UI.text(ctx, h.name + ' · ' + h.def.maker + ' ' + h.def.model, cx, 96, 8, COL.p[h.slot]);
      UI.carImage(ctx, h.def, h.paint, cx, 196, 1.5, Math.sin(Game.time * 2) > 0 ? 1 : -1);
    } else {
      UI.text(ctx, 'SEASON OVER', cx, 50, 32, COL.title);
      UI.text(ctx, 'CHAMPION: ' + this.rows[0].name + ' · ' + this.rows[0].def.short, cx, 96, 8, COL.text);
    }
    this.champ.humans.forEach((h, i) => {
      const row = this.rows.find(r => r.human === h);
      const line = h.name + ': ' + U.ordinal(row.pos) + ' WITH ' + row.pts + ' PTS';
      UI.text(ctx, line, cx, 214 + i * 12, 8, COL.p[h.slot]);
    });
    if (UI.blink(this.t > 1.5)) UI.text(ctx, 'PRESS FIRE', cx, SCREEN_H - 24, 8, COL.text);
  }
}
