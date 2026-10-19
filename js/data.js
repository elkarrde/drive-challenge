'use strict';

// Game version, shown on the title screen. major.minor.build:
//   major – breaking: something players had no longer carries over
//           (e.g. a RECORDS_VERSION bump that hides the old records)
//   minor – new features
//   build – fixes and balance tweaks
// Bump it with every deploy, tag the commit vX.Y.Z and add a CHANGELOG.md entry.
const VERSION = '2.0.0';

// ---------------------------------------------------------------------------
// World / projection constants
// ---------------------------------------------------------------------------
const SCREEN_W = 480;
const SCREEN_H = 300;
const SEG_LEN = 200;          // world units per road segment
const ROAD_W = 1600;          // half-width of the road (x = ±1 are the edges)
const LANES = 3;
const RUMBLE_LEN = 3;         // segments per rumble-strip colour block
const CAM_HEIGHT = 1000;
const CAM_DEPTH = 1 / Math.tan((100 / 2) * Math.PI / 180); // 100° FOV
const DRAW_DIST = 260;        // segments drawn ahead of the camera
const KMH = 40;               // world units per second, per km/h
const CURVE_MAX = 6;

// ---------------------------------------------------------------------------
// Championship rules
// ---------------------------------------------------------------------------
const FIELD_SIZE = 20;
const QUALIFY_POS = 10;
const LAPS = 3;
const POINTS = [15, 12, 10, 8, 6, 5, 4, 3, 2, 1];
// Bump together with RECORDS_VERSION in api/lib.php when a physics or timing
// change makes the online records unfair to compare with new times.
const RECORDS_VERSION = 2;

// ---------------------------------------------------------------------------
// Road surfaces. "wet" decides which acceleration rating a car uses.
// ---------------------------------------------------------------------------
const SURFACES = {
  dry:  { id: 'dry',  name: 'DRY',  grip: 1.00, brake: 1.00, wet: false, pace: 1.00 },
  rain: { id: 'rain', name: 'RAIN', grip: 0.80, brake: 0.78, wet: true,  pace: 0.92 },
  snow: { id: 'snow', name: 'SNOW', grip: 0.64, brake: 0.58, wet: true,  pace: 0.84 },
};

// ---------------------------------------------------------------------------
// Cars. Ratings are 1..5 and are the only thing that differs in handling;
// see physics.js for how each rating maps onto the simulation.
//   speed     – top speed
//   corner    – how little speed is scrubbed (and how little the car drifts)
//               while it is not driving straight, on dry tarmac
//   cornerWet – the same on rain / snow (optional; defaults to corner)
//   accelDry  – acceleration on dry tarmac
//   accelWet  – acceleration on rain / snow
// ---------------------------------------------------------------------------
const CARS = [
  {
    id: 'lotus',
    maker: 'LOTUS',
    model: 'ESPRIT TURBO SE',
    short: 'ESPRIT',
    year: 1990,
    spec: '2.2 L TURBO I4 · 264 HP · RWD',
    stats: { speed: 4, corner: 3.5, accelDry: 4, accelWet: 3 },
    paint: '#c8102e',
    altPaint: '#1f4fbf',
    aiPaints: ['#c8102e', '#f2f2ee', '#1d1d22', '#1f4fbf', '#d8b21a'],
    ratios: [0.27, 0.45, 0.63, 0.81, 1.0],
    redline: 6800,
    worldW: 760,
    engine: { low: 46, high: 205, sub: 0.35, turbo: 0.035, rough: 0.15 },
  },
  {
    id: 'evo',
    maker: 'MITSUBISHI',
    model: 'LANCER EVOLUTION I',
    short: 'LANCER EVO',
    year: 1992,
    spec: '2.0 L TURBO I4 · 250 PS · 4WD',
    stats: { speed: 2, corner: 5, accelDry: 4, accelWet: 5 },
    paint: '#f0f0ea',
    altPaint: '#e2b912',
    aiPaints: ['#f0f0ea', '#e2b912', '#a8adb4', '#b3121f', '#1d1d22'],
    ratios: [0.25, 0.42, 0.60, 0.80, 1.0],
    redline: 7500,
    worldW: 700,
    engine: { low: 56, high: 245, sub: 0.25, turbo: 0.05, rough: 0.2 },
  },
  {
    id: 'viper',
    maker: 'DODGE',
    model: 'VIPER RT/10',
    short: 'VIPER',
    year: 1992,
    spec: '8.0 L V10 · 400 HP · RWD',
    // Better grip in the wet than in the dry, so a snow or rain stage isn't
    // lost in the first bends (it never qualified there with cornerWet 2).
    stats: { speed: 5, corner: 2, cornerWet: 3.5, accelDry: 5, accelWet: 1 },
    paint: '#14704a',
    altPaint: '#c41020',
    aiPaints: ['#14704a', '#c41020', '#1d1d22', '#e2b912', '#2a4fd0'],
    ratios: [0.22, 0.36, 0.50, 0.65, 0.82, 1.0],
    redline: 6000,
    worldW: 790,
    engine: { low: 30, high: 150, sub: 0.7, turbo: 0, rough: 0.45 },
  },
];
const CAR_BY_ID = Object.fromEntries(CARS.map(c => [c.id, c]));

// ---------------------------------------------------------------------------
// Seasons / stages, raced in this order.
//   fog    – distance haze (0 = none)
//   mist   – patchy fog banks along the lap (track.js, render.js)
//   night  – dark, lit by headlights; colours are as seen in the headlights
//   sight  – poor visibility: computer drivers aim this much slower, and the
//            time allowance is built around the same reduced pace
// ---------------------------------------------------------------------------
const SEASONS = [
  {
    id: 'autumn',
    name: 'AUTUMN',
    blurb: 'FOREST ROADS · MORNING MIST',
    surface: 'dry',
    seed: 1990,
    lapSegments: 2100,
    curvy: 0.55, hilly: 0.65, straights: 0.3,
    fog: 0.6,
    mist: true,
    sight: 0.95,
    weather: 'leaves',
    colors: {
      skyTop: '#8a9cb4', skyBottom: '#efe2d0', fog: '#e2dbcf',
      grass: ['#a5802c', '#977526'], road: ['#6e6966', '#67625f'],
      rumble: ['#ececec', '#c8102e'], lane: '#e6e1d2',
      far: '#7f7b9b', farCap: null, near: '#8a5b2c', nearTop: '#b5652b',
      sun: '#fff1c8',
    },
    scenery: [['oak_orange', 4], ['oak_red', 3], ['birch', 2], ['bush_autumn', 3], ['haybale', 1]],
  },
  {
    id: 'winter',
    name: 'WINTER',
    blurb: 'MOUNTAIN PASS · SNOW',
    surface: 'snow',
    seed: 1992,
    lapSegments: 1900,
    curvy: 0.8, hilly: 0.55, straights: 0.2,
    fog: 3.2,
    weather: 'snow',
    colors: {
      skyTop: '#8ea3b8', skyBottom: '#e3ebf2', fog: '#dce4ec',
      grass: ['#f2f5f8', '#e1e8ef'], road: ['#9aa0a8', '#939aa2'],
      rumble: ['#f4f4f4', '#2a5bc8'], lane: '#d6dce2',
      far: '#7d8ea3', farCap: '#f4f8fb', near: '#5d7488', nearTop: '#e8eef3',
      sun: null,
    },
    scenery: [['pine_snow', 6], ['pine_small', 3], ['bare_tree', 2], ['rock_snow', 2], ['snowman', 0.4]],
  },
  {
    id: 'spring',
    name: 'SPRING',
    blurb: 'COUNTRY LANES · RAIN',
    surface: 'rain',
    seed: 1993,
    lapSegments: 2100,
    curvy: 0.6, hilly: 0.7, straights: 0.3,
    fog: 2.4,
    weather: 'rain',
    colors: {
      skyTop: '#5d6772', skyBottom: '#a4adb5', fog: '#97a1a9',
      grass: ['#4f9a3a', '#468b33'], road: ['#4b4f55', '#464a4f'],
      rumble: ['#dcdcdc', '#b02020'], lane: '#c9ccd0',
      far: '#6d7a83', farCap: null, near: '#3f6e3a', nearTop: '#55894a',
      sun: null,
    },
    scenery: [['blossom', 4], ['tree_green', 4], ['bush_green', 3], ['tulips', 2], ['cottage', 0.5]],
  },
  {
    id: 'summer',
    name: 'SUMMER',
    blurb: 'COASTAL HIGHWAY · NIGHT',
    surface: 'dry',
    seed: 1994,
    lapSegments: 2400,
    curvy: 0.35, hilly: 0.45, straights: 0.55,
    fog: 0,
    night: true,
    sight: 0.95,
    weather: 'clear',
    colors: {
      skyTop: '#02040d', skyBottom: '#141c36', fog: '#03050b',
      grass: ['#6f9a34', '#648d2e'], road: ['#727272', '#6b6b6b'],
      rumble: ['#ffffff', '#d81010'], lane: '#f0f0f0',
      far: '#141b30', farCap: null, near: '#0a120d', nearTop: '#111c15',
      sun: null, moon: '#e6ebf5',
    },
    scenery: [['tree_summer', 3], ['cypress', 3], ['sunflowers', 3], ['haybale', 1], ['rock', 1]],
  },
];

// Nineteen computer drivers. Car model and skill are fixed for a championship.
const AI_DRIVERS = [
  'N. HAWKES', 'A. MORETTI', 'K. TANAKA', 'S. LINDQVIST', 'P. DUVAL',
  'M. KOVAC', 'J. REYES', 'T. BRANDT', 'L. ESPOSITO', 'E. VIRTANEN',
  'C. BLAKE', 'D. NOVAK', 'F. ALMEIDA', 'G. HARTMANN', 'I. SATO',
  'O. JANSSEN', 'V. PETROV', 'Y. MARCHAND', 'B. OKAFOR',
];
