'use strict';

// ---------------------------------------------------------------------------
// All artwork is drawn procedurally into small off-screen canvases at a low
// pixel resolution and scaled up with nearest-neighbour sampling, which gives
// the chunky 16-bit look without shipping any image files.
// ---------------------------------------------------------------------------

// World size (units), source pixel size, and collision data per sprite key.
// `hit` is the collision width in road half-widths (only for solid sprites).
const SPRITE_DEFS = {
  oak_orange:   { w: 1900, h: 2500, px: [36, 48], solid: true, hit: 0.3 },
  oak_red:      { w: 1900, h: 2500, px: [36, 48], solid: true, hit: 0.3 },
  birch:        { w: 1100, h: 2700, px: [22, 54], solid: true, hit: 0.2 },
  bush_autumn:  { w: 1200, h: 650,  px: [30, 16], solid: false },
  haybale:      { w: 850,  h: 650,  px: [22, 17], solid: true, hit: 0.45 },
  pine_snow:    { w: 1500, h: 3200, px: [30, 64], solid: true, hit: 0.25 },
  pine_small:   { w: 950,  h: 1800, px: [20, 38], solid: true, hit: 0.2 },
  bare_tree:    { w: 1700, h: 2600, px: [34, 52], solid: true, hit: 0.2 },
  rock_snow:    { w: 1100, h: 650,  px: [28, 16], solid: true, hit: 0.5 },
  snowman:      { w: 650,  h: 1050, px: [16, 26], solid: true, hit: 0.3 },
  blossom:      { w: 1900, h: 2400, px: [36, 46], solid: true, hit: 0.3 },
  tree_green:   { w: 1900, h: 2500, px: [36, 48], solid: true, hit: 0.3 },
  bush_green:   { w: 1200, h: 650,  px: [30, 16], solid: false },
  tulips:       { w: 1400, h: 380,  px: [34, 9],  solid: false },
  cottage:      { w: 3000, h: 2300, px: [50, 38], solid: true, hit: 1.5 },
  tree_summer:  { w: 2000, h: 2600, px: [38, 50], solid: true, hit: 0.3 },
  cypress:      { w: 700,  h: 3000, px: [14, 60], solid: true, hit: 0.25 },
  sunflowers:   { w: 1500, h: 800,  px: [34, 18], solid: false },
  rock:         { w: 1100, h: 700,  px: [28, 18], solid: true, hit: 0.5 },
  post:         { w: 90,   h: 430,  px: [3, 14],  solid: false },
  chevron_r:    { w: 800,  h: 950,  px: [20, 24], solid: true, hit: 0.35 },
  chevron_l:    { w: 800,  h: 950,  px: [20, 24], solid: true, hit: 0.35 },
  billboard_a:  { w: 2800, h: 1800, px: [60, 38], solid: true, hit: 1.6 },
  billboard_b:  { w: 2800, h: 1800, px: [60, 38], solid: true, hit: 1.6 },
  billboard_c:  { w: 2800, h: 1800, px: [60, 38], solid: true, hit: 1.6 },
  crowd:        { w: 1700, h: 760,  px: [40, 18], solid: true, hit: 1.0 },
  banner_start:      { w: ROAD_W * 2.7, h: 2100, px: [124, 60], solid: false, overhead: true },
  banner_checkpoint: { w: ROAD_W * 2.7, h: 2100, px: [124, 60], solid: false, overhead: true },
};

const PIXEL_FONT = '"Press Start 2P", "Courier New", monospace';

// ---- pixel primitives ------------------------------------------------------
const Px = {
  rect(ctx, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  },
  // Filled pixel circle drawn row by row so it stays crisp.
  disc(ctx, cx, cy, r, c) {
    ctx.fillStyle = c;
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(r * r - dy * dy));
      ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2 + 1, 1);
    }
  },
  ellipse(ctx, cx, cy, rx, ry, c) {
    ctx.fillStyle = c;
    for (let dy = -ry; dy <= ry; dy++) {
      const half = Math.floor(rx * Math.sqrt(1 - (dy * dy) / (ry * ry)));
      ctx.fillRect(Math.round(cx - half), Math.round(cy + dy), half * 2 + 1, 1);
    }
  },
  // Isosceles triangle, apex at the top.
  tri(ctx, cx, top, bottom, halfW, c) {
    ctx.fillStyle = c;
    const h = bottom - top;
    for (let y = 0; y <= h; y++) {
      const half = Math.round((y / h) * halfW);
      ctx.fillRect(Math.round(cx - half), top + y, half * 2 + 1, 1);
    }
  },
  // Trapezoid between two horizontal spans.
  trap(ctx, y1, x1a, x1b, y2, x2a, x2b, c) {
    ctx.fillStyle = c;
    const h = y2 - y1;
    for (let y = 0; y < h; y++) {
      const t = h <= 1 ? 0 : y / (h - 1);
      const a = Math.round(U.lerp(x1a, x2a, t));
      const b = Math.round(U.lerp(x1b, x2b, t));
      ctx.fillRect(a, y1 + y, b - a, 1);
    }
  },
  speckle(ctx, r, x, y, w, h, n, colors) {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = colors[Math.floor(r() * colors.length)];
      ctx.fillRect(Math.floor(x + r() * w), Math.floor(y + r() * h), 1, 1);
    }
  },
  text(ctx, str, x, y, size, color, align) {
    ctx.font = size + 'px ' + PIXEL_FONT;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = color;
    ctx.fillText(str, Math.round(x), Math.round(y));
  },
};

// ---- scenery painters ------------------------------------------------------
function paintLeafTree(ctx, w, h, r, trunk, leaves) {
  const [dark, mid, light] = leaves;
  Px.rect(ctx, w / 2 - 3, h * 0.55, 6, h * 0.45, trunk);
  Px.rect(ctx, w / 2 - 3, h * 0.55, 2, h * 0.45, U.shade(trunk, -0.3));
  const blobs = [[0.5, 0.36, 0.34], [0.3, 0.46, 0.24], [0.7, 0.46, 0.24], [0.5, 0.2, 0.26], [0.36, 0.28, 0.2], [0.64, 0.3, 0.2]];
  for (const [bx, by, br] of blobs) Px.disc(ctx, bx * w, by * h, Math.round(br * w), dark);
  for (const [bx, by, br] of blobs) Px.disc(ctx, bx * w - 2, by * h - 2, Math.round(br * w * 0.75), mid);
  for (const [bx, by, br] of blobs.slice(3)) Px.disc(ctx, bx * w - 3, by * h - 3, Math.round(br * w * 0.45), light);
  Px.speckle(ctx, r, w * 0.15, h * 0.05, w * 0.7, h * 0.5, 50, [dark, light]);
}

function paintPine(ctx, w, h, snow) {
  const trunk = '#4a3020';
  Px.rect(ctx, w / 2 - 2, h * 0.84, 4, h * 0.16, trunk);
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const top = Math.round(h * (0.02 + i * 0.19));
    const bottom = Math.round(h * (0.3 + i * 0.19));
    const half = (w / 2 - 1) * (0.45 + i * 0.18);
    Px.tri(ctx, w / 2, top, bottom, half, '#1f4a32');
    Px.tri(ctx, w / 2 - 1, top + 2, bottom - 1, half * 0.7, '#2b5e40');
    if (snow) {
      Px.tri(ctx, w / 2, top, Math.round(top + (bottom - top) * 0.45), half * 0.45, '#f4f8fb');
      ctx.fillStyle = '#e8eff5';
      for (let x = -half; x <= half; x += 3) ctx.fillRect(Math.round(w / 2 + x), bottom - 1, 2, 2);
    }
  }
}

function paintBush(ctx, w, h, r, colors) {
  const [dark, mid, light] = colors;
  Px.ellipse(ctx, w * 0.3, h * 0.6, w * 0.28, h * 0.4, dark);
  Px.ellipse(ctx, w * 0.68, h * 0.62, w * 0.3, h * 0.38, dark);
  Px.ellipse(ctx, w * 0.5, h * 0.45, w * 0.3, h * 0.4, mid);
  Px.ellipse(ctx, w * 0.42, h * 0.38, w * 0.15, h * 0.2, light);
  Px.speckle(ctx, r, 2, 2, w - 4, h - 4, 25, [dark, light]);
}

const SceneryPainters = {
  oak_orange: (c, w, h, r) => paintLeafTree(c, w, h, r, '#5a3a22', ['#9a4a12', '#d8781e', '#f2b04a']),
  oak_red: (c, w, h, r) => paintLeafTree(c, w, h, r, '#4e3220', ['#7a1e14', '#b8361c', '#e2703a']),
  birch(c, w, h, r) {
    Px.rect(c, w / 2 - 2, h * 0.3, 4, h * 0.7, '#ece8de');
    for (let y = h * 0.35; y < h; y += 5) Px.rect(c, w / 2 - 2, y, 2 + (y % 3), 1, '#2a2a2a');
    for (const [bx, by, br] of [[0.5, 0.22, 0.42], [0.35, 0.38, 0.3], [0.66, 0.36, 0.3]]) Px.disc(c, bx * w, by * h, Math.round(br * w), '#c99a1c');
    Px.disc(c, w * 0.42, h * 0.18, Math.round(w * 0.22), '#f0d050');
    Px.speckle(c, r, 2, 2, w - 4, h * 0.5, 30, ['#8a6a10', '#ffe890']);
  },
  bush_autumn: (c, w, h, r) => paintBush(c, w, h, r, ['#6e3a14', '#a85a1e', '#d8903a']),
  bush_green: (c, w, h, r) => paintBush(c, w, h, r, ['#2a5a22', '#3e8030', '#6aae48']),
  haybale(c, w, h, r) {
    Px.ellipse(c, w / 2, h / 2 + 1, w / 2 - 1, h / 2 - 1, '#b8902e');
    Px.ellipse(c, w / 2, h / 2 + 1, w / 2 - 4, h / 2 - 4, '#d8b048');
    Px.ellipse(c, w / 2, h / 2 + 1, w / 2 - 8, h / 2 - 7, '#c49a38');
    Px.speckle(c, r, 3, 3, w - 6, h - 6, 30, ['#f0d070', '#9a7424']);
  },
  pine_snow: (c, w, h) => paintPine(c, w, h, true),
  pine_small: (c, w, h) => paintPine(c, w, h, true),
  bare_tree(c, w, h) {
    const col = '#3e3230';
    Px.rect(c, w / 2 - 2, h * 0.35, 4, h * 0.65, col);
    const branch = (x, y, dx, len) => {
      for (let i = 0; i < len; i++) c.fillRect(Math.round(x + dx * i), Math.round(y - i), 2, 2);
    };
    c.fillStyle = col;
    branch(w / 2, h * 0.5, -0.8, 14); branch(w / 2, h * 0.45, 0.9, 13);
    branch(w / 2, h * 0.36, -0.3, 16); branch(w / 2, h * 0.36, 0.4, 15);
    branch(w / 2 - 9, h * 0.3, -0.6, 7); branch(w / 2 + 10, h * 0.32, 0.7, 7);
    c.fillStyle = '#f2f6f9';
    for (let i = 0; i < 26; i++) c.fillRect(4 + ((i * 37) % (w - 8)), 4 + ((i * 53) % Math.round(h * 0.45)), 2, 1);
  },
  rock_snow(c, w, h, r) {
    Px.ellipse(c, w / 2, h * 0.62, w / 2 - 1, h * 0.38, '#6c7078');
    Px.ellipse(c, w * 0.45, h * 0.55, w * 0.36, h * 0.3, '#868b94');
    Px.ellipse(c, w * 0.45, h * 0.32, w * 0.34, h * 0.2, '#f4f8fb');
    Px.speckle(c, r, 2, h * 0.5, w - 4, h * 0.4, 14, ['#555a62']);
  },
  snowman(c, w, h) {
    Px.disc(c, w / 2, h * 0.74, Math.round(w * 0.42), '#f4f8fb');
    Px.disc(c, w / 2, h * 0.42, Math.round(w * 0.3), '#eef3f8');
    Px.disc(c, w / 2, h * 0.2, Math.round(w * 0.22), '#f8fbfd');
    Px.rect(c, w / 2 - 4, 0, 8, 3, '#202020');
    Px.rect(c, w / 2 - 5, 3, 10, 1, '#202020');
    Px.rect(c, w / 2 - 2, h * 0.18, 1, 1, '#000');
    Px.rect(c, w / 2 + 1, h * 0.18, 1, 1, '#000');
    Px.rect(c, w / 2, h * 0.22, 3, 1, '#e8701a');
    Px.rect(c, w / 2 - 5, h * 0.3, 10, 2, '#c01818');
  },
  blossom: (c, w, h, r) => {
    paintLeafTree(c, w, h, r, '#4a3228', ['#c86a92', '#f0a0c0', '#ffe0ee']);
    Px.speckle(c, r, 4, 4, w - 8, h * 0.5, 40, ['#ffffff', '#e05888']);
  },
  tree_green: (c, w, h, r) => paintLeafTree(c, w, h, r, '#4a3424', ['#245a1e', '#3a8a2a', '#72c050']),
  tree_summer: (c, w, h, r) => paintLeafTree(c, w, h, r, '#5a4028', ['#2e6a1a', '#4a9a28', '#94d050']),
  tulips(c, w, h, r) {
    Px.rect(c, 0, h - 3, w, 3, '#2e6a22');
    for (let x = 1; x < w - 1; x += 2) {
      const col = ['#e82828', '#f0d020', '#f070b0', '#ffffff'][Math.floor(r() * 4)];
      const top = Math.floor(r() * 3);
      Px.rect(c, x, top + 2, 1, h - top - 2, '#3e8a2a');
      Px.rect(c, x, top, 2, 2, col);
    }
  },
  cottage(c, w, h) {
    Px.rect(c, 6, h * 0.42, w - 12, h * 0.58, '#ece0c8');
    Px.trap(c, 2, w / 2 - 4, w / 2 + 4, Math.round(h * 0.45), 1, w - 1, '#8a2e22');
    Px.rect(c, 1, h * 0.43, w - 2, 2, '#5e1e16');
    Px.rect(c, w * 0.7, 2, 5, 10, '#6a5a50');
    Px.rect(c, w / 2 - 4, h * 0.66, 8, h * 0.34, '#5a3a22');
    for (const wx of [0.2, 0.72]) {
      Px.rect(c, w * wx, h * 0.56, 8, 7, '#3a5a80');
      Px.rect(c, w * wx + 3, h * 0.56, 1, 7, '#ece0c8');
    }
  },
  cypress(c, w, h) {
    Px.rect(c, w / 2 - 1, h * 0.9, 3, h * 0.1, '#4a3020');
    Px.ellipse(c, w / 2, h * 0.47, w / 2 - 1, h * 0.45, '#1f4a1e');
    Px.ellipse(c, w / 2 - 1, h * 0.45, w / 2 - 4, h * 0.4, '#2f6a28');
    for (let y = 6; y < h * 0.85; y += 5) Px.rect(c, w / 2 - 3, y, 2, 2, '#4a8a3a');
  },
  sunflowers(c, w, h, r) {
    Px.rect(c, 0, h - 4, w, 4, '#4a7a22');
    for (let x = 2; x < w - 2; x += 4) {
      const top = 1 + Math.floor(r() * 4);
      Px.rect(c, x + 1, top + 3, 1, h - top - 3, '#3a6a1a');
      Px.disc(c, x + 1, top + 2, 2, '#f8c818');
      Px.rect(c, x + 1, top + 2, 1, 1, '#5a3010');
    }
  },
  rock(c, w, h, r) {
    Px.ellipse(c, w / 2, h * 0.6, w / 2 - 1, h * 0.4, '#6e665c');
    Px.ellipse(c, w * 0.42, h * 0.5, w * 0.32, h * 0.3, '#948a7c');
    Px.speckle(c, r, 3, 3, w - 6, h - 6, 18, ['#5a5248', '#b0a696']);
  },
  post(c, w, h) {
    Px.rect(c, 0, 0, w, h, '#f2f2f2');
    Px.rect(c, 0, 2, w, 3, '#1a1a1a');
    Px.rect(c, 1, 3, 1, 1, '#ff3020');
  },
  chevron_r: (c, w, h) => paintChevron(c, w, h, 1),
  chevron_l: (c, w, h) => paintChevron(c, w, h, -1),
  billboard_a: (c, w, h) => paintBillboard(c, w, h, '#f2c418', '#1a1a1a', 'ISO', '3200'),
  billboard_b: (c, w, h) => paintBillboard(c, w, h, '#1f4fbf', '#ffffff', 'TURBO', 'OIL'),
  billboard_c: (c, w, h) => paintBillboard(c, w, h, '#c8102e', '#ffffff', 'GRAND', 'PRIX'),
  crowd(c, w, h, r) {
    Px.rect(c, 0, h - 5, w, 5, '#5a5a5a');
    Px.rect(c, 0, h - 5, w, 1, '#8a8a8a');
    for (let row = 0; row < 2; row++) {
      for (let x = 1 + row * 2; x < w - 1; x += 4) {
        const y = h - 13 + row * 4 - Math.floor(r() * 2);
        const shirt = ['#e02020', '#2050d0', '#f0d020', '#ffffff', '#20a040', '#f08020'][Math.floor(r() * 6)];
        Px.rect(c, x, y + 3, 3, 4, shirt);
        Px.rect(c, x, y, 3, 3, ['#f0c8a0', '#c08a60', '#7a5030'][Math.floor(r() * 3)]);
        if (r() < 0.3) Px.rect(c, x - 1, y - 2, 1, 4, shirt); // waving arm
      }
    }
  },
  banner_start: (c, w, h) => paintBanner(c, w, h, 'FINISH', '#ffffff', '#101010', true),
  banner_checkpoint: (c, w, h) => paintBanner(c, w, h, 'CHECKPOINT', '#f2c418', '#101010', false),
};

function paintChevron(c, w, h, dir) {
  Px.rect(c, w / 2 - 1, h * 0.55, 3, h * 0.45, '#5a5a5a');
  Px.rect(c, 0, 0, w, h * 0.6, '#ffffff');
  Px.rect(c, 1, 1, w - 2, h * 0.6 - 2, '#d81010');
  c.fillStyle = '#ffffff';
  const bh = Math.round(h * 0.6);
  for (let k = 0; k < 2; k++) {
    const ox = 3 + k * 8;
    for (let y = 2; y < bh - 2; y++) {
      const t = Math.abs(y - bh / 2) / (bh / 2);
      const x = dir > 0 ? ox + Math.round((1 - t) * 4) : w - ox - 3 - Math.round((1 - t) * 4);
      c.fillRect(x, y, 3, 1);
    }
  }
}

function paintBillboard(c, w, h, bg, fg, line1, line2) {
  Px.rect(c, 8, h * 0.6, 3, h * 0.4, '#4a4a4a');
  Px.rect(c, w - 11, h * 0.6, 3, h * 0.4, '#4a4a4a');
  Px.rect(c, 0, 0, w, h * 0.68, '#e8e8e8');
  Px.rect(c, 2, 2, w - 4, h * 0.68 - 4, bg);
  Px.text(c, line1, w / 2, 4, 8, fg);
  Px.text(c, line2, w / 2, 14, 8, fg);
}

function paintBanner(c, w, h, label, bg, fg, checkered) {
  const post = '#7a7a82';
  Px.rect(c, 2, 0, 5, h, post);
  Px.rect(c, w - 7, 0, 5, h, post);
  Px.rect(c, 2, 0, 1, h, '#a8a8b0');
  Px.rect(c, w - 7, 0, 1, h, '#a8a8b0');
  Px.rect(c, 7, 2, w - 14, 26, bg);
  if (checkered) {
    // Two checker rows above and below the lettering.
    for (let x = 7, i = 0; x < w - 7; x += 3, i++) {
      for (const y of [2, 22]) Px.rect(c, x, y + (i % 2 ? 0 : 3), 3, 3, '#101010');
    }
  } else {
    Px.rect(c, 7, 2, w - 14, 3, '#101010');
    Px.rect(c, 7, 25, w - 14, 3, '#101010');
  }
  Px.text(c, label, w / 2, 11, 8, fg);
}

// ---- cars ------------------------------------------------------------------
// Rear-view car sprites, with a slight yaw for steering (pose −1/0/1) and lit
// brake lights. Each model has its own silhouette.
const CAR_ART = {
  lotus: { px: [96, 50] },
  evo: { px: [88, 62] },
  viper: { px: [100, 48] },
};

// Rear light boxes [x, y, w, h] for a sprite of width w; also drawn on their
// own at night (Sprites.carLights), on top of the darkened car.
const CAR_LIGHTS = {
  lotus: w => [[8, 25, 22, 6], [w - 30, 25, 22, 6]],
  evo: w => [[4, 32, 24, 6], [w - 28, 32, 24, 6]],
  viper: w => [[6, 27, 26, 4], [w - 32, 27, 26, 4]],
};
const OVAL_LIGHTS = { viper: true };

const CarPainters = {
  lotus(c, w, h, paint, pose, brake) {
    const dark = U.shade(paint, -0.35), light = U.shade(paint, 0.3), p = pose * 3;
    paintWheels(c, w, h, 16, 12, 4);
    Px.rect(c, 2, 30, w - 4, 13, dark);                       // lower body
    Px.trap(c, 20, 6, w - 6, 34, 3, w - 3, paint);             // main body
    Px.rect(c, 5 + p * 0.3, 20, w - 10, 2, light);            // deck highlight
    Px.trap(c, 5, 30 + p, w - 30 + p, 20, 18 + p * 0.6, w - 18 + p * 0.6, paint); // cabin
    Px.trap(c, 7, 33 + p, w - 33 + p, 18, 22 + p * 0.6, w - 22 + p * 0.6, '#1a222c'); // glass
    for (let y = 10; y < 18; y += 3) Px.rect(c, 24 + p * 0.6, y, w - 48, 1, dark);        // louvres
    Px.rect(c, 33 + p, 7, w - 66, 1, '#5a7088');
    Px.rect(c, 8 + p * 0.5, 17, w - 16, 3, dark);             // rear spoiler
    Px.rect(c, 8 + p * 0.5, 17, w - 16, 1, light);
    paintLights(c, CAR_LIGHTS.lotus(w), brake);
    Px.rect(c, 10, 38, w - 20, 6, '#161616');                 // diffuser
    Px.rect(c, w / 2 - 8, 32, 16, 5, '#f0e8a0');               // plate
    Px.rect(c, w / 2 - 14, 41, 4, 3, '#555');                 // twin pipes
    Px.rect(c, w / 2 + 10, 41, 4, 3, '#555');
  },
  evo(c, w, h, paint, pose, brake) {
    const dark = U.shade(paint, -0.35), light = U.shade(paint, 0.3), p = pose * 3;
    paintWheels(c, w, h, 14, 13, 4);
    Px.rect(c, 2, 30, w - 4, 20, paint);                      // body
    Px.rect(c, 2, 44, w - 4, 8, dark);                        // bumper
    Px.rect(c, 6, 50, w - 12, 3, '#151515');
    Px.trap(c, 4, 22 + p, w - 22 + p, 29, 9 + p * 0.5, w - 9 + p * 0.5, paint);   // cabin
    Px.trap(c, 7, 25 + p, w - 25 + p, 27, 14 + p * 0.5, w - 14 + p * 0.5, '#1a222c'); // glass
    Px.rect(c, 26 + p, 9, w - 52, 1, '#5a7088');
    Px.rect(c, 4, 27, w - 8, 3, light);                       // boot lid
    Px.rect(c, 16 + p * 0.4, 19, 3, 9, dark);                 // wing uprights
    Px.rect(c, w - 19 + p * 0.4, 19, 3, 9, dark);
    Px.rect(c, 3 + p * 0.4, 15, w - 6, 4, paint);             // big rear wing
    Px.rect(c, 3 + p * 0.4, 18, w - 6, 1, dark);
    Px.rect(c, 3 + p * 0.4, 15, w - 6, 1, light);
    paintLights(c, CAR_LIGHTS.evo(w), brake);
    Px.rect(c, 4, 32, 6, 6, '#e89020');                       // amber inners
    Px.rect(c, w - 10, 32, 6, 6, '#e89020');
    Px.rect(c, w / 2 - 8, 39, 16, 5, '#f0f0f0');               // plate
    Px.rect(c, 6, 39, 18, 2, '#c81818');                       // rally decals
    Px.rect(c, w - 24, 39, 18, 2, '#c81818');
    Px.rect(c, w - 22, 50, 4, 3, '#666');                     // exhaust
    // Mud flaps hanging behind the rear wheels.
    Px.rect(c, 5, h - 11, 12, 9, '#c01818');
    Px.rect(c, w - 17, h - 11, 12, 9, '#c01818');
    Px.rect(c, 5, h - 11, 12, 1, '#801010');
    Px.rect(c, w - 17, h - 11, 12, 1, '#801010');
  },
  viper(c, w, h, paint, pose, brake) {
    const dark = U.shade(paint, -0.35), light = U.shade(paint, 0.28), p = pose * 3;
    paintWheels(c, w, h, 20, 12, 3);
    // Windscreen frame seen from behind (it is a roadster – no roof).
    Px.trap(c, 4, 30 + p, w - 30 + p, 20, 24 + p * 0.6, w - 24 + p * 0.6, '#2a2a2a');
    Px.trap(c, 5, 32 + p, w - 32 + p, 19, 26 + p * 0.6, w - 26 + p * 0.6, '#9cc0d8');
    Px.disc(c, 40 + p * 0.7, 14, 4, '#3a2618');               // driver
    Px.rect(c, 36 + p * 0.7, 18, 9, 3, '#1a1a1a');
    Px.rect(c, w - 44 + p * 0.7, 13, 7, 7, '#2a2a2a');         // passenger headrest
    Px.trap(c, 16, 26 + p * 0.5, w - 26 + p * 0.5, 20, 22 + p * 0.5, w - 22 + p * 0.5, '#2e2e2e'); // sports bar
    // Body with the big rear haunches.
    Px.rect(c, 1, 24, w - 2, 18, paint);
    Px.ellipse(c, 18, 24, 17, 6, paint);
    Px.ellipse(c, w - 18, 24, 17, 6, paint);
    Px.rect(c, 30, 21, w - 60, 3, dark);                      // tonneau / deck
    Px.ellipse(c, 16, 21, 9, 2, light);
    Px.ellipse(c, w - 16, 21, 9, 2, light);
    Px.rect(c, 1, 36, w - 2, 6, dark);
    paintLights(c, CAR_LIGHTS.viper(w), brake, true);
    Px.rect(c, w / 2 - 8, 30, 16, 5, '#f0e8a0');               // plate
    Px.rect(c, 10, 38, w - 20, 5, '#141414');                  // diffuser
  },
};

function paintWheels(c, w, h, tw, th, inset) {
  Px.rect(c, 0, h - 3, w, 3, 'rgba(0,0,0,0.45)');            // shadow
  Px.rect(c, inset, h - th - 1, tw, th, '#121212');
  Px.rect(c, w - inset - tw, h - th - 1, tw, th, '#121212');
  for (let y = h - th + 1; y < h - 1; y += 3) {
    Px.rect(c, inset + 2, y, tw - 4, 1, '#2a2a2a');
    Px.rect(c, w - inset - tw + 2, y, tw - 4, 1, '#2a2a2a');
  }
}

function paintLights(c, boxes, brake, oval) {
  for (const [x, y, w, h] of boxes) {
    if (brake) {
      c.fillStyle = 'rgba(255,60,40,0.35)';
      c.fillRect(x - 2, y - 2, w + 4, h + 4);
    }
    if (oval) {
      Px.ellipse(c, x + w / 2, y + h / 2, w / 2, h / 2, '#5a0808');
      Px.ellipse(c, x + w / 2, y + h / 2, w / 2 - 1, h / 2 - 1, brake ? '#ff5a40' : '#c81414');
    } else {
      Px.rect(c, x, y, w, h, '#5a0808');
      Px.rect(c, x + 1, y + 1, w - 2, h - 2, brake ? '#ff5a40' : '#c81414');
      Px.rect(c, x + 1, y + 1, w - 2, 1, brake ? '#ffc0a0' : '#e85050');
    }
  }
}

// ---- cache -----------------------------------------------------------------
const Sprites = {
  scenery: {},
  cars: new Map(),

  init() {
    let seed = 11;
    for (const [key, def] of Object.entries(SPRITE_DEFS)) {
      const [c, ctx] = U.canvas(def.px[0], def.px[1]);
      SceneryPainters[key](ctx, def.px[0], def.px[1], U.rng(seed++));
      this.scenery[key] = c;
    }
  },

  car(def, paint, pose, brake) {
    const key = def.id + paint + pose + (brake ? 'b' : '');
    let c = this.cars.get(key);
    if (!c) {
      const [w, h] = CAR_ART[def.id].px;
      let ctx;
      [c, ctx] = U.canvas(w, h);
      CarPainters[def.id](ctx, w, h, paint, pose, brake);
      this.cars.set(key, c);
    }
    return c;
  },

  // Just the rear lights of a car, the size of its sprite.
  carLights(def, brake) {
    const key = 'lights' + def.id + (brake ? 'b' : '');
    let c = this.cars.get(key);
    if (!c) {
      const [w, h] = CAR_ART[def.id].px;
      let ctx;
      [c, ctx] = U.canvas(w, h);
      paintLights(ctx, CAR_LIGHTS[def.id](w), brake, OVAL_LIGHTS[def.id]);
      this.cars.set(key, c);
    }
    return c;
  },

  // A sprite's silhouette in one colour, for darkening it at night.
  tints: new WeakMap(),
  tint(img, color) {
    let byColor = this.tints.get(img);
    if (!byColor) this.tints.set(img, byColor = new Map());
    let c = byColor.get(color);
    if (!c) {
      let ctx;
      [c, ctx] = U.canvas(img.width, img.height);
      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = 'source-in';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, img.width, img.height);
      byColor.set(color, c);
    }
    return c;
  },

  carWorldH(def) {
    const [w, h] = CAR_ART[def.id].px;
    return (def.worldW * h) / w;
  },
};

// ---- backgrounds -----------------------------------------------------------
// Tileable parallax layers built from sums of whole-period sines.
const Backgrounds = {
  cache: new Map(),

  get(season) {
    let bg = this.cache.get(season.id);
    if (!bg) {
      bg = this.build(season);
      this.cache.set(season.id, bg);
    }
    return bg;
  },

  ridge(r, w, terms) {
    const parts = terms.map(([k, a]) => ({ k, a, ph: r() * Math.PI * 2 }));
    return x => parts.reduce((s, p) => s + p.a * Math.sin((p.k * 2 * Math.PI * x) / w + p.ph), 0);
  },

  build(season) {
    const C = season.colors, r = U.rng(season.seed + 99);
    const W = SCREEN_W * 2;

    // Far mountains.
    const farH = 80;
    const [far, fctx] = U.canvas(W, farH);
    const fh = this.ridge(r, W, [[2, 14], [3, 9], [5, 6], [9, 3], [17, 1.5]]);
    for (let x = 0; x < W; x++) {
      const top = Math.round(farH * 0.5 - fh(x) - (season.id === 'winter' ? 10 : 0));
      fctx.fillStyle = C.far;
      fctx.fillRect(x, top, 1, farH - top);
      if (C.farCap && top < farH * 0.42) {
        fctx.fillStyle = C.farCap;
        fctx.fillRect(x, top, 1, Math.round(farH * 0.42 - top) + ((x * 7) % 3));
      }
      fctx.fillStyle = U.shade(C.far, 0.12);
      if (x % 3 === 0) fctx.fillRect(x, top + 1, 1, 1);
    }

    // Near hills with a tree line.
    const nearH = 50;
    const [near, nctx] = U.canvas(W, nearH);
    const nh = this.ridge(r, W, [[3, 6], [4, 4], [7, 3], [13, 1.2]]);
    for (let x = 0; x < W; x++) {
      const bump = season.id === 'summer' ? 0 : ((x * 13) % 7 < 3 ? 2 : 0) + ((x * 5) % 11 < 2 ? 2 : 0);
      const top = Math.round(nearH * 0.55 - nh(x) - bump);
      nctx.fillStyle = C.near;
      nctx.fillRect(x, top, 1, nearH - top);
      nctx.fillStyle = C.nearTop;
      nctx.fillRect(x, top, 1, 2);
    }

    // Clouds.
    const cloudH = 70;
    const [clouds, cctx] = U.canvas(W, cloudH);
    const overcast = season.weather === 'rain' || season.weather === 'snow';
    const count = overcast ? 26 : season.id === 'summer' ? 6 : 12;
    for (let i = 0; i < count; i++) {
      const cx = r() * W, cy = 8 + r() * (cloudH - 26), size = 6 + r() * (overcast ? 14 : 9);
      const base = season.night ? '#1b2238' : overcast ? (season.id === 'winter' ? '#c8d2dc' : '#7e8892') : '#ffffff';
      const shadow = season.night ? '#141a2c' : overcast ? U.shade(base, -0.15) : '#dfe8f2';
      for (let k = 0; k < 5; k++) {
        const bx = cx + (k - 2) * size * 0.7, by = cy + (k % 2) * 2;
        for (const dx of [-W, 0, W]) {
          Px.ellipse(cctx, bx + dx, by + 2, Math.round(size * 0.9), Math.round(size * 0.45), shadow);
          Px.ellipse(cctx, bx + dx, by, Math.round(size * 0.8), Math.round(size * 0.4), base);
        }
      }
    }

    // Stars (night): x across the tile, y as a fraction of the sky's height.
    const stars = [];
    if (season.night) for (let i = 0; i < 110; i++) stars.push({ x: r() * W, y: r() * r(), bright: r() < 0.25 });

    return { far, near, clouds, stars, W };
  },
};
