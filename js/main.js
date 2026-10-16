'use strict';

// ---------------------------------------------------------------------------
// Boot and main loop. The game renders into a 480×300 canvas that CSS scales
// up with nearest-neighbour filtering; logic runs on a fixed 60 Hz step.
// ---------------------------------------------------------------------------
(function () {
  const canvas = document.getElementById('screen');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  function fit() {
    const k = Math.min(innerWidth / SCREEN_W, innerHeight / SCREEN_H);
    // Whole-number scales stay crisp; below 2× use whatever fits.
    const scale = k >= 2 ? Math.floor(k * 4) / 4 : k;
    canvas.style.width = Math.floor(SCREEN_W * scale) + 'px';
    canvas.style.height = Math.floor(SCREEN_H * scale) + 'px';
  }
  addEventListener('resize', fit);
  fit();

  const STEP = 1 / 60;
  let last = 0, acc = 0, toast = null;

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000 || STEP);
    last = now;
    acc += dt;
    Input.poll();
    if (Input.key('KeyM')) Sfx.toggleMute();
    if (Input.key('KeyN')) toast = { text: Music.toggle() ? 'MUSIC ON' : 'MUSIC OFF', t: 1.5 };
    while (acc >= STEP) {
      Game.update(STEP);
      Input.endFrame();
      acc -= STEP;
    }
    Music.update();
    Game.draw(ctx);
    if (toast && (toast.t -= dt) > 0) Render.text(ctx, toast.text, SCREEN_W / 2, SCREEN_H - 24, 8, '#ffe040');
    if (Sfx.muted) Render.text(ctx, 'MUTE', SCREEN_W - 4, SCREEN_H - 10, 8, '#ff8060', 'right');
    requestAnimationFrame(frame);
  }

  function boot() {
    Input.init();
    Input.onFirstInput = () => Sfx.init();
    Sprites.init();
    Music.init();
    Game.screen = new TitleScreen();
    Game.screen.enter();
    Game.fade = 1;
    Game.fadeDir = -1;
    requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
  }

  // Wait for the pixel font so the first frames are not drawn in a fallback.
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SCREEN_W, SCREEN_H);
  const fontReady = document.fonts && document.fonts.load
    ? Promise.race([document.fonts.load('8px "Press Start 2P"'), new Promise(r => setTimeout(r, 2500))])
    : Promise.resolve();
  fontReady.catch(() => {}).then(boot);
})();
