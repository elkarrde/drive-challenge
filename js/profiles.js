'use strict';

// ---------------------------------------------------------------------------
// Player profiles: one per controller slot, kept in localStorage. A profile's
// UUID is its identity (championship points are keyed by it); the name is
// only a label and can be changed. Names must be unique among the profiles
// and must not clash with a computer driver.
// ---------------------------------------------------------------------------
const NAME_MAX = 12;
const NAME_CHARS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-\'';

const Profiles = {
  KEY: 'drive-challenge.players',
  list: null,

  uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    // randomUUID needs a secure context; plain http on a LAN address is not one.
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  },

  load() {
    let saved = [];
    try { saved = JSON.parse(localStorage.getItem(this.KEY)) || []; } catch (e) { /* storage blocked or corrupt */ }
    if (!Array.isArray(saved)) saved = [];
    this.list = [];
    for (let i = 0; i < 2; i++) {
      const p = saved[i];
      const ok = p && typeof p.id === 'string' && typeof p.name === 'string';
      const name = ok ? this.clean(p.name) : '';
      this.list.push({ id: ok ? p.id : this.uuid(), name: name || 'PLAYER ' + (i + 1) });
    }
    // A hand-edited store could hold a clash; fall back to the default label.
    this.list.forEach((p, i) => { if (this.problem(p.name, i)) p.name = 'PLAYER ' + (i + 1); });
    this.save();
  },

  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.list)); } catch (e) { /* ignore */ }
  },

  get(slot) {
    if (!this.list) this.load();
    return this.list[slot];
  },

  // Upper-case, allowed characters only, single spaces, trimmed, clipped.
  clean(name) {
    const up = String(name).toUpperCase().split('').filter(c => NAME_CHARS.includes(c)).join('');
    return up.replace(/ +/g, ' ').trim().slice(0, NAME_MAX);
  },

  // Why `name` cannot be used by `slot`, or null when it can.
  problem(name, slot) {
    const n = this.clean(name);
    if (!n) return 'NAME IS EMPTY';
    if (AI_DRIVERS.includes(n)) return 'NAME TAKEN';
    if (this.list.some((p, i) => i !== slot && p.name === n)) return 'NAME TAKEN';
    return null;
  },

  rename(slot, name) {
    if (this.problem(name, slot)) return false;
    this.get(slot).name = this.clean(name);
    this.save();
    return true;
  },
};
