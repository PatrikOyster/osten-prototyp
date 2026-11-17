'use strict';
/* =====================================================================
   LE GRAND FROMAGE (arbetsnamn) – konfiguration, data och hjälpfunktioner
   Ingen DOM här: filen körs också i Node-tester (tools/test-core.js).
   Allt som är "knappar att vrida på" för balans finns i CFG och WEAPONS.
   ===================================================================== */
const GAME_VERSION = '0.2.0';
const PROTO_VERSION = 2;   // 2: botantal (settings.bots) i stället för fill, banval (settings.map)
const TAU = Math.PI * 2;

const CFG = {
  dt: 1 / 60,          // fast simuleringssteg (s)
  snapHz: 30,          // hur ofta värden skickar tillståndet
  maxPlayers: 8,
  matchSec: 300,       // 5 minuter
  revealSec: 5,        // "brottar-intro" där vapnen avslöjas
  countSec: 3,
  // Ön
  islandR: 900,        // medelradie, kusten varierar +-115
  hillR: 230,          // Ostkullen i mitten
  // Spelare
  pr: 24,              // spelarradie
  speed: 300,
  accel: 2800,
  decel: 3400,
  evDecay: 6,          // knuffhastighet avtar med exp(-evDecay*dt)
  carryMul: 0.93,      // ostbäraren är lite långsammare
  pickupInv: 1.0,      // kort skydd när man tar osten (annars dör man i samma ögonblick)
  swingMul: 0.6,
  guardMul: 0.55,
  dazeMul: 0.5,
  pondMul: 0.55,
  seaMul: 0.5,
  drownSec: 0.9,
  // Tackling
  tkDur: 0.2, tkSpeed: 800, tkCd: 1.8, tkRecover: 0.3, tkKb: 560,
  // KO
  respawnSec: 2.6, spawnInv: 1.5,
  // Osten
  cr: 26, cheeseAir: 0.35, hillPush: 300, cheeseFric: 0.9, seaReturn: 5,
  // Parisduvan (händelse som jagar den som hållit osten länge)
  gullOn: true, gullAfter: 25, gullEvery: 9
};

/* ---------- Hjälpfunktioner ---------- */
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
/* Hur många botar en match får, givet antal människor och värdens önskemål (0..7).
   Aldrig fler än det finns platser, och den som är ensam får alltid minst en motståndare. */
function botCount(humans, want) {
  const free = Math.max(0, CFG.maxPlayers - humans);
  let n = clamp(Math.round(+want || 0), 0, free);
  if (humans + n < 2) n = Math.min(1, free);
  return n;
}
function wrapAng(a) { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; }
function angDiff(a, b) { return wrapAng(a - b); }
function lerpAng(a, b, t) { return a + wrapAng(b - a) * t; }
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function segDist(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const l2 = abx * abx + aby * aby;
  let t = l2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / l2 : 0;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

/* ---------- Vapen (datadrivna – se Sim.weaponLogic för beteendet) ---------- */
const WEAPON_ORDER = ['baguette', 'coq', 'poele', 'poireau', 'patate', 'petanque',
  'pigeon', 'feu', 'epoisses', 'champagne', 'souffleur', 'trampoline'];

const WEAPONS = {
  baguette: {
    name: 'Baguetten', fr: 'La Baguette', tag: 'Närstrid', kind: 'melee',
    cd: 0.8, windup: 0.07, active: 0.16, recover: 0.12, range: 108, arc: 2.3, kb: 480,
    desc: 'Lång, krispig och förvånansvärt hård. Svingas som om ingen såg.',
    verb: 'baguette-bonkade', ono: 'BAGUETTE!', col: '#e0a458'
  },
  coq: {
    name: 'Gummituppen', fr: 'Le Coq', tag: 'Närstrid · skrik', kind: 'melee',
    cd: 0.6, windup: 0.04, active: 0.12, recover: 0.08, range: 82, arc: 2.6, kb: 330,
    squeak: { r: 230, daze: 0.65 },
    desc: 'Snabb och högljudd. Kacklet får alla i närheten att tveka.',
    verb: 'kacklade ner', ono: 'COCORICO!', col: '#f2c230'
  },
  poele: {
    name: 'Stekpannan', fr: 'La Poêle', tag: 'Närstrid · skydd', kind: 'pan',
    cd: 1.0, windup: 0.09, active: 0.14, recover: 0.12, range: 98, arc: 2.0, kb: 640, guardArc: 2.3,
    desc: 'Håll in för att möta skott – de studsar tillbaka! Släpp för en rejäl smäll.',
    verb: 'stekte till', ono: 'CLONG!', col: '#8a8f98'
  },
  poireau: {
    name: 'Purjolöken', fr: 'Le Poireau', tag: 'Närstrid · lång', kind: 'melee', sweep: true,
    cd: 1.5, windup: 0.16, active: 0.3, recover: 0.14, range: 155, arc: 2.0, kb: 400, wobble: 0.35,
    desc: 'Lång, slapp och oförutsägbar. Svingar i en vid, vickande båge.',
    verb: 'purjolökade', ono: 'SPLOTCH!', col: '#7cc46a'
  },
  patate: {
    name: 'Potatiskanonen', fr: 'Canon à patates', tag: 'Skjuter', kind: 'shoot', pk: 'potato',
    cd: 1.7, speed: 640, life: 1.05, pr: 13, kb: 540, n: 1, spread: 0,
    desc: 'Skjuter potatis. Löser ibland problem, skapar oftast fler.',
    verb: 'potatisbombade', ono: 'PATATRAS!', col: '#b98a52'
  },
  petanque: {
    name: 'Pétanque-kulorna', fr: 'Les Boules', tag: 'Skjuter · studsar', kind: 'shoot', pk: 'boule',
    cd: 1.3, speed: 520, life: 1.5, pr: 11, kb: 420, n: 2, spread: 0.14, ammo: 3, reload: 5, bounces: 3,
    desc: 'Två kulor åt gången som studsar på allt. Också på dig.',
    verb: 'kastade kula på', ono: 'CLAC!', col: '#9aa7b5'
  },
  pigeon: {
    name: 'Brevduvan', fr: 'Le Pigeon', tag: 'Målsökande', kind: 'homing',
    cd: 4.5, speed: 370, life: 2.8, turn: 2.3, pr: 17, kb: 500,
    desc: 'Skickar en duva efter någon. Duvan har dock egna åsikter om vem.',
    verb: 'duvattackerade', ono: 'COUIC!', col: '#aab4c8'
  },
  feu: {
    name: 'Fyrverkeriraketen', fr: 'Le 14 Juillet', tag: 'Sprängs · fördröjd', kind: 'rocket',
    cd: 3.6, fuse: 1.5, rangeMin: 150, rangeMax: 620, boomR: 150, kb: 720,
    desc: 'Skicka upp en raket som sprängs efter en sekund-och-lite. Alla i närheten får se stjärnor.',
    verb: 'fyrverkerade', ono: 'FEU!', col: '#ff5a5f'
  },
  epoisses: {
    name: 'Stinkosten', fr: "L'Époisses", tag: 'Gas · område', kind: 'can',
    cd: 7.0, fly: 0.7, open: 2.0, cloudR: 150, cloud: 4.5, koAfter: 1.1, rangeMin: 120, rangeMax: 430,
    desc: 'Kasta, vänta och låt doften göra jobbet. Den som andas in svimmar.',
    verb: 'stank ner', ono: 'BEURK!', col: '#c9d86a'
  },
  champagne: {
    name: 'Champagneminan', fr: 'Le Champagne', tag: 'Mina', kind: 'mine',
    cd: 1.4, arm: 0.8, max: 3, trigR: 54, boomR: 112, life: 40, kb: 620,
    desc: 'Ställ ut en skakad flaska. Den ploppar när någon kliver nära – även du.',
    verb: 'champagne-poppade', ono: 'POP!', col: '#f5d76e'
  },
  souffleur: {
    name: 'Lövblåsaren', fr: 'Le Souffleur', tag: 'Blåser bort', kind: 'blow',
    range: 330, half: 0.5, push: 2600, maxEv: 520, heatUp: 0.4, cool: 0.55, resume: 0.35,
    // vindmätare per offer: fylls medan man står i luftströmmen (snabbare ju närmare), töms när man kommit ur den
    galeIn: 2.2, galeFar: 1.1, galeOut: 1.4, kb: 1200,
    desc: 'Håll in knappen och blås. Den som blir kvar i vinden för länge blåses bort och blir utslagen – annars knuffas man bara bakåt. Överhettas om du överdriver.',
    verb: 'blåste bort', ono: 'FIUU!', col: '#ff9f1c'
  },
  trampoline: {
    name: 'Studsmattan', fr: 'Le Trampoline', tag: 'Fälla · flykt', kind: 'pad',
    cd: 4.0, max: 2, life: 25, padR: 56, air: 0.9, dist: 420,
    desc: 'Lägg ut en studsmatta med pil. Den som kliver på flyger i pilens riktning.',
    verb: 'studsade bort', ono: 'BOING!', col: '#4cc9f0'
  }
};

/* Verb för händelseloggen när orsaken inte är ett vapen */
const CAUSE_VERB = { tackle: 'tacklade', drown: 'skickade på ett dopp', pigeon: 'duvattackerade' };
const CAUSE_ONO = { tackle: 'OUF!', drown: 'PLOUF!', pigeon: 'COUIC!' };

/* ---------- Karaktärer: marinière-tröjor i olika färger och mönster ---------- */
const SKINS = [
  { name: 'Pierre', shirt: ['#1f3a8a', '#f6f1e4'], pat: 'hoop', hat: 'beret', hatCol: '#1b1b1f', skin: '#f1c7a0', extra: 'mustache' },
  { name: 'Colette', shirt: ['#d62839', '#f6f1e4'], pat: 'wide', hat: 'beret', hatCol: '#d62839', skin: '#f4cfae', extra: 'lashes' },
  { name: 'Jean-Claude', shirt: ['#16161a', '#f6f1e4'], pat: 'vert', hat: 'beret', hatCol: '#2a2a30', skin: '#e8b88f', extra: 'shades' },
  { name: 'Brigitte', shirt: ['#ec6fa3', '#fff3f8'], pat: 'diag', hat: 'none', hair: '#f2d36b', skin: '#f7d6bd', extra: 'bigshades' },
  { name: 'Gaston', shirt: ['#2f9e5b', '#f3f0d8'], pat: 'chev', hat: 'toque', hatCol: '#ffffff', skin: '#e9b48a', extra: 'mustache' },
  { name: 'Margot', shirt: ['#f08a24', '#1f9aa8'], pat: 'wavy', hat: 'none', hair: '#6b3a1d', curl: true, skin: '#d9a273', extra: 'hoops' },
  { name: 'Étienne', shirt: ['#2442a8', '#ffffff', '#d62839'], pat: 'tri', hat: 'beret', hatCol: '#2442a8', skin: '#f1c7a0', extra: 'goatee' },
  { name: 'Mamie', shirt: ['#7a4bc2', '#b8f0d6'], pat: 'hoop', hat: 'none', hair: '#d4d4dc', bun: true, skin: '#f2cfb0', extra: 'glasses' }
];

const BOT_NAMES = ['Amélie', 'Baptiste', 'Camille', 'Dominique', 'Émile', 'Fabien', 'Gisèle', 'Hugo', 'Inès',
  'Jacques', 'Lucie', 'Marcel', 'Noémie', 'Olivier', 'Pascal', 'Raphaël', 'Sylvie', 'Théo', 'Yvette', 'Zinédine'];

/* ---------- Kartan (deterministisk från seed så att alla klienter får samma ö) ---------- */
const OB_TYPES = {
  house: { r: 58, hp: 10 },
  tower: { r: 46, hp: 14 },
  tree: { r: 27, hp: 3 },
  barrel: { r: 21, hp: 2 },
  cafe: { r: 30, hp: 3 },
  // Torget
  stall: { r: 40, hp: 4 },        // marknadsstånd
  column: { r: 22, hp: 6 },       // Morris-kolonn
  carousel: { r: 66, hp: 14 },    // karusell
  kiosk: { r: 30, hp: 4 }         // bouquinistens låda
};

/* Banor. 'ile' = Osten på ön (standard), 'place' = Torget i Paris (Seine runt om). */
const MAPS = {
  ile: { id: 'ile', name: 'Osten på ön', fr: "L'Île du Fromage", desc: 'Byn, dammen och bryggan. Havet runt om.' },
  place: { id: 'place', name: 'Torget i Paris', fr: 'La Place du Fromage', desc: 'Kullersten, marknad och karusell. Seine runt om.' }
};
const MAP_ORDER = ['ile', 'place'];

function coastR(th) {
  return CFG.islandR + 60 * Math.sin(3 * th + 0.4) + 35 * Math.cos(5 * th + 0.7) + 20 * Math.sin(7 * th + 1.3);
}

function makeMap(seed, kind) { return kind === 'place' ? makePlace(seed) : makeIsland(seed); }

function makeIsland(seed) {
  const rng = mulberry32((seed ^ 0x51ED270B) >>> 0);
  const rnd = (a, b) => a + (b - a) * rng();
  const COAST_MIN = CFG.islandR - 115 - 10, COAST_MIN2 = COAST_MIN * COAST_MIN;
  const pierA = Math.PI / 2;
  const m = {
    kind: 'ile', seed, obstacles: [], spawns: [], coastR, fleeMargin: 330,
    pond: { x: -430, y: 240, rx: 125, ry: 85 },
    pier: { x0: -46, x1: 46, y0: coastR(pierA) - 40, y1: coastR(pierA) + 250 },
    village: { x: Math.cos(-0.88) * 500, y: Math.sin(-0.88) * 500 },
    onLand(x, y) {
      const d2 = x * x + y * y;
      if (d2 < COAST_MIN2) return true;
      if (Math.sqrt(d2) < coastR(Math.atan2(y, x)) - 8) return true;
      const p = m.pier;
      return x > p.x0 && x < p.x1 && y > p.y0 && y < p.y1;
    },
    inPond(x, y, pad) {
      const q = m.pond, px = (x - q.x) / (q.rx + (pad || 0)), py = (y - q.y) / (q.ry + (pad || 0));
      return px * px + py * py < 1;
    }
  };
  // Startplatser runt kusten
  for (let k = 0; k < 8; k++) {
    const a = k * TAU / 8 + 0.3, r = coastR(a) - 95;
    m.spawns.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, a });
  }
  let nid = 1;
  const ok = (x, y, r, pad, relax) => {
    const d = Math.hypot(x, y), th = Math.atan2(y, x);
    if (d > coastR(th) - r - 70) return false;
    if (d < CFG.hillR + r + 40) return false;
    if (m.inPond(x, y, r + 25)) return false;
    if (x > m.pier.x0 - r - 30 && x < m.pier.x1 + r + 30 && y > m.pier.y0 - 90) return false;
    if (!relax) for (const s of m.spawns) if (Math.hypot(x - s.x, y - s.y) < 130 + r) return false;
    for (const o of m.obstacles) if (Math.hypot(x - o.x, y - o.y) < o.r + r + pad) return false;
    return true;
  };
  const add = (t, v, x, y) => {
    const T = OB_TYPES[t];
    m.obstacles.push({ id: nid++, t, v, x: Math.round(x), y: Math.round(y), r: T.r, hp: T.hp });
  };
  // Byn: boulangerie, café, fromagerie och ett vanligt hus
  const vil = m.village;
  const hv = [['house', 'boulangerie', -120, -40], ['house', 'cafe', 75, -90], ['house', 'fromagerie', 125, 60], ['house', 'maison', -50, 100]];
  for (const [t, v, ox, oy] of hv) {
    for (let k = 0; k < 60; k++) {
      const jx = k ? rnd(-30, 30) * (k / 10) : 0, jy = k ? rnd(-30, 30) * (k / 10) : 0;
      if (ok(vil.x + ox + jx, vil.y + oy + jy, OB_TYPES[t].r, 14, k > 30)) { add(t, v, vil.x + ox + jx, vil.y + oy + jy); break; }
    }
  }
  // Tour (mini-Eiffeltorn) nära kusten, mellan två startplatser
  {
    const a = 2.26, r = coastR(a) - 118;
    if (ok(Math.cos(a) * r, Math.sin(a) * r, OB_TYPES.tower.r, 10)) add('tower', '', Math.cos(a) * r, Math.sin(a) * r);
  }
  const scatter = (t, n, v, cluster) => {
    let placed = 0;
    for (let i = 0; i < 500 && placed < n; i++) {
      let x, y;
      if (cluster) { x = vil.x + rnd(-260, 260); y = vil.y + rnd(-260, 260); }
      else { const a = rnd(0, TAU), d = rnd(CFG.hillR + 80, 860); x = Math.cos(a) * d; y = Math.sin(a) * d; }
      if (ok(x, y, OB_TYPES[t].r, 22)) { add(t, v, x, y); placed++; }
    }
  };
  scatter('cafe', 3, '', true);
  scatter('tree', 24, 'platane', false);
  scatter('barrel', 9, '', false);
  return m;
}

/* ---------- Torget i Paris: en kullerstensplats (avrundad fyrkant) omgiven av Seine ----------
   Fast, spegelsymmetrisk uppställning så att ingen startplats har fördel. Bara tunnor slumpas fram av seed. */
const PLACE = { a: 830, b: 740, n: 4 };
function placeR(th) {
  const c = Math.abs(Math.cos(th)) / PLACE.a, s = Math.abs(Math.sin(th)) / PLACE.b;
  return Math.pow(Math.pow(c, PLACE.n) + Math.pow(s, PLACE.n), -1 / PLACE.n);
}

function makePlace(seed) {
  const rng = mulberry32((seed ^ 0x7A1ACE5) >>> 0);
  const rnd = (a, b) => a + (b - a) * rng();
  let cmin = 1e9; for (let i = 0; i < 360; i++) cmin = Math.min(cmin, placeR(i / 360 * TAU));
  const COAST_MIN2 = (cmin - 12) * (cmin - 12);
  const m = {
    kind: 'place', seed, obstacles: [], spawns: [], coastR: placeR, fleeMargin: 250,
    pond: { x: 440, y: 330, rx: 120, ry: 78 },            // bassin med leksaksbåtar (långsam mark, som dammen)
    court: { x: -430, y: -330, w: 280, h: 160 },          // pétanquebana (bara dekor)
    pier: null, village: null,
    onLand(x, y) {
      const d2 = x * x + y * y;
      if (d2 < COAST_MIN2) return true;
      return Math.sqrt(d2) < placeR(Math.atan2(y, x)) - 8;
    },
    inPond(x, y, pad) {
      const q = m.pond, px = (x - q.x) / (q.rx + (pad || 0)), py = (y - q.y) / (q.ry + (pad || 0));
      return px * px + py * py < 1;
    }
  };
  for (let k = 0; k < 8; k++) {
    const a = (k + 0.5) * TAU / 8, r = Math.min(placeR(a) - 110, 690);
    m.spawns.push({ x: Math.cos(a) * r, y: Math.sin(a) * r, a });
  }
  let nid = 1;
  const add = (t, v, x, y) => { const T = OB_TYPES[t]; m.obstacles.push({ id: nid++, t, v, x: Math.round(x), y: Math.round(y), r: T.r, hp: T.hp }); };
  // Platanallé: två rader med öppning i mitten
  for (const sy of [-1, 1]) for (const x of [-500, -300, -100, 100, 300, 500]) add('tree', 'platane', x, sy * 480);
  // Marknad: tre stånd på var sida om kullen
  const goods = ['fromage', 'fruits', 'pain', 'fleurs'];
  for (const sx of [-1, 1]) [-150, 0, 150].forEach((y, i) => add('stall', goods[(i + (sx > 0 ? 1 : 0)) % goods.length], sx * 540, y));
  // Morris-kolonner på axlarna
  for (const sx of [-1, 1]) add('column', '', sx * 385, 0);
  for (const sy of [-1, 1]) add('column', '', 0, sy * 345);
  // Café-terrasser (punktsymmetriska)
  for (const [x, y] of [[-470, 340], [-380, 395], [-295, 340]]) { add('cafe', '', x, y); add('cafe', '', -x, -y); }
  // Bouquinister vid kajen
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) add('kiosk', '', sx * 745, sy * 95);
  // Karusellen i norr, Eiffeltornet i söder
  add('carousel', '', 0, -600);
  add('tower', '', 0, 600);
  // Slumpade tunnor
  const ok = (x, y, r) => {
    const d = Math.hypot(x, y), th = Math.atan2(y, x);
    if (d > placeR(th) - r - 80 || d < CFG.hillR + r + 50) return false;
    if (m.inPond(x, y, r + 25)) return false;
    const ct = m.court; if (Math.abs(x - ct.x) < ct.w / 2 + r + 20 && Math.abs(y - ct.y) < ct.h / 2 + r + 20) return false;
    for (const s of m.spawns) if (Math.hypot(x - s.x, y - s.y) < 130 + r) return false;
    for (const o of m.obstacles) if (Math.hypot(x - o.x, y - o.y) < o.r + r + 30) return false;
    return true;
  };
  for (let i = 0, n = 0; i < 400 && n < 8; i++) {
    const x = Math.round(rnd(-760, 760)), y = Math.round(rnd(-660, 660));
    if (ok(x, y, OB_TYPES.barrel.r)) { add('barrel', '', x, y); n++; }
  }
  return m;
}
