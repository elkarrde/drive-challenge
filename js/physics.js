'use strict';

// ---------------------------------------------------------------------------
// Car physics. Every car – human or computer – runs through stepCar(), so the
// three ratings shape the AI cars exactly as they shape the player's.
//
// Rating → simulation mapping
//   speed  1..5  → top speed 226..282 km/h          (212 + 14 * rating)
//   accel  1..5  → peak thrust, km/h per sec
//                  accelDry on dry tarmac:   21..49 (14 + 7 * rating)
//                  accelWet on rain and snow: 29..49 (24 + 5 * rating)
//   corner 1..5  → speed scrub while turning: 1.32..0.20 (1.6 - 0.28 * rating)
//                  outward drift in bends:     1.20..0.80 (1.3 - 0.1 * rating)
// ---------------------------------------------------------------------------
const PHYS = {
  REF_SPEED: 280 * KMH,  // cornering forces are expressed relative to this speed
  STEER: 2.2,            // road half-widths per second at full lock
  CENT: 1.8,             // outward push in a full-strength bend at REF_SPEED
  SCRUB: 0.62,           // fraction of speed lost per second in a full bend at REF_SPEED
  BRAKE: 85 * KMH,
  COAST: 5 * KMH,
  SLOPE: 30 * KMH,
  OFFROAD_MAX: 85 * KMH,
  AUTO_SHIFT_TIME: 0.32, // throttle cut while the automatic changes gear
  MANUAL_SHIFT_TIME: 0.05,
  IDLE_RPM: 900,
};

const Physics = {
  derive(def) {
    const s = def.stats;
    return {
      top: (212 + 14 * s.speed) * KMH,
      accelDry: (14 + 7 * s.accelDry) * KMH,
      accelWet: (24 + 5 * s.accelWet) * KMH,
      scrub: 1.6 - 0.28 * s.corner,
      drift: 1.3 - 0.1 * s.corner,
      ratios: def.ratios,
      gearMul: def.ratios.map(r => Math.pow(1 / r, 0.3)),
    };
  },

  // Engine torque across the rev range of a gear (r = 0 at standstill, 1 at the limiter).
  powerCurve(r) {
    return U.clamp(0.45 + 1.4 * r - 0.85 * r * r, 0.3, 1);
  },

  // The speed at which a car can hold a bend of the given strength (0..1)
  // using `margin` of its steering authority. Used by the AI to pick a braking point.
  cornerSpeed(ph, surf, curveN, margin) {
    if (curveN < 0.01) return Infinity;
    const v2 = (margin * PHYS.STEER) / (PHYS.CENT * ph.drift / surf.grip * curveN);
    return PHYS.REF_SPEED * Math.sqrt(v2);
  },

  createCar(def, opts) {
    return {
      def,
      ph: Physics.derive(def),
      paint: opts.paint || def.paint,
      name: opts.name || def.model,
      id: opts.id || null,
      human: opts.human != null ? opts.human : -1,
      manual: !!opts.manual,
      skill: opts.skill || 1,
      dist: opts.dist || 0,   // unwrapped distance along the course
      z: 0,                   // dist wrapped onto the lap
      x: opts.x || 0,
      speed: 0,
      gear: 0,
      shift: 0,
      rpm: PHYS.IDLE_RPM,
      throttle: 0,
      brake: 0,
      steer: 0,
      skid: 0,
      offroad: false,
      crash: 0,
      bump: 0,
    };
  },

  stepCar(car, ctl, dt, track, surf) {
    const ph = car.ph;
    const seg = track.segAt(car.z);
    const n = ph.ratios.length;

    // --- gearbox -----------------------------------------------------------
    if (car.manual) {
      if (ctl.gearUp && car.gear < n - 1) { car.gear++; car.shift = PHYS.MANUAL_SHIFT_TIME; }
      if (ctl.gearDown && car.gear > 0) { car.gear--; car.shift = PHYS.MANUAL_SHIFT_TIME; }
    } else {
      const rNow = car.speed / (ph.top * ph.ratios[car.gear]);
      if (rNow >= 0.97 && car.gear < n - 1 && ctl.throttle > 0) {
        car.gear++;
        car.shift = PHYS.AUTO_SHIFT_TIME;
      } else if (car.gear > 0 && car.speed < ph.top * ph.ratios[car.gear - 1] * 0.78) {
        car.gear--;
      }
    }
    if (car.shift > 0) car.shift -= dt;

    // --- longitudinal ------------------------------------------------------
    const gearTop = ph.top * ph.ratios[car.gear];
    const r = car.speed / gearTop;
    const accel = surf.wet ? ph.accelWet : ph.accelDry;
    let a = 0;
    if (ctl.throttle > 0 && car.shift <= 0 && r < 1 && car.crash <= 0) {
      const topFade = Math.max(0, 1 - Math.pow(car.speed / ph.top, 2.5));
      a += ctl.throttle * accel * ph.gearMul[car.gear] * Physics.powerCurve(r) * topFade;
    }
    if (r > 1.02) a -= (r - 1) * 80 * KMH; // over-revving after an early downshift
    a -= ctl.brake * PHYS.BRAKE * surf.brake;
    a -= PHYS.COAST;
    a -= ((seg.y2 - seg.y1) / SEG_LEN) * PHYS.SLOPE;
    car.speed = Math.max(0, car.speed + a * dt);

    // --- cornering ---------------------------------------------------------
    const vRel = car.speed / PHYS.REF_SPEED;
    const curveN = seg.curve / CURVE_MAX;
    const load = 0.6 * Math.abs(curveN) + 0.4 * Math.abs(ctl.steer);
    const scrub = PHYS.SCRUB * ph.scrub * load * vRel / Math.sqrt(surf.grip);
    car.speed -= car.speed * Math.min(0.9, scrub * dt);

    const lat = ctl.steer * PHYS.STEER * U.clamp(car.speed / (60 * KMH), 0, 1);
    const cent = curveN * vRel * vRel * PHYS.CENT * ph.drift / surf.grip;
    car.x += (lat - cent) * dt;
    car.skid = U.clamp(Math.max(Math.abs(cent) - 0.8, Math.abs(ctl.steer) * vRel - 0.55) * 1.6, 0, 1);

    // --- off road ----------------------------------------------------------
    car.offroad = Math.abs(car.x) > 1.05;
    if (car.offroad && car.speed > PHYS.OFFROAD_MAX) {
      car.speed -= (car.speed - PHYS.OFFROAD_MAX) * 2.4 * dt;
    }
    car.x = U.clamp(car.x, -2.6, 2.6);
    if (car.crash > 0) car.crash -= dt;
    if (car.bump > 0) car.bump -= dt;

    // --- revs (purely for display and sound) -------------------------------
    const target = PHYS.IDLE_RPM + (car.def.redline - PHYS.IDLE_RPM) * U.clamp(car.speed / gearTop, 0, 1.05);
    car.rpm += (target - car.rpm) * Math.min(1, dt * 12);

    car.throttle = ctl.throttle;
    car.brake = ctl.brake;
    car.steer = ctl.steer;
    car.dist += car.speed * dt;
    car.z = U.mod(car.dist, track.length);
  },

  // Free-revving engine on the grid before the start (sound only).
  revOnGrid(car, throttle, dt) {
    const target = PHYS.IDLE_RPM + (car.def.redline * 0.85 - PHYS.IDLE_RPM) * throttle;
    car.rpm += (target - car.rpm) * Math.min(1, dt * (throttle > 0 ? 6 : 3));
    car.throttle = throttle;
  },
};
