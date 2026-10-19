'use strict';

// ---------------------------------------------------------------------------
// One race: the course, the field of 20 cars, the start sequence, checkpoint
// timing for the human drivers, collisions and the finishing order.
// ---------------------------------------------------------------------------
const TRACKS = new Map();
function trackFor(season) {
  if (!TRACKS.has(season.id)) TRACKS.set(season.id, new Track(season));
  return TRACKS.get(season.id);
}

const RACE = {
  PACE_KMH: 168,        // average speed the time limit is built around (dry)
  START_BONUS: 6,       // extra seconds on the first section for the standing start
  CAR_LEN: 260,         // collision depth in world units
  COUNTDOWN: 3.6,
};

// Computer drivers for a whole championship: fixed car and base skill.
function makeRoster(rng) {
  const order = [];
  for (let i = 0; i < AI_DRIVERS.length; i++) order.push(CARS[i % CARS.length]);
  return AI_DRIVERS.map((name, i) => {
    const def = order[i];
    return {
      id: 'ai-' + i,
      name,
      def,
      paint: def.aiPaints[Math.floor(rng() * def.aiPaints.length)],
      // Spread from quick to slow; the stage number adds a little on top.
      base: 0.86 - (i / (AI_DRIVERS.length - 1)) * 0.18 + rng() * 0.015,
    };
  });
}

class Race {
  // opts: { season, stage, humans: [{id, def, manual, paint, name}], roster, attract }
  constructor(opts) {
    this.season = opts.season;
    this.stage = opts.stage || 0;
    this.surf = SURFACES[this.season.surface];
    this.track = trackFor(this.season);
    this.attract = !!opts.attract;
    this.cars = [];
    this.humans = [];
    this.time = 0;
    this.state = this.attract ? 'running' : 'countdown';
    this.countdown = RACE.COUNTDOWN;
    this.overTimer = 0;
    this.finishCount = 0;

    const L = this.track.length;
    this.halfLap = U.mod(this.track.checkpointSeg - START_SEG, this.track.segments.length) * SEG_LEN;
    this.raceDist = LAPS * L;
    this.checkpoints = [];
    for (let k = 1; k <= LAPS * 2; k++) this.checkpoints.push(Math.floor(k / 2) * L + (k % 2) * this.halfLap);
    // Each section's time is built around the pace the light allows halfway along it.
    const pace = RACE.PACE_KMH * KMH * this.surf.pace;
    this.allowance = this.checkpoints.map((p, k) => {
      const from = k ? this.checkpoints[k - 1] : 0;
      return (p - from) / (pace * this.sightAt((from + p) / 2 / L));
    });
    // First section also covers the run from the back of the grid to the line.
    const gridBack = this.track.startZ - this.track.gridSlot(FIELD_SIZE - 1).dist;
    this.allowance[0] += RACE.START_BONUS + gridBack / (pace * this.sightAt(0));

    // Grid: computer cars in skill order from pole, humans at the back.
    const ai = opts.roster
      .map(r => ({ ...r, skill: Math.min(1, r.base + this.stage * 0.012) }))
      .sort((a, b) => b.skill - a.skill);
    const humans = opts.humans || [];
    const aiCount = FIELD_SIZE - humans.length;
    ai.slice(0, aiCount).forEach((r, slot) => {
      const g = this.track.gridSlot(slot);
      this.cars.push(Physics.createCar(r.def, { id: r.id, name: r.name, paint: r.paint, skill: r.skill, dist: g.dist, x: g.x }));
    });
    humans.forEach((h, i) => {
      const g = this.track.gridSlot(aiCount + i);
      const car = Physics.createCar(h.def, { id: h.id, name: h.name, paint: h.paint, human: i, manual: h.manual, dist: g.dist, x: g.x });
      Object.assign(car, {
        timeLeft: this.allowance[0], nextCp: 0, finished: false, out: false,
        finishTime: 0, msg: null, skyOffset: 0, lastPos: FIELD_SIZE, bestLap: Infinity, lapStart: null,
      });
      this.cars.push(car);
      this.humans.push(car);
    });
    for (const car of this.cars) {
      car.z = U.mod(car.dist, L);
      car.laneX = car.x;
      car.laneTimer = 2 + Math.random() * 4;
      car.finishTime = car.finishTime || 0;
      car.skyOffset = 0;
    }
    this.order = this.cars.slice();
    this.bucketCars();
  }

  progress(car) {
    return car.dist - this.track.startZ;
  }

  // How dark it is (1 = night, 0 = day) `laps` laps from the start line. With a
  // dawn the night lasts one lap and the next lap gets light.
  darkAt(laps) {
    const s = this.season;
    if (!s.night) return 0;
    return s.dawn ? 1 - U.clamp(laps - 1, 0, 1) : 1;
  }

  darkness(car) {
    return this.darkAt(this.progress(car) / this.track.length);
  }

  // Pace factor for poor visibility: the season's `sight`, easing to 1 at dawn.
  sightAt(laps) {
    const sight = this.season.sight || 1;
    return this.season.night ? 1 - (1 - sight) * this.darkAt(laps) : sight;
  }

  lapOf(car) {
    return U.clamp(Math.floor(this.progress(car) / this.track.length) + 1, 1, LAPS);
  }

  positionOf(car) {
    return this.order.indexOf(car) + 1;
  }

  message(car, text, sub, t) {
    car.msg = { text, sub: sub || '', t: t || 2 };
  }

  // ---- update -------------------------------------------------------------
  update(dt, controls) {
    if (this.state === 'countdown') {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      const after = Math.ceil(this.countdown);
      if (after !== before && after <= 3 && after >= 1) Sfx.beep(440, 0.18);
      for (const h of this.humans) Physics.revOnGrid(h, controls[h.human].throttle, dt);
      if (this.countdown <= 0) {
        this.state = 'running';
        Sfx.beep(880, 0.4);
        for (const h of this.humans) this.message(h, 'GO!', '', 1);
      }
      return;
    }

    this.time += dt;
    for (const car of this.cars) {
      if (car.human >= 0 && !car.finished) {
        const ctl = car.out ? { steer: 0, throttle: 0, brake: 0.25, gearUp: false, gearDown: false } : controls[car.human];
        Physics.stepCar(car, ctl, dt, this.track, this.surf);
        this.sceneryCollision(car);
      } else {
        Physics.stepCar(car, this.aiControl(car), dt, this.track, this.surf);
        car.x = U.clamp(car.x, -0.95, 0.95);
      }
      car.skyOffset += this.track.segAt(car.z).curve * (car.speed / PHYS.REF_SPEED) * dt * 0.012;
    }
    this.carCollisions();
    if (!this.attract) this.timing(dt);
    this.rank();
    this.bucketCars();
  }

  timing(dt) {
    for (const car of this.cars) {
      if (car.human < 0 && !car.finishTime && this.progress(car) >= this.raceDist) {
        car.finishTime = this.time;
        this.finishCount++;
      }
    }
    let allDone = this.humans.length > 0;
    for (const h of this.humans) {
      if (h.msg && (h.msg.t -= dt) <= 0) h.msg = null;
      if (h.lapStart === null && this.progress(h) >= 0) h.lapStart = this.time;
      if (!h.finished && !h.out) {
        h.timeLeft -= dt;
        while (!h.finished && this.progress(h) >= this.checkpoints[h.nextCp]) {
          const k = h.nextCp++;
          if (k % 2 === 1) {
            // Crossed the start/finish line.
            if (h.lapStart !== null) h.bestLap = Math.min(h.bestLap, this.time - h.lapStart);
            h.lapStart = this.time;
          }
          if (h.nextCp >= this.checkpoints.length) {
            h.finished = true;
            h.finishTime = this.time;
            this.finishCount++;
            const pos = this.positionOf(h);
            this.message(h, 'FINISHED', U.ordinal(pos) + ' PLACE', 99);
            Sfx.fanfare(pos <= QUALIFY_POS);
          } else {
            h.timeLeft += this.allowance[h.nextCp];
            const lap = Math.floor(h.nextCp / 2) + 1;
            const label = k % 2 === 0 ? 'CHECKPOINT' : lap === LAPS ? 'FINAL LAP' : 'LAP ' + lap;
            this.message(h, label, 'TIME +' + Math.round(this.allowance[h.nextCp]) + 's', 2.2);
            Sfx.checkpoint();
          }
        }
        if (!h.finished && h.timeLeft <= 0) {
          h.timeLeft = 0;
          h.out = true;
          this.message(h, 'OUT OF TIME', '', 99);
          Sfx.outOfTime();
        }
      }
      if (!h.finished && !h.out) allDone = false;
    }
    if (allDone && this.state === 'running') {
      this.overTimer += dt;
      if (this.overTimer > 3.5) this.state = 'over';
    }
  }

  rank() {
    const prog = new Map(this.cars.map(c => [c, this.progress(c)]));
    this.order.sort((a, b) => {
      const fa = a.finishTime > 0, fb = b.finishTime > 0;
      if (fa && fb) return a.finishTime - b.finishTime;
      if (fa !== fb) return fa ? -1 : 1;
      return prog.get(b) - prog.get(a);
    });
  }

  bucketCars() {
    // Tracks are shared between races, so the first pass also clears cars an
    // abandoned race (the title demo, a quit race) left behind.
    for (const seg of this.bucketed || this.track.segments) seg.cars.length = 0;
    this.bucketed = [];
    for (const car of this.cars) {
      const seg = this.track.segAt(car.z);
      seg.cars.push(car);
      this.bucketed.push(seg);
    }
  }

  // ---- computer driver ----------------------------------------------------
  aiControl(car) {
    const segs = this.track.segments, n = segs.length, L = this.track.length;
    const base = Math.floor(car.z / SEG_LEN);
    const cruising = car.human >= 0 && car.finished; // a human car after the flag

    // Brake for the sharpest bend coming up.
    const look = 12 + Math.floor(car.speed / KMH / 5);
    let maxC = 0;
    for (let k = 0; k < look; k++) maxC = Math.max(maxC, Math.abs(segs[(base + k) % n].curve));
    let target = Math.min(car.ph.top * (cruising ? 0.55 : car.skill), Physics.cornerSpeed(car.ph, this.surf, maxC / CURVE_MAX, 0.8 * car.skill));
    if (!cruising) target *= this.sightAt(this.progress(car) / L); // mist, night: they can't see as far either

    // Traffic: change lanes around slower cars, or tuck in behind them.
    car.laneTimer -= 1 / 60;
    if (car.laneTimer <= 0) {
      car.laneTimer = 3 + Math.random() * 6;
      if (Math.random() < 0.35) car.laneX = [-0.55, 0, 0.55][Math.floor(Math.random() * 3)];
    }
    let blocker = null;
    for (const o of this.cars) {
      if (o === car) continue;
      const dz = U.mod(o.z - car.z, L);
      if (dz > 0 && dz < 1800 && Math.abs(o.x - car.laneX) < 0.5 && o.speed < car.speed + 2 * KMH) {
        if (!blocker || dz < blocker.dz) blocker = { car: o, dz };
      }
    }
    if (blocker) {
      const free = [-0.6, 0, 0.6].filter(lane => !this.cars.some(o => {
        if (o === car) return false;
        const dz = U.mod(o.z - car.z + 600, L) - 600;
        return dz > -600 && dz < 2200 && Math.abs(o.x - lane) < 0.5;
      }));
      if (free.length) {
        free.sort((a, b) => Math.abs(a - car.x) - Math.abs(b - car.x));
        car.laneX = free[0];
      } else if (blocker.dz < 1200) {
        target = Math.min(target, blocker.car.speed * 0.98);
      }
    }

    // Steer to hold the chosen lane against the bend's outward push.
    const seg = segs[base % n];
    const vRel = car.speed / PHYS.REF_SPEED;
    const cent = (seg.curve / CURVE_MAX) * vRel * vRel * PHYS.CENT * Physics.drift(car.ph, this.surf) / this.surf.grip;
    const authority = PHYS.STEER * U.clamp(car.speed / (60 * KMH), 0.05, 1);
    const steer = U.clamp(((car.laneX - car.x) * 2.5 + cent) / authority, -1, 1);

    let throttle = 1, brake = 0;
    if (car.speed > target + 3 * KMH) {
      throttle = 0;
      brake = U.clamp((car.speed - target) / (25 * KMH), 0.2, 1);
    } else if (car.speed > target) {
      throttle = 0.2;
    }
    return { steer, throttle, brake, gearUp: false, gearDown: false };
  }

  // ---- collisions ---------------------------------------------------------
  sceneryCollision(car) {
    if (Math.abs(car.x) < 1 || car.crash > 0) return;
    const seg = this.track.segAt(car.z);
    const carW = car.def.worldW / ROAD_W;
    for (const s of seg.sprites) {
      if (!s.def.solid) continue;
      if (Math.abs(car.x - s.offset) < (carW + s.def.hit) / 2) {
        const hard = car.speed > 60 * KMH;
        car.speed *= hard ? 0.12 : 0.4;
        car.crash = hard ? 0.7 : 0.25;
        car.x -= U.sign(car.x) * 0.2;
        car.dist -= 120;
        car.z = U.mod(car.dist, this.track.length);
        hard ? Sfx.crash() : Sfx.bump();
        return;
      }
    }
  }

  carCollisions() {
    const L = this.track.length;
    for (const h of this.humans) {
      for (const o of this.cars) {
        if (o === h || (o.human >= 0 && o.human < h.human)) continue;
        const dz = U.mod(o.z - h.z + L / 2, L) - L / 2; // + : o is ahead of h
        if (Math.abs(dz) > RACE.CAR_LEN) continue;
        const reach = ((h.def.worldW + o.def.worldW) / 2 / ROAD_W) * 0.9;
        const dx = o.x - h.x;
        if (Math.abs(dx) > reach) continue;
        const [back, front] = dz >= 0 ? [h, o] : [o, h];
        const closing = back.speed - front.speed;
        if (closing > 0 && Math.abs(dx) < reach * 0.75) {
          back.speed = front.speed * 0.92;
          front.speed = Math.min(front.ph.top, front.speed + closing * 0.25);
          back.dist -= RACE.CAR_LEN - Math.abs(dz);
          back.z = U.mod(back.dist, L);
          if (closing > 20 * KMH) Sfx.bump();
        } else {
          // Side by side: push apart.
          const push = (reach - Math.abs(dx)) * 0.5 + 0.02;
          const s = dx >= 0 ? 1 : -1;
          o.x += push * s;
          h.x -= push * s;
          if (o.human < 0) o.laneX = o.x;
          h.speed *= 0.995;
        }
      }
    }
  }

  // ---- results ------------------------------------------------------------
  results() {
    const rows = this.cars.map(car => {
      let time, dnf = false;
      if (car.human >= 0) {
        dnf = !car.finished;
        time = car.finished ? car.finishTime : Infinity;
      } else if (car.finishTime) {
        time = car.finishTime;
      } else {
        // Project the computer's finishing time from its average pace so far.
        const done = Math.max(1, this.progress(car));
        const avg = done / Math.max(1, this.time);
        time = this.time + (this.raceDist - done) / Math.max(avg, 40 * KMH);
      }
      return { car, id: car.id, name: car.name, def: car.def, paint: car.paint, human: car.human, time, dnf };
    });
    rows.sort((a, b) => (a.dnf !== b.dnf ? (a.dnf ? 1 : -1) : a.time - b.time));
    rows.forEach((r, i) => {
      r.pos = i + 1;
      r.points = r.dnf ? 0 : POINTS[i] || 0;
      r.qualified = !r.dnf && r.pos <= QUALIFY_POS;
    });
    return rows;
  }
}
