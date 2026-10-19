'use strict';

// ---------------------------------------------------------------------------
// Online records: fastest laps and race times per season, and championship
// totals, kept by api/records.php. Every call fails quietly: from file://,
// on a static server or offline, the game simply has no records to show.
// ---------------------------------------------------------------------------
const Records = {
  URL: 'api/records.php',
  data: null,
  state: 'idle',     // idle | loading | ready | failed

  load() {
    this.state = 'loading';
    fetch(this.URL, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => {
        if (d.version !== RECORDS_VERSION) throw new Error('records version ' + d.version);
        this.data = d;
        this.state = 'ready';
      })
      .catch(() => { this.state = 'failed'; });
  },

  // entries: [{kind: 'lap'|'race'|'champ', season, car, value}]. `done` gets
  // the server's results ([{kind, season, rank, improved}]) and is not called
  // when the submission fails.
  submit(player, entries, done) {
    if (!entries.length || location.protocol === 'file:') return;
    fetch(this.URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: RECORDS_VERSION, uuid: player.id, name: player.name, entries }),
    })
      .then(r => (r.ok ? r.json() : Promise.reject(r.status)))
      .then(d => {
        this.data = null;           // tables changed; reload on the next visit
        this.state = 'idle';
        if (done) done(d.results || []);
      })
      .catch(() => {});
  },
};
