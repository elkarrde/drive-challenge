'use strict';

// ---------------------------------------------------------------------------
// Keyboard + gamepad. In a one-player game both keyboard layouts and any
// gamepad drive player 1; in two-player mode each player has their own.
// Codes are physical key positions (KeyboardEvent.code), so the layout works
// the same on non-US keyboards.
// ---------------------------------------------------------------------------
const KEYMAP = [
  {
    left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
    gearUp: ['ShiftRight', 'Slash'], gearDown: ['Period'], fire: ['Enter', 'NumpadEnter'],
  },
  {
    left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
    gearUp: ['KeyE'], gearDown: ['KeyQ'], fire: ['Space'],
  },
];
const GAME_KEYS = new Set([...KEYMAP.flatMap(m => Object.values(m).flat()), 'Escape', 'KeyP', 'KeyM', 'KeyN', 'Backspace']);

const Input = {
  held: new Set(),
  hits: new Set(),
  pads: [],
  padPrev: [[], [], [], []],
  padHits: [new Set(), new Set(), new Set(), new Set()],
  onFirstInput: null,

  init() {
    addEventListener('keydown', e => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.hits.add(e.code);
      this.held.add(e.code);
      if (this.onFirstInput) this.onFirstInput();
    });
    addEventListener('keyup', e => this.held.delete(e.code));
    addEventListener('blur', () => this.held.clear());
    addEventListener('mousedown', () => this.onFirstInput && this.onFirstInput());
  },

  // Call once per frame before reading input.
  poll() {
    const pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    this.pads = pads;
    pads.slice(0, 4).forEach((pad, i) => {
      const now = pad.buttons.map(b => b.pressed);
      // D-pad and stick as "buttons" 100..103 for menu navigation.
      now[100] = pad.axes[0] < -0.6; now[101] = pad.axes[0] > 0.6;
      now[102] = pad.axes[1] < -0.6; now[103] = pad.axes[1] > 0.6;
      const prev = this.padPrev[i];
      for (const b of [0, 1, 4, 5, 9, 12, 13, 14, 15, 100, 101, 102, 103]) {
        if (now[b] && !prev[b]) {
          this.padHits[i].add(b);
          if (this.onFirstInput) this.onFirstInput();
        }
      }
      this.padPrev[i] = now;
    });
  },

  // Call once per frame after the frame's logic has run.
  endFrame() {
    this.hits.clear();
    for (const s of this.padHits) s.clear();
  },

  isHeld(codes) { return codes.some(c => this.held.has(c)); },
  isHit(codes) { return codes.some(c => this.hits.has(c)); },
  key(code) { return this.hits.has(code); },

  maps(player, solo) { return solo ? KEYMAP : [KEYMAP[player]]; },
  padsFor(player, solo) {
    if (solo) return this.pads.map((p, i) => i);
    return this.pads[player] ? [player] : [];
  },

  // Driving controls for one player.
  drive(player, solo) {
    let steer = 0, throttle = 0, brake = 0, gearUp = false, gearDown = false;
    for (const m of this.maps(player, solo)) {
      if (this.isHeld(m.left)) steer -= 1;
      if (this.isHeld(m.right)) steer += 1;
      if (this.isHeld(m.up)) throttle = 1;
      if (this.isHeld(m.down)) brake = 1;
      gearUp = gearUp || this.isHit(m.gearUp);
      gearDown = gearDown || this.isHit(m.gearDown);
    }
    for (const i of this.padsFor(player, solo)) {
      const pad = this.pads[i];
      const b = n => (pad.buttons[n] ? pad.buttons[n].value : 0);
      const ax = Math.abs(pad.axes[0]) > 0.15 ? pad.axes[0] : 0;
      steer += ax + (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
      throttle = Math.max(throttle, b(0), b(7));
      brake = Math.max(brake, b(2), b(6));
      gearUp = gearUp || this.padHits[i].has(5);
      gearDown = gearDown || this.padHits[i].has(4);
    }
    return { steer: U.clamp(steer, -1, 1), throttle: U.clamp(throttle, 0, 1), brake: U.clamp(brake, 0, 1), gearUp, gearDown };
  },

  // Edge-triggered menu actions for one player.
  menu(player, solo) {
    const out = { left: false, right: false, up: false, down: false, fire: false, back: false };
    for (const m of this.maps(player, solo)) {
      out.left = out.left || this.isHit(m.left);
      out.right = out.right || this.isHit(m.right);
      out.up = out.up || this.isHit(m.up);
      out.down = out.down || this.isHit(m.down);
      out.fire = out.fire || this.isHit(m.fire);
    }
    if (solo) out.fire = out.fire || this.key('Space') || this.key('Enter');
    out.back = this.key('Escape') || this.key('Backspace');
    for (const i of this.padsFor(player, solo)) {
      const h = this.padHits[i];
      out.left = out.left || h.has(14) || h.has(100);
      out.right = out.right || h.has(15) || h.has(101);
      out.up = out.up || h.has(12) || h.has(102);
      out.down = out.down || h.has(13) || h.has(103);
      out.fire = out.fire || h.has(0) || h.has(9);
      out.back = out.back || h.has(1);
    }
    return out;
  },

  anyFire() {
    return this.menu(0, true).fire;
  },
  pause() {
    return this.key('Escape') || this.key('KeyP') || this.padHits.some(h => h.has(9));
  },
};
