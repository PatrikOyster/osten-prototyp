'use strict';
/* =====================================================================
   RENDERER – kamera, hav/ö, djupsortering, partiklar och minikarta.
   Får en "vy" (Sim.makeView-format) och ritar den. Ändrar aldrig speldata.
   ===================================================================== */

const GROUND_R = 1100;   // markcachen täcker [-R, R] i båda led

function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function coastPath(c, off, wob, t, fn) {
  c.beginPath();
  const N = 200, cr = fn || coastR;
  for (let i = 0; i <= N; i++) {
    const th = i / N * TAU;
    let r = cr(th) + off;
    if (wob) r += Math.sin(th * 9 + t * 1.6) * wob + Math.sin(th * 4 - t * 1.1) * wob * 0.6;
    const x = Math.cos(th) * r, y = Math.sin(th) * r;
    if (i) c.lineTo(x, y); else c.moveTo(x, y);
  }
  c.closePath();
}

/* Sjöfärger per bana (övre/nedre kant av bakgrunden) */
const SEA_THEME = { ile: ['#46b9d8', '#2c8fbd'], place: ['#6dbbad', '#3f918a'] };

function buildGround(map, S) { return map.kind === 'place' ? buildPlaceGround(map, S) : buildIslandGround(map, S); }

/* ---------- Statisk markbild för ön: sand, gräs, kulle, damm, brygga, torg ---------- */
function buildIslandGround(map, S) {
  const R = GROUND_R, N = Math.ceil(R * 2 * S);
  const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
  const c = cv.getContext('2d');
  c.setTransform(S, 0, 0, S, R * S, R * S);
  const rng = mulberry32(0x5EED1234), rnd = (a, b) => a + (b - a) * rng();
  const HR = CFG.hillR, vil = map.village, P = map.pier, pond = map.pond;
  const grassR = th => coastR(th) - 44 + 9 * Math.sin(th * 11 + 2) + 6 * Math.sin(th * 17 + 0.5);
  const blob = fn => {
    c.beginPath();
    for (let i = 0; i <= 200; i++) { const th = i / 200 * TAU, r = fn(th); if (i) c.lineTo(Math.cos(th) * r, Math.sin(th) * r); else c.moveTo(Math.cos(th) * r, Math.sin(th) * r); }
    c.closePath();
  };
  // Sand med blöt kant
  blob(coastR); c.fillStyle = '#f1dca6'; c.fill();
  c.save(); blob(coastR); c.clip(); blob(coastR); c.lineWidth = 52; c.strokeStyle = 'rgba(182,140,70,0.30)'; c.stroke(); c.restore();
  // Gräs
  blob(grassR);
  const gg = c.createRadialGradient(0, 0, 80, 0, 0, 960); gg.addColorStop(0, '#9fda80'); gg.addColorStop(1, '#78bd60');
  c.fillStyle = gg; c.fill(); c.lineWidth = 5; c.strokeStyle = '#3f7f36'; c.stroke();
  // Gräsfläckar
  c.save(); blob(grassR); c.clip();
  for (let i = 0; i < 90; i++) {
    const a = rnd(0, TAU), d = Math.sqrt(rng()) * 900;
    c.fillStyle = i & 1 ? 'rgba(255,255,255,0.06)' : 'rgba(30,90,40,0.07)';
    c.beginPath(); c.ellipse(Math.cos(a) * d, Math.sin(a) * d, rnd(50, 150), rnd(35, 100), rnd(0, 3), 0, TAU); c.fill();
  }
  c.restore();
  // Sandstreck och snäckor
  for (let i = 0; i < 320; i++) {
    const th = rnd(0, TAU), g = grassR(th), r = rnd(g + 6, coastR(th) - 8);
    c.fillStyle = 'rgba(150,110,50,0.32)'; c.beginPath(); c.arc(Math.cos(th) * r, Math.sin(th) * r, rnd(1.2, 2.6), 0, TAU); c.fill();
  }
  for (let i = 0; i < 34; i++) {
    const th = rnd(0, TAU), g = grassR(th), r = rnd(g + 8, coastR(th) - 12), x = Math.cos(th) * r, y = Math.sin(th) * r;
    c.save(); c.translate(x, y); c.rotate(rnd(0, 3)); c.beginPath(); c.ellipse(0, 0, 7, 5, 0, 0, TAU); c.fillStyle = '#fff6e6'; c.fill(); c.lineWidth = 1.6; c.strokeStyle = '#d9a08a'; c.stroke(); c.restore();
  }
  // Stigar och torg
  const vx = vil.x, vy = vil.y, vd = Math.hypot(vx, vy), ux = vx / vd, uy = vy / vd;
  const pathA = { x0: ux * (HR - 20), y0: uy * (HR - 20), x1: vx, y1: vy, cx: (ux * (HR - 20) + vx) / 2 - uy * 50, cy: (uy * (HR - 20) + vy) / 2 + ux * 50 };
  const pathB = { x0: 0, y0: HR - 20, x1: 0, y1: P.y0 + 40, cx: 18, cy: (HR + P.y0) / 2 };
  const nearPath = (x, y) => {
    for (const q of [pathA, pathB]) for (let k = 0; k <= 16; k++) {
      const t = k / 16, mt = 1 - t, px = mt * mt * q.x0 + 2 * mt * t * q.cx + t * t * q.x1, py = mt * mt * q.y0 + 2 * mt * t * q.cy + t * t * q.y1;
      if ((px - x) * (px - x) + (py - y) * (py - y) < 52 * 52) return true;
    }
    return false;
  };
  const skip = (x, y) => {
    const d = Math.hypot(x, y);
    if (d < HR + 14 || d > grassR(Math.atan2(y, x)) - 12) return true;
    if (map.inPond(x, y, 26)) return true;
    if (Math.hypot(x - vx, y - vy) < 228) return true;
    if (x > P.x0 - 34 && x < P.x1 + 34 && y > P.y0 - 40) return true;
    return nearPath(x, y);
  };
  // Gräsplumpar och blommor
  c.lineCap = 'round';
  for (let i = 0, n = 0; i < 2400 && n < 820; i++) {
    const a = rnd(0, TAU), d = Math.sqrt(rng()) * 930, x = Math.cos(a) * d, y = Math.sin(a) * d;
    if (skip(x, y)) continue; n++;
    c.strokeStyle = rng() < 0.5 ? '#56a244' : '#4a9640'; c.lineWidth = 2.6;
    c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x - 6.5, y - 7); c.moveTo(x, y); c.lineTo(x, y - 9.5); c.moveTo(x + 4, y); c.lineTo(x + 6.5, y - 7); c.stroke();
  }
  const FL = ['#ffffff', '#ffd23f', '#ff7aa8', '#8fd3ff', '#ffb36b'];
  for (let i = 0, n = 0; i < 1200 && n < 170; i++) {
    const a = rnd(0, TAU), d = Math.sqrt(rng()) * 930, x = Math.cos(a) * d, y = Math.sin(a) * d;
    if (skip(x, y)) continue; n++;
    c.fillStyle = FL[(rng() * FL.length) | 0];
    for (let k = 0; k < 5; k++) { const aa = k * TAU / 5; c.beginPath(); c.arc(x + Math.cos(aa) * 3, y + Math.sin(aa) * 3, 2.3, 0, TAU); c.fill(); }
    c.fillStyle = '#e8a800'; c.beginPath(); c.arc(x, y, 1.8, 0, TAU); c.fill();
  }
  const strokeCurve = q => {
    c.beginPath(); c.moveTo(q.x0, q.y0); c.quadraticCurveTo(q.cx, q.cy, q.x1, q.y1);
    c.lineCap = 'round'; c.strokeStyle = '#b9a57e'; c.lineWidth = 60; c.stroke();
    c.strokeStyle = '#e8dab9'; c.lineWidth = 50; c.stroke();
    for (let k = 0; k <= 46; k++) {
      const t = k / 46, mt = 1 - t, px = mt * mt * q.x0 + 2 * mt * t * q.cx + t * t * q.x1, py = mt * mt * q.y0 + 2 * mt * t * q.cy + t * t * q.y1;
      c.fillStyle = 'rgba(120,100,70,0.26)'; c.beginPath(); c.ellipse(px + rnd(-18, 18), py + rnd(-18, 18), rnd(4, 7), rnd(3, 5), rnd(0, 3), 0, TAU); c.fill();
    }
  };
  strokeCurve(pathA); strokeCurve(pathB);
  // Torget i byn (kullersten)
  c.beginPath(); c.arc(vx, vy, 215, 0, TAU); c.fillStyle = '#e8dab9'; c.fill(); c.lineWidth = 5; c.strokeStyle = '#b09a70'; c.stroke();
  for (let i = 0; i < 150; i++) {
    const a = rnd(0, TAU), d = Math.sqrt(rng()) * 205;
    c.fillStyle = 'rgba(120,100,70,0.24)'; c.beginPath(); c.ellipse(vx + Math.cos(a) * d, vy + Math.sin(a) * d, rnd(5, 9), rnd(3.5, 6), rnd(0, 3), 0, TAU); c.fill();
  }
  c.beginPath(); c.arc(vx, vy, 188, 0, TAU); c.setLineDash([10, 9]); c.strokeStyle = 'rgba(120,100,70,0.35)'; c.lineWidth = 3; c.stroke(); c.setLineDash([]);
  // Ostkullen: terrasser med pilar utåt (osten rullar åt det hållet)
  for (const [rr, col] of [[HR, '#74b95b'], [HR * 0.82, '#83c767'], [HR * 0.64, '#92d174'], [HR * 0.46, '#a1dc82']]) {
    c.beginPath(); c.arc(0, 0, rr, 0, TAU); c.fillStyle = col; c.fill(); c.lineWidth = 4; c.strokeStyle = '#4a8c3d'; c.stroke();
  }
  c.strokeStyle = 'rgba(255,255,255,0.30)'; c.lineWidth = 7; c.lineCap = 'round'; c.lineJoin = 'round';
  for (const [rr, off, n] of [[HR * 0.38, 0.2, 9], [HR * 0.73, 0.0, 14]]) {
    for (let i = 0; i < n; i++) {
      c.save(); c.rotate(i * TAU / n + off); c.beginPath(); c.moveTo(rr, -13); c.lineTo(rr + 21, 0); c.lineTo(rr, 13); c.stroke(); c.restore();
    }
  }
  c.beginPath(); c.arc(0, 0, 46, 0, TAU); c.fillStyle = '#d9cfb8'; c.fill(); c.lineWidth = 4; c.strokeStyle = OUT; c.stroke();
  c.beginPath(); c.arc(0, 0, 33, 0, TAU); c.fillStyle = '#efe6d0'; c.fill(); c.lineWidth = 3; c.strokeStyle = 'rgba(42,26,18,0.5)'; c.stroke();
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.fillStyle = 'rgba(160,140,100,0.5)'; c.beginPath(); c.arc(Math.cos(a) * 39.5, Math.sin(a) * 39.5, 2.4, 0, TAU); c.fill(); }
  // Dammen med näckrosor och en anka
  c.beginPath(); c.ellipse(pond.x, pond.y, pond.rx + 12, pond.ry + 10, 0, 0, TAU); c.fillStyle = '#ecd8a2'; c.fill(); c.lineWidth = 4; c.strokeStyle = OUT; c.stroke();
  c.beginPath(); c.ellipse(pond.x, pond.y, pond.rx, pond.ry, 0, 0, TAU);
  const pg = c.createRadialGradient(pond.x - 30, pond.y - 20, 10, pond.x, pond.y, pond.rx); pg.addColorStop(0, '#7fd0ea'); pg.addColorStop(1, '#44a8d2');
  c.fillStyle = pg; c.fill(); c.lineWidth = 3; c.strokeStyle = '#2d86ae'; c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 3;
  for (const [ox, oy, r] of [[-50, -22, 26], [38, 20, 20], [-8, 34, 14]]) { c.beginPath(); c.arc(pond.x + ox, pond.y + oy, r, 3.6, 4.9); c.stroke(); }
  for (const [ox, oy, r] of [[-62, 12, 15], [58, -26, 13], [18, -46, 11]]) {
    c.save(); c.translate(pond.x + ox, pond.y + oy); c.rotate(ox);
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r, 0.4, TAU - 0.15); c.closePath(); c.fillStyle = '#4fa650'; c.fill(); c.lineWidth = 2.4; c.strokeStyle = '#2f6e36'; c.stroke();
    if (r > 12) { c.beginPath(); c.arc(-1, -1, 3.6, 0, TAU); c.fillStyle = '#ff9ec4'; c.fill(); c.lineWidth = 1.6; c.strokeStyle = '#c24a7a'; c.stroke(); }
    c.restore();
  }
  c.save(); c.translate(pond.x + 12, pond.y - 4);
  c.beginPath(); c.ellipse(0, 4, 17, 11, 0, 0, TAU); c.fillStyle = '#ffd23f'; c.fill(); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
  c.beginPath(); c.arc(11, -9, 8.5, 0, TAU); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(17, -9); c.lineTo(26, -6); c.lineTo(17, -4); c.closePath(); c.fillStyle = '#ff8c1a'; c.fill(); c.lineWidth = 2; c.stroke();
  c.beginPath(); c.arc(13, -12, 1.7, 0, TAU); c.fillStyle = '#111'; c.fill();
  c.restore();
  // Bryggan
  c.fillStyle = '#b98a56'; c.fillRect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0);
  for (let y = P.y0 + 6, i = 0; y < P.y1 - 4; y += 14, i++) {
    if (i % 3 === 1) { c.fillStyle = 'rgba(255,230,180,0.18)'; c.fillRect(P.x0 + 2, y, P.x1 - P.x0 - 4, 12); }
    c.strokeStyle = '#7d5430'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(P.x0, y + 13); c.lineTo(P.x1, y + 13); c.stroke();
  }
  c.lineWidth = 4; c.strokeStyle = OUT; c.strokeRect(P.x0, P.y0, P.x1 - P.x0, P.y1 - P.y0);
  for (let y = P.y0 + 40; y < P.y1; y += 70) for (const x of [P.x0, P.x1]) {
    c.beginPath(); c.arc(x, y, 7.5, 0, TAU); c.fillStyle = '#6b4a2b'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = OUT; c.stroke();
  }
  // Startplatser: kokard i tre färger
  for (const s of map.spawns) {
    for (const [r, col] of [[46, '#d62839'], [34, '#ffffff'], [22, '#2442a8']]) { c.beginPath(); c.arc(s.x, s.y, r, 0, TAU); c.fillStyle = col; c.fill(); }
    c.beginPath(); c.arc(s.x, s.y, 46, 0, TAU); c.lineWidth = 4; c.strokeStyle = OUT; c.stroke();
  }
  return cv;
}


/* ---------- Torgets markbild: kaj, kullersten, trikolor-kant, stenpodium, bassäng, pétanquebana ---------- */
function buildPlaceGround(map, S) {
  const R = GROUND_R, N = Math.ceil(R * 2 * S);
  const cv = document.createElement('canvas'); cv.width = N; cv.height = N;
  const c = cv.getContext('2d');
  c.setTransform(S, 0, 0, S, R * S, R * S);
  const rng = mulberry32(0x9A15E5), rnd = (a, b) => a + (b - a) * rng();
  const cr = map.coastR, HR = CFG.hillR, pond = map.pond, ct = map.court;
  const path = fn => {
    c.beginPath();
    for (let i = 0; i <= 240; i++) { const th = i / 240 * TAU, r = fn(th), x = Math.cos(th) * r, y = Math.sin(th) * r; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
    c.closePath();
  };
  c.lineJoin = 'round'; c.lineCap = 'round';
  // Kajen (stenmur) med fogar
  path(th => cr(th)); c.fillStyle = '#cfc2a3'; c.fill(); c.lineWidth = 6; c.strokeStyle = OUT; c.stroke();
  c.strokeStyle = 'rgba(95,75,45,0.40)'; c.lineWidth = 2;
  for (let th = 0; th < TAU; th += 0.028) { const r = cr(th); c.beginPath(); c.moveTo(Math.cos(th) * (r - 27), Math.sin(th) * (r - 27)); c.lineTo(Math.cos(th) * (r - 3), Math.sin(th) * (r - 3)); c.stroke(); }
  path(th => cr(th) - 15); c.lineWidth = 2.4; c.stroke();
  // Kullersten/plattor i förband
  path(th => cr(th) - 28); c.fillStyle = '#efe3c6'; c.fill();
  c.save(); path(th => cr(th) - 28); c.clip();
  const TW = 96, TH = 60;
  for (let ty = -18; ty < 18; ty++) {
    const off = (ty & 1) ? TW / 2 : 0;
    for (let tx = -13; tx < 13; tx++) {
      const h = hash2(tx + 31, ty - 17);
      c.fillStyle = h < 0.28 ? 'rgba(165,135,85,0.13)' : h < 0.56 ? 'rgba(255,255,255,0.22)' : h < 0.72 ? 'rgba(120,100,60,0.06)' : 'rgba(0,0,0,0)';
      c.fillRect(tx * TW + off, ty * TH, TW, TH);
    }
  }
  c.strokeStyle = 'rgba(130,108,70,0.30)'; c.lineWidth = 2.2;
  for (let ty = -18; ty <= 18; ty++) {
    c.beginPath(); c.moveTo(-1150, ty * TH); c.lineTo(1150, ty * TH); c.stroke();
    const off = (ty & 1) ? TW / 2 : 0;
    for (let tx = -13; tx <= 13; tx++) { const x = tx * TW + off; c.beginPath(); c.moveTo(x, ty * TH); c.lineTo(x, (ty + 1) * TH); c.stroke(); }
  }
  for (let i = 0; i < 1300; i++) { c.fillStyle = 'rgba(120,100,70,0.20)'; c.beginPath(); c.ellipse(rnd(-950, 950), rnd(-850, 850), rnd(2, 4.5), rnd(1.5, 3), rnd(0, 3), 0, TAU); c.fill(); }
  c.restore();
  path(th => cr(th) - 28); c.lineWidth = 4; c.strokeStyle = '#a28e68'; c.stroke();
  // Trikolor-kant inlagd i stenen
  const band = (off, w, col) => { path(th => cr(th) + off); c.lineWidth = w; c.strokeStyle = col; c.stroke(); };
  band(-62, 37, OUT); band(-51.5, 11.5, '#2442a8'); band(-62, 11.5, '#ffffff'); band(-72.5, 11.5, '#d62839');
  // Plantgropar med galler under träden
  for (const ob of map.obstacles) {
    if (ob.t !== 'tree') continue;
    c.beginPath(); c.ellipse(ob.x, ob.y + 8, 33, 14, 0, 0, TAU); c.fillStyle = '#82735e'; c.fill(); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
    c.beginPath(); c.ellipse(ob.x, ob.y + 8, 22, 9, 0, 0, TAU); c.lineWidth = 2; c.strokeStyle = 'rgba(42,26,18,0.55)'; c.stroke();
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8; c.beginPath(); c.moveTo(ob.x + Math.cos(a) * 9, ob.y + 8 + Math.sin(a) * 4); c.lineTo(ob.x + Math.cos(a) * 31, ob.y + 8 + Math.sin(a) * 13); c.stroke(); }
  }
  // Pétanquebana (dekor)
  {
    const cx = ct.x, cy = ct.y, w = ct.w, h = ct.h;
    rrect(c, cx - w / 2 - 12, cy - h / 2 - 12, w + 24, h + 24, 14); c.fillStyle = '#8a5a34'; c.fill(); c.lineWidth = 4; c.strokeStyle = OUT; c.stroke();
    rrect(c, cx - w / 2, cy - h / 2, w, h, 8); c.fillStyle = '#dcc79c'; c.fill(); c.lineWidth = 2.5; c.strokeStyle = 'rgba(42,26,18,0.5)'; c.stroke();
    for (let i = 0; i < 260; i++) { c.fillStyle = i & 1 ? 'rgba(120,90,50,0.30)' : 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(cx + rnd(-w / 2 + 6, w / 2 - 6), cy + rnd(-h / 2 + 6, h / 2 - 6), rnd(1, 2.4), 0, TAU); c.fill(); }
    c.setLineDash([10, 8]); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx - w / 2 + 40, cy - h / 2 + 8); c.lineTo(cx - w / 2 + 40, cy + h / 2 - 8); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(cx - w / 2 + 40, cy, 15, 0, TAU); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 3; c.stroke();
    const boule = (x, y, r, col) => {
      c.fillStyle = 'rgba(30,20,10,0.25)'; c.beginPath(); c.ellipse(x + 2, y + r * 0.7, r, r * 0.5, 0, 0, TAU); c.fill();
      const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 1, x, y, r); g.addColorStop(0, '#f6f8fb'); g.addColorStop(1, col);
      c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = g; c.fill(); c.lineWidth = 2.2; c.strokeStyle = OUT; c.stroke();
    };
    for (const [bx, by, col] of [[60, -34, '#7c8794'], [88, 10, '#7c8794'], [30, 40, '#7c8794'], [104, -22, '#b0744a'], [72, 44, '#b0744a'], [118, 30, '#b0744a']]) boule(cx - w / 2 + bx + 30, cy + by * 0.8, 9, col);
    c.beginPath(); c.arc(cx + 28, cy + 4, 4.5, 0, TAU); c.fillStyle = '#ffd23f'; c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke();
  }
  // Stenpodiet i mitten (Ostkullen): trappsteg med pilar utåt (osten rullar åt det hållet)
  for (const [rr, col] of [[HR, '#d2c7ac'], [HR * 0.82, '#dcd2b8'], [HR * 0.64, '#e6dcc5'], [HR * 0.46, '#f0e8d4']]) {
    c.beginPath(); c.arc(0, 0, rr, 0, TAU); c.fillStyle = col; c.fill(); c.lineWidth = 4; c.strokeStyle = '#8a7855'; c.stroke();
    c.beginPath(); c.arc(0, 0, rr - 6, Math.PI * 1.05, Math.PI * 1.95); c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 4; c.stroke();
  }
  c.strokeStyle = 'rgba(150,118,60,0.45)'; c.lineWidth = 7;
  for (const [rr, off, n] of [[HR * 0.73, 0.0, 14], [HR * 0.55, 0.2, 10]]) {
    for (let i = 0; i < n; i++) { c.save(); c.rotate(i * TAU / n + off); c.beginPath(); c.moveTo(rr, -13); c.lineTo(rr + 21, 0); c.lineTo(rr, 13); c.stroke(); c.restore(); }
  }
  c.beginPath();
  for (let i = 0; i < 16; i++) { const a = i * TAU / 16 - Math.PI / 2, r = i & 1 ? 56 : 104; if (i) c.lineTo(Math.cos(a) * r, Math.sin(a) * r); else c.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  c.closePath(); c.fillStyle = 'rgba(36,66,168,0.20)'; c.fill(); c.lineWidth = 3; c.strokeStyle = 'rgba(36,66,168,0.55)'; c.stroke();
  c.beginPath(); c.arc(0, 0, 46, 0, TAU); c.fillStyle = '#d9cfb8'; c.fill(); c.lineWidth = 4; c.strokeStyle = OUT; c.stroke();
  c.beginPath(); c.arc(0, 0, 33, 0, TAU); c.fillStyle = '#efe6d0'; c.fill(); c.lineWidth = 3; c.strokeStyle = 'rgba(42,26,18,0.5)'; c.stroke();
  for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.fillStyle = 'rgba(160,140,100,0.5)'; c.beginPath(); c.arc(Math.cos(a) * 39.5, Math.sin(a) * 39.5, 2.4, 0, TAU); c.fill(); }
  // Bassängen med leksaksbåtar
  c.beginPath(); c.ellipse(pond.x, pond.y, pond.rx + 16, pond.ry + 14, 0, 0, TAU); c.fillStyle = '#cfc2a3'; c.fill(); c.lineWidth = 4; c.strokeStyle = OUT; c.stroke();
  c.beginPath(); c.ellipse(pond.x, pond.y, pond.rx, pond.ry, 0, 0, TAU);
  const pg = c.createRadialGradient(pond.x - 30, pond.y - 20, 10, pond.x, pond.y, pond.rx); pg.addColorStop(0, '#a6e4e0'); pg.addColorStop(1, '#4fb2b0');
  c.fillStyle = pg; c.fill(); c.lineWidth = 3; c.strokeStyle = '#2d8a89'; c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 3;
  for (const [ox, oy, r] of [[-62, -22, 24], [58, 26, 20], [10, 40, 14], [-20, -42, 16]]) { c.beginPath(); c.arc(pond.x + ox, pond.y + oy, r, 3.6, 4.9); c.stroke(); }
  const boat = (x, y, hull, sail, flip) => {
    c.save(); c.translate(x, y); c.scale(flip, 1);
    c.fillStyle = 'rgba(20,70,70,0.25)'; c.beginPath(); c.ellipse(2, 8, 22, 6, 0, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(-22, 0); c.lineTo(22, 0); c.lineTo(15, 11); c.lineTo(-15, 11); c.closePath(); fillOut(c, hull, 2.5);
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -36); oStroke(c, 2.6);
    c.beginPath(); c.moveTo(2, -34); c.lineTo(22, -4); c.lineTo(2, -4); c.closePath(); fillOut(c, sail, 2.4);
    c.beginPath(); c.moveTo(-2, -30); c.lineTo(-16, -4); c.lineTo(-2, -4); c.closePath(); fillOut(c, '#fff', 2.4);
    c.restore();
  };
  boat(pond.x - 38, pond.y + 12, '#d62839', '#2442a8', 1); boat(pond.x + 52, pond.y - 14, '#2442a8', '#d62839', -1);
  // Livbojar på kajen
  for (const th of [0.55, 1.25, 1.95, 2.7, 3.5, 4.2, 4.95, 5.7]) {
    const r = cr(th) - 14, x = Math.cos(th) * r, y = Math.sin(th) * r;
    c.beginPath(); c.arc(x, y, 9, 0, TAU); c.fillStyle = '#fff'; c.fill();
    for (let k = 0; k < 4; k += 2) { c.beginPath(); c.moveTo(x, y); c.arc(x, y, 9, k * Math.PI / 2, (k + 1) * Math.PI / 2); c.closePath(); c.fillStyle = '#d62839'; c.fill(); }
    c.beginPath(); c.arc(x, y, 9, 0, TAU); c.lineWidth = 2.4; c.strokeStyle = OUT; c.stroke();
    c.beginPath(); c.arc(x, y, 3.4, 0, TAU); c.fillStyle = '#cfc2a3'; c.fill(); c.lineWidth = 1.6; c.stroke();
  }
  // Startplatser: kokard i tre färger
  for (const sp of map.spawns) {
    for (const [r, col] of [[46, '#d62839'], [34, '#ffffff'], [22, '#2442a8']]) { c.beginPath(); c.arc(sp.x, sp.y, r, 0, TAU); c.fillStyle = col; c.fill(); }
    c.beginPath(); c.arc(sp.x, sp.y, 46, 0, TAU); c.lineWidth = 4; c.strokeStyle = OUT; c.stroke();
  }
  return cv;
}

/* ---------- Kartformer för minikarta och banväljare (bygger på världskoordinater) ---------- */
function drawMapShapes(c, map, detail) {
  const cr = map.coastR;
  const blob = (off, col) => { c.beginPath(); for (let i = 0; i <= 120; i++) { const th = i / 120 * TAU, r = cr(th) + off; if (i) c.lineTo(Math.cos(th) * r, Math.sin(th) * r); else c.moveTo(Math.cos(th) * r, Math.sin(th) * r); } c.closePath(); c.fillStyle = col; c.fill(); };
  if (map.kind === 'place') {
    blob(0, '#cfc2a3'); blob(-28, '#efe3c6');
    c.beginPath(); c.arc(0, 0, CFG.hillR, 0, TAU); c.fillStyle = '#d2c7ac'; c.fill();
    c.beginPath(); c.arc(0, 0, 46, 0, TAU); c.fillStyle = '#f0e8d4'; c.fill();
    c.beginPath(); c.ellipse(map.pond.x, map.pond.y, map.pond.rx, map.pond.ry, 0, 0, TAU); c.fillStyle = '#6cc3c0'; c.fill();
    const ct = map.court; c.fillStyle = '#dcc79c'; c.fillRect(ct.x - ct.w / 2, ct.y - ct.h / 2, ct.w, ct.h);
    for (const ob of map.obstacles) {
      switch (ob.t) {
        case 'stall': c.fillStyle = ob.v === 'pain' ? '#2442a8' : ob.v === 'fleurs' ? '#2f9e5b' : ob.v === 'fromage' ? '#f2b81f' : '#d62839'; c.fillRect(ob.x - 46, ob.y - 30, 92, 60); break;
        case 'carousel': c.beginPath(); c.arc(ob.x, ob.y, 78, 0, TAU); c.fillStyle = '#d62839'; c.fill(); c.beginPath(); c.arc(ob.x, ob.y, 36, 0, TAU); c.fillStyle = '#fff'; c.fill(); break;
        case 'tower': c.beginPath(); c.arc(ob.x, ob.y, 52, 0, TAU); c.fillStyle = '#6b5a4a'; c.fill(); break;
        case 'tree': if (detail) { c.beginPath(); c.arc(ob.x, ob.y, 30, 0, TAU); c.fillStyle = '#58a843'; c.fill(); } break;
        case 'cafe': if (detail) { c.beginPath(); c.arc(ob.x, ob.y, 24, 0, TAU); c.fillStyle = '#d62839'; c.fill(); } break;
      }
    }
  } else {
    blob(0, '#eed9a0'); blob(-48, '#7fc269');
    c.beginPath(); c.arc(0, 0, CFG.hillR, 0, TAU); c.fillStyle = '#5ea84b'; c.fill();
    c.beginPath(); c.arc(0, 0, 46, 0, TAU); c.fillStyle = '#e8dfc8'; c.fill();
    c.beginPath(); c.ellipse(map.pond.x, map.pond.y, map.pond.rx, map.pond.ry, 0, 0, TAU); c.fillStyle = '#58b6dc'; c.fill();
    c.fillStyle = '#b98a56'; c.fillRect(map.pier.x0, map.pier.y0, map.pier.x1 - map.pier.x0, map.pier.y1 - map.pier.y0);
    c.beginPath(); c.arc(map.village.x, map.village.y, 190, 0, TAU); c.fillStyle = '#e5d6b2'; c.fill();
    for (const ob of map.obstacles) {
      if (ob.t === 'house') { c.fillStyle = '#c85a3a'; c.fillRect(ob.x - 52, ob.y - 38, 104, 76); }
      else if (detail && ob.t === 'tree') { c.beginPath(); c.arc(ob.x, ob.y, 30, 0, TAU); c.fillStyle = '#3f8f3a'; c.fill(); }
    }
  }
}
/* Förhandsbild av en bana (för banväljaren i lobbyn) */
function drawMapThumb(cv, kind) {
  const map = makeMap(20261117, kind), c = cv.getContext('2d'), w = cv.width, h = cv.height;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
  const tc = SEA_THEME[kind] || SEA_THEME.ile, g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, tc[0]); g.addColorStop(1, tc[1]); c.fillStyle = g; c.fillRect(0, 0, w, h);
  const s = Math.min(w, h) / 2 / (kind === 'place' ? 900 : 1010);
  c.translate(w / 2, h / 2); c.scale(s, s);
  drawMapShapes(c, map, true);
  c.setTransform(1, 0, 0, 1, 0, 0);
}

/* ---------- Små canvas-hjälpare för UI (porträtt, vapenikoner, ost) ---------- */
function drawPortrait(cv, skin, o) {
  o = o || {};
  const c = cv.getContext('2d'), w = cv.width, h = cv.height;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
  const sc = h / (o.weapon ? 124 : 112);
  c.setTransform(sc, 0, 0, sc, w / (o.weapon ? 2.6 : 2), h - 9 * sc);
  drawCharacter(c, { x: 0, y: 0, skin: skin, a: o.a === undefined ? 0.35 : o.a, vx: 0, vy: 0, phase: 0, t: o.t || 0, id: skin, weapon: o.weapon || null, carry: !!o.carry, ko: !!o.ko });
  c.setTransform(1, 0, 0, 1, 0, 0);
}
/* Krona till vinnaren (prispallen och resultattabellen) */
function drawCrown(cv) {
  const c = cv.getContext('2d'), w = cv.width, h = cv.height;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
  const sc = Math.min(w / 112, h / 74);
  c.setTransform(sc, 0, 0, sc, w / 2, h - 6 * sc);
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-42, 0); c.lineTo(-47, -48); c.lineTo(-24, -30); c.lineTo(0, -60); c.lineTo(24, -30); c.lineTo(47, -48); c.lineTo(42, 0); c.closePath();
  const g = c.createLinearGradient(0, -60, 0, 0); g.addColorStop(0, '#fff0a0'); g.addColorStop(0.55, '#ffd23f'); g.addColorStop(1, '#e6a800');
  c.fillStyle = g; c.fill(); c.lineWidth = 5.5; c.strokeStyle = OUT; c.stroke();
  c.beginPath(); c.moveTo(-26, -10); c.lineTo(-22, -30); c.moveTo(26, -10); c.lineTo(22, -30); c.lineWidth = 2.5; c.strokeStyle = 'rgba(160,105,0,0.55)'; c.stroke();
  rrect(c, -42, -15, 84, 17, 5); c.fillStyle = '#d62839'; c.fill(); c.lineWidth = 5; c.strokeStyle = OUT; c.stroke();
  for (const [x, col] of [[-26, '#ffffff'], [-9, '#2442a8'], [9, '#ffffff'], [26, '#2442a8']]) { c.beginPath(); c.arc(x, -6.5, 4.6, 0, TAU); c.fillStyle = col; c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke(); }
  for (const [x, y, r] of [[-47, -48, 6.5], [0, -60, 7.5], [47, -48, 6.5]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 3.5; c.strokeStyle = OUT; c.stroke(); }
  c.beginPath(); c.moveTo(-36, -36); c.lineTo(-30, -25); c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 3; c.stroke();
  c.setTransform(1, 0, 0, 1, 0, 0);
}
const ICON_BOX = {
  baguette: [-4, 78], coq: [-2, 70], poele: [-4, 76], poireau: [-4, 112], patate: [-2, 80], petanque: [8, 60], pigeon: [-8, 58],
  feu: [-8, 82], epoisses: [4, 56], champagne: [-2, 76], souffleur: [-4, 72], trampoline: [-2, 58]
};
function drawWeaponTo(cv, id, o) {
  o = o || {};
  const c = cv.getContext('2d'), w = cv.width, h = cv.height, b = ICON_BOX[id] || [0, 80];
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
  const sc = Math.min((w - 10) / (b[1] - b[0]), (h - 6) / 58);
  c.setTransform(sc, 0, 0, sc, w / 2 - (b[0] + b[1]) / 2 * sc, h / 2);
  drawWeaponIcon(c, id, 0, 0, 1, o.rot || 0, o.t || 0);
  c.setTransform(1, 0, 0, 1, 0, 0);
}
function drawCheeseTo(cv, k) {
  const c = cv.getContext('2d'), w = cv.width, h = cv.height;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
  const sc = (k || 1) * Math.min(w / 70, h / 62);
  c.setTransform(sc, 0, 0, sc, w / 2, h / 2 + 4 * sc);
  drawCheese(c, 0, 0, 0.4, 0, 1);
  c.setTransform(1, 0, 0, 1, 0, 0);
}

/* =====================================================================
   Renderer
   ===================================================================== */
class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.c = canvas.getContext('2d');
    this.W = 800; this.H = 600; this.dpr = 1;
    this.cam = { x: 0, y: 40, z: 0.4 };
    this.shake = 0; this.snap = true;
    this.map = null; this.meta = new Map(); this.me = -1;
    this.ground = null; this.groundS = 1; this.mm = null;
    this.sprites = null;
    this.parts = []; this.texts = [];
    this.pst = new Map(); this.born = new Map(); this.dent = new Map();
    this.mouse = { x: 0, y: 0, in: false };
    this.t = 0; this.lastView = null;
    this._items = []; this.flags = [];
    this.idleView = { t: 0, phase: 'idle', pt: 0, mt: 0, players: [], cheese: { x: 0, y: 0, vx: 0, vy: 0, st: 'ground', by: -1, air: 0, rot: 0.6 }, proj: [], areas: [], dead: new Set() };
    this.resize();
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.cv.clientWidth || window.innerWidth, h = this.cv.clientHeight || window.innerHeight;
    this.dpr = dpr; this.W = w; this.H = h;
    this.cv.width = Math.max(2, Math.round(w * dpr)); this.cv.height = Math.max(2, Math.round(h * dpr));
    this.seaGrad = null; this.vig = null; this.mm = null;
  }

  zoomPlay() { return clamp(Math.min(this.W / 1500, this.H / 860), 0.5, 1.7); }
  toScreen(x, y) { const z = this.cam.z; return { x: (x - this.cam.x) * z + this.W / 2, y: (y - this.cam.y) * z + this.H / 2 }; }
  toWorld(sx, sy) { const z = this.cam.z; return { x: (sx - this.W / 2) / z + this.cam.x, y: (sy - this.H / 2) / z + this.cam.y }; }
  inView(x, y, pad) { const z = this.cam.z; return Math.abs(x - this.cam.x) < this.W / 2 / z + pad && Math.abs(y - this.cam.y) < this.H / 2 / z + pad; }

  /* Anropas när en match börjar (eller när lobbyn visar kartan) */
  setMatch(map, meta, me) {
    this.map = map; this.me = me;
    this.meta = new Map((meta || []).map(p => [p.id, p]));
    this.parts.length = 0; this.texts.length = 0;
    this.pst.clear(); this.born.clear(); this.dent.clear();
    this.lastView = null; this.snap = true; this.shake = 0; this.mm = null;
    if (!this.ground || this.groundKind !== map.kind) {
      const S = this.dpr >= 1.5 ? 1.5 : 1.15;
      this.groundS = S; this.ground = null; this.ground = buildGround(map, S); this.groundKind = map.kind; this.seaGrad = null;
    }
    if (!this.sprites) this.buildSprites();
    this.flags = map.spawns.filter((_, i) => i % 2 === 0).map(sp => ({ x: sp.x + Math.cos(sp.a) * 68 - Math.sin(sp.a) * 22, y: sp.y + Math.sin(sp.a) * 68 + Math.cos(sp.a) * 22 }));
  }

  buildSprites() {
    const mk = (w, h, ox, oy, fn) => {
      const S = 2.4, cv = document.createElement('canvas'); cv.width = Math.ceil(w * S); cv.height = Math.ceil(h * S);
      const c = cv.getContext('2d'); c.scale(S, S); fn(c, ox, oy); return { cv, w, h, ox, oy };
    };
    const sp = {};
    for (const v of Object.keys(HOUSE_STYLES)) sp['house:' + v] = mk(200, 170, 100, 130, (c, x, y) => drawHouse(c, { x, y, v }, 0));
    sp.tower = mk(180, 250, 90, 200, (c, x, y) => drawTower(c, { x, y }, 0));
    sp.tree = mk(120, 140, 60, 110, (c, x, y) => drawTree(c, { x, y }, 0));
    sp.barrel = mk(70, 70, 35, 50, (c, x, y) => drawBarrel(c, { x, y }));
    sp.cafe = mk(100, 130, 50, 100, (c, x, y) => drawCafeTable(c, { x, y }));
    for (const v of Object.keys(STALL_STYLES)) sp['stall:' + v] = mk(150, 160, 75, 120, (c, x, y) => drawStall(c, { x, y, v }));
    sp.column = mk(80, 130, 40, 100, (c, x, y) => drawColumn(c, { x, y }));
    sp.carousel = mk(220, 250, 110, 190, (c, x, y) => drawCarousel(c, { x, y }, 0));
    sp.kiosk = mk(110, 100, 55, 72, (c, x, y) => drawKiosk(c, { x, y }));
    this.sprites = sp;
  }

  /* ---------- Kamera ---------- */
  updateCamera(view, dt) {
    const cam = this.cam, W = this.W, H = this.H;
    let tx = 0, ty = 50, tz = Math.min(W / 2250, H / 2250);
    if (!view) {   // titel/lobby: lugn sväng över ön
      tx = Math.sin(this.t * 0.1) * 170; ty = 50 + Math.cos(this.t * 0.08) * 120; tz = Math.min(W / 1750, H / 1750);
    }
    if (view && view.phase !== 'reveal') {
      tz = this.zoomPlay();
      const me = this.me >= 0 ? view.players.find(p => p.id === this.me) : null;
      if (me) {
        tx = me.x + me.vx * 0.2; ty = me.y + me.vy * 0.2;
        if (this.mouse.in && me.st === 0 && view.phase === 'play') {
          tx += clamp((this.mouse.x - W / 2) / cam.z * 0.14, -190, 190);
          ty += clamp((this.mouse.y - H / 2) / cam.z * 0.14, -140, 140);
        }
      } else { tx = view.cheese.x; ty = view.cheese.y; tz *= 0.88; }
    }
    if (this.snap) { cam.x = tx; cam.y = ty; cam.z = tz; this.snap = false; return; }
    const k = 1 - Math.exp(-7 * dt), kz = 1 - Math.exp(-2.4 * dt);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.z += (tz - cam.z) * kz;
  }
  addShake(x, y, amt) {
    const d = Math.hypot(x - this.cam.x, y - this.cam.y), k = clamp(1 - d / 1300, 0, 1);
    this.shake = Math.max(this.shake, amt * (0.25 + 0.75 * k));
  }

  /* ---------- Partiklar ---------- */
  spawn(o) {
    if (this.parts.length > 900) this.parts.splice(0, 100);
    const p = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, life: 1, size: 6, col: '#fff', kind: 'dot', rot: 0, vr: 0, drag: 0, grow: 0, a: 1, bounce: 0 };
    Object.assign(p, o); p.max = p.life; this.parts.push(p);
  }
  burst(x, y, n, f) { for (let i = 0; i < n; i++) this.spawn(f(i, n)); }
  text(x, y, str, col, size) { this.texts.push({ x, y, str, col: col || '#fff', size: size || 30, age: 0, life: 1.1, rot: (Math.random() - 0.5) * 0.3 }); if (this.texts.length > 24) this.texts.shift(); }

  updateParts(dt) {
    const arr = this.parts;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.life -= dt;
      if (p.life <= 0) { arr[i] = arr[arr.length - 1]; arr.pop(); continue; }
      if (p.drag) { const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vz -= p.g * dt; p.z += p.vz * dt;
      if (p.z < 0) { p.z = 0; if (p.bounce) p.vz = -p.vz * p.bounce; else { p.vz = 0; p.vx *= 0.7; p.vy *= 0.7; p.vr *= 0.7; } }
      p.rot += p.vr * dt;
    }
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.age += dt; if (t.age > t.life) this.texts.splice(i, 1); }
  }

  drawParts(c) {
    for (const p of this.parts) {
      const k = p.life / p.max, y = p.y - p.z;
      let al = p.a * (p.fade === false ? 1 : Math.min(1, k * 3));
      if (al <= 0.01) continue;
      c.globalAlpha = al;
      switch (p.kind) {
        case 'dot': c.fillStyle = p.col; c.beginPath(); c.arc(p.x, y, p.size * (1 + p.grow * (1 - k)), 0, TAU); c.fill(); break;
        case 'star': star(c, p.x, y, p.size, p.rot); c.fillStyle = p.col; c.fill(); c.lineWidth = 1.6; c.strokeStyle = OUT; c.stroke(); break;
        case 'crumb': c.save(); c.translate(p.x, y); c.rotate(p.rot); c.fillStyle = p.col; c.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2); c.lineWidth = 1.5; c.strokeStyle = OUT; c.strokeRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2); c.restore(); break;
        case 'leaf': c.save(); c.translate(p.x, y); c.rotate(p.rot); c.beginPath(); c.ellipse(0, 0, p.size * 1.5, p.size * 0.7, 0, 0, TAU); c.fillStyle = p.col; c.fill(); c.restore(); break;
        case 'feather': c.save(); c.translate(p.x, y); c.rotate(p.rot); c.beginPath(); c.ellipse(0, 0, p.size * 1.6, p.size * 0.55, 0, 0, TAU); c.fillStyle = p.col; c.fill(); c.lineWidth = 1.4; c.strokeStyle = OUT; c.stroke(); c.restore(); break;
        case 'smoke': {
          const r = p.size * (1 + p.grow * (1 - k)), g = c.createRadialGradient(p.x, y, 0, p.x, y, r);
          g.addColorStop(0, p.col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.beginPath(); c.arc(p.x, y, r, 0, TAU); c.fill(); break;
        }
        case 'fire': {
          const r = p.size * (0.5 + 0.8 * k), g = c.createRadialGradient(p.x, y, 0, p.x, y, r);
          g.addColorStop(0, '#fff3b0'); g.addColorStop(0.35, '#ffb703'); g.addColorStop(0.75, '#e8451e'); g.addColorStop(1, 'rgba(120,20,10,0)');
          c.fillStyle = g; c.beginPath(); c.arc(p.x, y, r, 0, TAU); c.fill(); break;
        }
        case 'flash': {
          const r = p.size * (0.6 + 0.6 * (1 - k)), g = c.createRadialGradient(p.x, y, 0, p.x, y, r);
          g.addColorStop(0, 'rgba(255,255,230,0.95)'); g.addColorStop(0.5, 'rgba(255,214,90,0.55)'); g.addColorStop(1, 'rgba(255,160,40,0)');
          c.fillStyle = g; c.beginPath(); c.arc(p.x, y, r, 0, TAU); c.fill(); break;
        }
        case 'ring': c.beginPath(); c.arc(p.x, y, p.size * (1 + p.grow * (1 - k)), 0, TAU); c.lineWidth = 1 + (p.lw || 4) * k; c.strokeStyle = p.col; c.stroke(); break;
        case 'spark': { const l = p.size; c.beginPath(); c.moveTo(p.x, y); c.lineTo(p.x - p.vx * 0.04 * l / 6, y + p.vz * 0.04 * -1 - p.vy * 0.04 * l / 6); c.lineWidth = 2.6; c.strokeStyle = p.col; c.stroke(); break; }
        case 'drop': c.fillStyle = p.col; c.beginPath(); c.ellipse(p.x, y, p.size * 0.8, p.size, 0, 0, TAU); c.fill(); break;
        case 'bubble': c.beginPath(); c.arc(p.x, y, p.size, 0, TAU); c.lineWidth = 1.8; c.strokeStyle = p.col; c.stroke(); break;
      }
    }
    c.globalAlpha = 1;
  }

  /* ---------- Händelser -> effekter ---------- */
  pl(id) { const v = this.lastView; return v ? v.players.find(p => p.id === id) : null; }

  onEvents(evs) {
    const FR = ['#2442a8', '#ffffff', '#d62839'];
    for (const e of evs) {
      switch (e[0]) {
        case 'swing': {
          const w = e[2], x = e[3], y = e[4], a = e[5] / 100;
          if (w === 'baguette') this.burst(x + Math.cos(a) * 70, y + Math.sin(a) * 70, 3, () => ({ kind: 'crumb', x: x + Math.cos(a) * 70, y: y + Math.sin(a) * 70, z: 30, vx: Math.cos(a) * 120 + (Math.random() - 0.5) * 120, vy: Math.sin(a) * 120 + (Math.random() - 0.5) * 120, vz: 90, g: 400, size: 3.5, col: '#e3a95c', life: 0.5, vr: 8 }));
          if (w === 'poireau') this.burst(x, y, 3, () => ({ kind: 'leaf', x: x + Math.cos(a) * 90, y: y + Math.sin(a) * 90, z: 40, vx: (Math.random() - 0.5) * 140, vy: (Math.random() - 0.5) * 140, vz: 70, g: 300, size: 4, col: '#6fbe55', life: 0.6, vr: 6 }));
          break;
        }
        case 'squeak': {
          const x = e[2], y = e[3];
          this.spawn({ kind: 'ring', x, y, size: 20, grow: 10, col: 'rgba(255,230,90,0.9)', life: 0.45, lw: 6 });
          this.spawn({ kind: 'ring', x, y, size: 10, grow: 6, col: 'rgba(255,255,255,0.8)', life: 0.35, lw: 4 });
          this.text(x, y - 90, 'COUAC!', '#ffd23f', 24);
          break;
        }
        case 'shoot': {
          const w = e[2], x = e[3], y = e[4], a = e[5] / 100, mx = x + Math.cos(a) * 44, my = y + Math.sin(a) * 44;
          if (w === 'pigeon') this.burst(mx, my, 4, () => ({ kind: 'feather', x: mx, y: my, z: 30, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, vz: 60, g: 140, size: 4, col: '#c4cde0', life: 0.9, vr: 5, drag: 1.5 }));
          else if (w === 'feu') { this.burst(mx, my, 6, () => ({ kind: 'spark', x: mx, y: my, z: 26, vx: Math.cos(a) * 220 + (Math.random() - 0.5) * 200, vy: Math.sin(a) * 220 + (Math.random() - 0.5) * 200, vz: 60, g: 200, size: 6, col: '#ffd23f', life: 0.35 })); this.spawn({ kind: 'smoke', x: mx, y: my, z: 26, size: 22, grow: 1.2, col: 'rgba(230,230,230,0.7)', life: 0.6, vz: 20 }); }
          else if (w === 'patate' || w === 'petanque') this.spawn({ kind: 'smoke', x: mx, y: my, z: 24, size: 14, grow: 1.5, col: 'rgba(235,225,205,0.8)', life: 0.35 });
          else if (w === 'epoisses') this.burst(mx, my, 3, () => ({ kind: 'dot', x: mx, y: my, z: 28, vx: Math.cos(a) * 80 + (Math.random() - 0.5) * 90, vy: Math.sin(a) * 80 + (Math.random() - 0.5) * 90, vz: 70, g: 300, size: 4, col: '#b6d44e', life: 0.5 }));
          break;
        }
        case 'tackle': {
          const x = e[2], y = e[3], a = e[4] / 100;
          this.burst(x, y, 7, () => ({ kind: 'smoke', x, y, z: 4, vx: -Math.cos(a) * 80 + (Math.random() - 0.5) * 80, vy: -Math.sin(a) * 80 + (Math.random() - 0.5) * 80, size: 14, grow: 1.3, col: 'rgba(240,232,210,0.75)', life: 0.45 }));
          break;
        }
        case 'ko': {
          const vid = e[1], by = e[2], cause = e[3], x = e[4], y = e[5], kx = e[6] / 100, ky = e[7] / 100;
          const st = this.pst.get(vid); if (st) st.koDir = kx >= 0 ? 1 : -1;
          this.spawn({ kind: 'ring', x, y, size: 16, grow: 5, col: 'rgba(255,255,255,0.95)', life: 0.35, lw: 7 });
          this.burst(x, y, 6, i => { const a = i / 6 * TAU + Math.random() * 0.6; return { kind: 'star', x, y, z: 45, vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, vz: 120, g: 400, size: 7, col: i & 1 ? '#ffe066' : '#fff', life: 0.55, vr: 8, drag: 1.2 }; });
          const col = { baguette: '#e3a95c', patate: '#a0713a', poireau: '#6fbe55', coq: '#ffd23f', petanque: '#b9c2d0', poele: '#c8cdd6', souffleur: '#c8e69a' }[cause];
          const wind = cause === 'souffleur';
          if (col) this.burst(x, y, wind ? 16 : 7, () => ({ kind: cause === 'coq' ? 'feather' : cause === 'poireau' || wind ? 'leaf' : 'crumb', x, y, z: 40, vx: kx * (wind ? 520 : 120) + (Math.random() - 0.5) * (wind ? 200 : 260), vy: ky * (wind ? 520 : 120) + (Math.random() - 0.5) * (wind ? 200 : 260), vz: 140, g: 420, size: 4.5, col, life: 0.8, vr: 9 }));
          const ono = (WEAPONS[cause] && WEAPONS[cause].ono) || CAUSE_ONO[cause];
          if (ono) this.text(x, y - 72, ono, (WEAPONS[cause] && WEAPONS[cause].col) || '#fff', 28);
          this.addShake(x, y, vid === this.me || by === this.me ? 9 : 4);
          break;
        }
        case 'pick': {
          const p = this.pl(e[1]); if (!p) break;
          this.spawn({ kind: 'ring', x: p.x, y: p.y, size: 20, grow: 7, col: 'rgba(255,214,64,0.95)', life: 0.6, lw: 8 });
          this.burst(p.x, p.y, 16, i => { const a = Math.random() * TAU, s = 120 + Math.random() * 200; return { kind: 'dot', x: p.x, y: p.y, z: 60, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 160 + Math.random() * 120, g: 480, size: 4.2, col: FR[i % 3], life: 0.9 + Math.random() * 0.4, bounce: 0.3 }; });
          this.text(p.x, p.y - 150, 'FROMAGE!', '#ffd23f', 30);
          break;
        }
        case 'drop': {
          const c = this.lastView && this.lastView.cheese; if (!c) break;
          this.burst(c.x, c.y, 8, () => ({ kind: 'crumb', x: c.x, y: c.y, z: 30, vx: (Math.random() - 0.5) * 260, vy: (Math.random() - 0.5) * 260, vz: 180, g: 520, size: 4, col: '#ffd23f', life: 0.7, vr: 9, bounce: 0.35 }));
          break;
        }
        case 'boom': {
          const kind = e[1], x = e[2], y = e[3], r = e[4];
          this.spawn({ kind: 'flash', x, y, z: 30, size: r * 1.15, life: 0.22, fade: false });
          this.spawn({ kind: 'ring', x, y, size: r * 0.3, grow: 2.6, col: 'rgba(255,255,255,0.9)', life: 0.45, lw: 10 });
          if (kind === 'feu') {
            this.burst(x, y, 12, () => { const a = Math.random() * TAU, d = Math.random() * r * 0.6; return { kind: 'fire', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, z: 20, vz: 60 + Math.random() * 90, size: 40 + Math.random() * 30, life: 0.5 + Math.random() * 0.4 }; });
            this.burst(x, y, 9, () => { const a = Math.random() * TAU; return { kind: 'smoke', x: x + Math.cos(a) * r * 0.4, y: y + Math.sin(a) * r * 0.4, z: 30, vz: 50, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30, size: 36, grow: 1.4, col: 'rgba(70,70,80,0.55)', life: 1.1 + Math.random() * 0.6, fade: true }; });
            this.burst(x, y, 22, i => { const a = Math.random() * TAU, s = 160 + Math.random() * 300; return { kind: 'star', x, y, z: 50, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 180 + Math.random() * 160, g: 420, size: 7 + Math.random() * 4, col: FR[i % 3], life: 1.0 + Math.random() * 0.5, vr: 7, drag: 1.4 }; });
            this.text(x, y - 90, 'BOUM!', '#ff8a3d', 44);
            this.addShake(x, y, 16);
          } else {
            this.burst(x, y, 20, () => { const a = Math.random() * TAU, s = 120 + Math.random() * 260; return { kind: 'dot', x, y, z: 30, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 160 + Math.random() * 160, g: 460, size: 4 + Math.random() * 3, col: Math.random() < 0.5 ? '#fff6d0' : '#f5d76e', life: 0.8 + Math.random() * 0.4 }; });
            this.spawn({ kind: 'crumb', x, y, z: 30, vx: 40, vy: -60, vz: 380, g: 620, size: 6, col: '#d9b27c', life: 1.1, vr: 14, bounce: 0.4 });
            this.addShake(x, y, 9);
          }
          break;
        }
        case 'splash': {
          const x = e[1], y = e[2];
          this.spawn({ kind: 'ring', x, y, size: 12, grow: 5, col: 'rgba(255,255,255,0.9)', life: 0.6, lw: 6 });
          this.burst(x, y, 9, () => { const a = Math.random() * TAU, s = 40 + Math.random() * 110; return { kind: 'drop', x, y, z: 10, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 150 + Math.random() * 130, g: 520, size: 4, col: '#e4fbff', life: 0.7 }; });
          break;
        }
        case 'respawn': {
          const x = e[2], y = e[3];
          this.spawn({ kind: 'ring', x, y, size: 20, grow: 4, col: 'rgba(255,255,255,0.9)', life: 0.6, lw: 6 });
          this.burst(x, y, 8, i => { const a = i / 8 * TAU; return { kind: 'star', x, y, z: 10, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, vz: 100, g: 100, size: 5, col: '#fff', life: 0.7, vr: 5 }; });
          if (e[1] === this.me) this.snap = true;
          break;
        }
        case 'clang': this.burst(e[1], e[2], 6, () => ({ kind: 'spark', x: e[1], y: e[2], z: 30, vx: (Math.random() - 0.5) * 380, vy: (Math.random() - 0.5) * 380, vz: 120, g: 300, size: 6, col: '#fff1a8', life: 0.3 })); this.text(e[1], e[2] - 50, 'CLONG!', '#d9dee8', 22); break;
        case 'boing': this.spawn({ kind: 'ring', x: e[1], y: e[2], size: 30, grow: 3, col: 'rgba(76,201,240,0.95)', life: 0.5, lw: 7 }); this.text(e[1], e[2] - 40, 'BOING!', '#4cc9f0', 28); break;
        case 'stink': this.burst(e[1], e[2], 10, () => { const a = Math.random() * TAU, s = 40 + Math.random() * 120; return { kind: 'smoke', x: e[1], y: e[2], z: 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 30, size: 30, grow: 1.5, col: 'rgba(150,200,50,0.6)', life: 1.1 }; }); this.text(e[1], e[2] - 70, 'PUANT!', '#b6d44e', 28); break;
        case 'land': this.burst(e[2], e[3], 6, () => ({ kind: 'smoke', x: e[2], y: e[3], z: 2, vx: (Math.random() - 0.5) * 120, vy: (Math.random() - 0.5) * 120, size: 12, grow: 1.4, col: 'rgba(240,232,210,0.7)', life: 0.4 })); break;
        case 'crash': {
          const x = e[2], y = e[3], type = e[4], big = type === 'house' || type === 'tower' || type === 'carousel', n = big ? 22 : 12;
          const cols = { house: ['#c85a3a', '#e8d6b0', '#a8473a'], tower: ['#6b5a4a', '#8a7762', '#4a3e34'], tree: ['#4b9a38', '#64b84c', '#7a4c2a'], barrel: ['#a8693a', '#c58a52', '#4a4f57'], cafe: ['#d62839', '#fff', '#3a3a44'], stall: ['#d62839', '#fff', '#b98a56', '#f2b81f'], column: ['#2f8f5b', '#fdf1c4', '#d62839'], carousel: ['#d62839', '#fff', '#f2c230', '#2442a8'], kiosk: ['#2d6a4f', '#8a5a34', '#fff4d6'] }[type] || ['#aaa'];
          this.burst(x, y, n, i => { const a = Math.random() * TAU, s = 80 + Math.random() * (big ? 320 : 220); return { kind: type === 'tree' ? 'leaf' : 'crumb', x, y, z: 30, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 140 + Math.random() * 220, g: 560, size: big ? 7 : 5, col: cols[i % cols.length], life: 1.0 + Math.random() * 0.5, vr: 8, bounce: 0.35 }; });
          this.burst(x, y, big ? 8 : 4, () => ({ kind: 'smoke', x: x + (Math.random() - 0.5) * 60, y: y + (Math.random() - 0.5) * 40, z: 20, vz: 40, size: big ? 44 : 26, grow: 1.4, col: 'rgba(190,175,150,0.6)', life: 1.0 }));
          this.text(x, y - (big ? 100 : 60), type === 'tree' ? 'CRAC!' : type === 'barrel' ? 'BANG!' : 'CRASH!', '#e8d9a8', big ? 36 : 26);
          this.addShake(x, y, big ? 12 : 5);
          break;
        }
        case 'dent': { this.dent.set(e[1], this.t); this.burst(e[2], e[3], 3, () => ({ kind: 'crumb', x: e[2], y: e[3], z: 30, vx: (Math.random() - 0.5) * 160, vy: (Math.random() - 0.5) * 160, vz: 100, g: 460, size: 3, col: '#d8c8a0', life: 0.5, vr: 8 })); break; }
        case 'cheeseReset': this.spawn({ kind: 'ring', x: 0, y: 0, size: 40, grow: 5, col: 'rgba(255,214,64,0.9)', life: 0.9, lw: 10 }); this.text(0, -70, 'OSTEN ÄR TILLBAKA!', '#ffd23f', 30); break;
        case 'overheat': { const p = this.pl(e[1]); if (p) { this.burst(p.x, p.y, 8, () => ({ kind: 'smoke', x: p.x, y: p.y, z: 30, vx: (Math.random() - 0.5) * 60, vy: (Math.random() - 0.5) * 60, vz: 60, size: 16, grow: 1.5, col: 'rgba(230,230,230,0.7)', life: 0.9 })); this.text(p.x, p.y - 90, 'PFFFT!', '#ff9f1c', 26); } break; }
        case 'parisduva': this.text(this.cam.x, this.cam.y - 120, 'PARISDUVAN KOMMER!', '#c4cde0', 34); break;
        case 'place': this.spawn({ kind: 'ring', x: e[3], y: e[4], size: 14, grow: 3, col: 'rgba(255,255,255,0.8)', life: 0.4, lw: 5 }); break;
      }
    }
  }

  /* ---------- Löpande effekter (damm, bubblor, vind) ---------- */
  updateStates(view, dt) {
    const map = this.map;
    for (const p of view.players) {
      let s = this.pst.get(p.id);
      if (!s) { s = { phase: Math.random() * 6, dust: 0, ring: 0, smoke: 0, leaf: 0, koDir: 1, sparkle: 0, bub: 0 }; this.pst.set(p.id, s); }
      const sp = Math.hypot(p.vx, p.vy);
      s.phase += sp * dt * 0.052;
      if (p.st !== 0) continue;
      const sea = !map.onLand(p.x, p.y);
      s.dust -= dt; s.ring -= dt; s.smoke -= dt; s.leaf -= dt; s.sparkle -= dt;
      if (sea) {
        if (s.ring <= 0 && this.inView(p.x, p.y, 100)) { s.ring = 0.3; this.spawn({ kind: 'ring', x: p.x, y: p.y + 4, size: 12, grow: 2.6, col: 'rgba(255,255,255,0.85)', life: 0.7, lw: 4 }); }
      } else if (sp > 230 && s.dust <= 0 && this.inView(p.x, p.y, 100)) {
        s.dust = p.dash ? 0.03 : 0.16;
        this.spawn({ kind: 'smoke', x: p.x - p.vx * 0.04, y: p.y + 4, z: 2, vx: -p.vx * 0.1, vy: -p.vy * 0.1, size: p.dash ? 15 : 8, grow: 1.2, col: 'rgba(240,232,210,0.7)', life: 0.4 });
      }
      if (p.blow && s.leaf <= 0 && this.inView(p.x, p.y, 200)) {
        s.leaf = 0.025;
        const half = WEAPONS.souffleur.half, a = p.a + (Math.random() - 0.5) * half * 1.6, sp2 = 380 + Math.random() * 260;
        this.spawn({ kind: Math.random() < 0.5 ? 'leaf' : 'dot', x: p.x + Math.cos(p.a) * 40, y: p.y + Math.sin(p.a) * 40, z: 26 + Math.random() * 30, vx: Math.cos(a) * sp2, vy: Math.sin(a) * sp2, vz: 20, size: 3.2, col: Math.random() < 0.5 ? '#c8e69a' : '#ffffff', life: 0.55, vr: 10, a: 0.8 });
      }
      if (p.over && s.smoke <= 0 && this.inView(p.x, p.y, 200)) { s.smoke = 0.12; this.spawn({ kind: 'smoke', x: p.x + Math.cos(p.a) * 40, y: p.y + Math.sin(p.a) * 40, z: 30, vz: 50, size: 12, grow: 1.5, col: 'rgba(225,225,225,0.7)', life: 0.8 }); }
      if (p.carry && s.sparkle <= 0 && this.inView(p.x, p.y, 200)) { s.sparkle = 0.12; this.spawn({ kind: 'star', x: p.x + (Math.random() - 0.5) * 60, y: p.y + (Math.random() - 0.5) * 20, z: 40 + Math.random() * 60, vz: 30, size: 4.5, col: '#ffe066', life: 0.7, vr: 4 }); }
    }
    // projektiler: födelsetid för kast-bågar
    const seen = new Set();
    for (const b of view.proj) { seen.add(b.id); if (!this.born.has(b.id)) this.born.set(b.id, this.t); }
    if (this.born.size > view.proj.length + 20) for (const id of this.born.keys()) if (!seen.has(id)) this.born.delete(id);
  }

  /* ---------- Hav ---------- */
  drawSea(c) {
    const t = this.t, cam = this.cam, z = cam.z, map = this.map, cr = map.coastR;
    const hw = this.W / 2 / z + 60, hh = this.H / 2 / z + 60, step = 150;
    const x0 = Math.floor((cam.x - hw) / step), x1 = Math.floor((cam.x + hw) / step), y0 = Math.floor((cam.y - hh) / step), y1 = Math.floor((cam.y + hh) / step);
    c.lineCap = 'round';
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
      const h1 = hash2(cx, cy), h2 = hash2(cy + 77, cx - 13);
      if (h1 < 0.3) continue;
      const x = cx * step + h1 * step, y = cy * step + h2 * step;
      if (Math.hypot(x, y) < cr(Math.atan2(y, x)) + 40) continue;
      const a = 0.12 + 0.28 * (0.5 + 0.5 * Math.sin(t * 1.1 + h2 * 6.28));
      c.strokeStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')'; c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, 16 + h1 * 16, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
      c.beginPath(); c.arc(x + 20, y + 14, 10 + h2 * 8, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    }
    if (map.kind === 'place') {   // Seine: mörk skugga under kajmuren, lugna ljusa strömdrag
      coastPath(c, 90, 5, t, cr); c.fillStyle = 'rgba(20,70,66,0.20)'; c.fill();
      coastPath(c, 50, 4, t + 1, cr); c.fillStyle = 'rgba(20,70,66,0.20)'; c.fill();
      coastPath(c, 18, 2, t + 2, cr); c.fillStyle = 'rgba(12,50,48,0.28)'; c.fill();
      c.lineWidth = 3;
      coastPath(c, 132 + Math.sin(t * 0.8) * 6, 6, t * 0.6, cr); c.strokeStyle = 'rgba(255,255,255,0.22)'; c.stroke();
      coastPath(c, 74 + Math.sin(t * 1.1) * 4, 5, t * 0.6 + 2, cr); c.strokeStyle = 'rgba(255,255,255,0.32)'; c.stroke();
      coastPath(c, 30 + Math.sin(t * 1.3) * 3, 3, t * 0.7 + 4, cr); c.strokeStyle = 'rgba(255,255,255,0.45)'; c.stroke();
    } else {
      coastPath(c, 130, 7, t); c.fillStyle = 'rgba(112,208,226,0.32)'; c.fill();
      coastPath(c, 74, 6, t + 1); c.fillStyle = 'rgba(138,224,236,0.45)'; c.fill();
      coastPath(c, 32 + Math.sin(t * 1.2) * 5, 5, t + 2); c.fillStyle = 'rgba(190,243,246,0.78)'; c.fill();
      coastPath(c, 8 + Math.sin(t * 1.7) * 3.5, 3, t + 3); c.fillStyle = 'rgba(255,255,255,0.96)'; c.fill();
    }
  }

  /* ---------- Hela bilden ---------- */
  frame(view, dt, o) {
    o = o || {};
    dt = Math.min(dt, 0.1);
    const c = this.c, W = this.W, H = this.H, dpr = this.dpr, map = this.map;
    this.t += dt;
    const t = this.t;
    if (view) this.lastView = view;
    if (view && map) this.updateStates(view, dt);
    this.updateCamera(view, dt);
    const real = view; view = view || this.idleView;
    this.updateParts(dt);
    this.shake *= Math.exp(-6 * dt); if (this.shake < 0.2) this.shake = 0;
    const shx = (Math.random() - 0.5) * 2 * this.shake, shy = (Math.random() - 0.5) * 2 * this.shake;

    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.seaGrad) { const tc = SEA_THEME[map ? map.kind : 'ile'] || SEA_THEME.ile, g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, tc[0]); g.addColorStop(1, tc[1]); this.seaGrad = g; }
    c.fillStyle = this.seaGrad; c.fillRect(0, 0, W, H);
    if (!map || !this.ground) return;

    const z = this.cam.z;
    c.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - this.cam.x * z + shx), dpr * (H / 2 - this.cam.y * z + shy));
    this.drawSea(c);
    const R = GROUND_R;
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(this.ground, -R, -R, R * 2, R * 2);

    if (view) {
      this.drawGroundLayer(c, view, o);
      this.drawEntities(c, view, o);
      this.drawTopLayer(c, view);
    }
    this.drawParts(c);

    // ---- skärmrymd ----
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.vig) {
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      g.addColorStop(0, 'rgba(8,16,48,0)'); g.addColorStop(1, 'rgba(8,16,48,0.34)'); this.vig = g;
    }
    c.fillStyle = this.vig; c.fillRect(0, 0, W, H);
    if (real) {
      this.drawNameTags(c, view);
      this.drawTexts(c);
      if (!o.hideHud) { this.drawEdgeArrow(c, view); this.drawMinimap(c, view); }
      if (o.reticle && this.mouse.in) this.drawReticle(c);
    }
  }

  /* ---------- Marknivå: spillror, kuddar, glöd, siktmarkeringar ---------- */
  drawGroundLayer(c, view, o) {
    const map = this.map, t = this.t;
    for (const ob of map.obstacles) {
      if (!view.dead.has(ob.id) || !this.inView(ob.x, ob.y, 160)) continue;
      drawRubble(c, ob);
    }
    // osten på marken: glöd
    const ch = view.cheese;
    if (ch.st === 'ground' && ch.air <= 0 && view.phase !== 'reveal' || ch.st === 'ground' && view.phase === 'reveal') {
      const pulse = 0.5 + 0.5 * Math.sin(t * 4), g = c.createRadialGradient(ch.x, ch.y, 8, ch.x, ch.y, 74 + pulse * 10);
      g.addColorStop(0, 'rgba(255,224,90,0.55)'); g.addColorStop(1, 'rgba(255,224,90,0)');
      c.fillStyle = g; c.beginPath(); c.arc(ch.x, ch.y, 84, 0, TAU); c.fill();
    }
    // kuddar och moln-botten
    for (const a of view.areas) {
      if (!this.inView(a.x, a.y, 260)) continue;
      if (a.k === 'pad') drawArea(c, a, t);
      else if (a.k === 'mine') { c.beginPath(); c.arc(a.x, a.y, a.r, 0, TAU); c.setLineDash([5, 7]); c.strokeStyle = a.f >= 1 ? 'rgba(214,40,57,0.5)' : 'rgba(255,255,255,0.35)'; c.lineWidth = 2.5; c.stroke(); c.setLineDash([]); }
    }
    // lövblåsarens vindkon (syns för alla som blåser)
    const Wb = WEAPONS.souffleur;
    for (const p of view.players) {
      if (!p.blow || p.st !== 0 || !this.inView(p.x, p.y, Wb.range + 60)) continue;
      c.save(); c.translate(p.x, p.y); c.rotate(p.a);
      const g = c.createRadialGradient(0, 0, 20, 0, 0, Wb.range);
      g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(0.6, 'rgba(255,255,255,0.3)'); g.addColorStop(1, 'rgba(255,255,255,0.06)');
      c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, Wb.range, -Wb.half, Wb.half); c.closePath(); c.fill();
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 3; c.setLineDash([14, 10]); c.lineDashOffset = -t * 120;
      c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(-Wb.half) * Wb.range, Math.sin(-Wb.half) * Wb.range);
      c.moveTo(0, 0); c.lineTo(Math.cos(Wb.half) * Wb.range, Math.sin(Wb.half) * Wb.range); c.stroke();
      c.setLineDash([]); c.lineDashOffset = 0;
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 5;
      for (let i = 0; i < 4; i++) {
        const ph = ((t * 1.1 + i * 0.25) % 1), d = 50 + ph * 230, w = d * 0.34;
        c.globalAlpha = 1 - ph * 0.85;
        c.beginPath(); c.moveTo(d - 12, -w); c.lineTo(d + 12, 0); c.lineTo(d - 12, w); c.stroke();
      }
      c.globalAlpha = 1;
      c.restore();
    }
    // egna siktmarkeringar
    const me = this.me >= 0 ? view.players.find(p => p.id === this.me) : null;
    const meta = me ? this.meta.get(me.id) : null;
    if (me && meta && me.st === 0 && o.aim && view.phase === 'play') {
      const W = WEAPONS[meta.weapon], a = o.aim.a, ad = o.aim.ad;
      if (W.kind === 'rocket' || W.kind === 'can') {
        const d = clamp(ad, W.rangeMin, W.rangeMax), tx = me.x + Math.cos(a) * d, ty = me.y + Math.sin(a) * d, rr = W.kind === 'rocket' ? W.boomR : W.cloudR;
        // målmarkeringen ritas mörk med tunn ljus kant, så den syns på både gräs, sten och vatten
        c.beginPath(); c.arc(tx, ty, rr, 0, TAU); c.fillStyle = W.kind === 'rocket' ? 'rgba(255,90,60,0.12)' : 'rgba(160,210,60,0.14)'; c.fill();
        for (const [col, w] of [['rgba(255,255,255,0.8)', 6], ['rgba(0,0,0,0.85)', 3]]) {
          c.strokeStyle = col; c.lineWidth = w;
          c.beginPath(); c.moveTo(me.x + Math.cos(a) * 40, me.y + Math.sin(a) * 40); c.lineTo(tx, ty); c.setLineDash([4, 10]); c.stroke();
          c.beginPath(); c.arc(tx, ty, rr, 0, TAU); c.setLineDash([12, 9]); c.lineDashOffset = -t * 20; c.stroke();
          c.setLineDash([]); c.lineDashOffset = 0;
        }
        c.beginPath(); c.arc(tx, ty, 6.5, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.85)'; c.fill();
        c.beginPath(); c.arc(tx, ty, 4, 0, TAU); c.fillStyle = '#000'; c.fill();
      } else if (W.kind === 'pad') {
        const gx = me.x + Math.cos(a) * 80, gy = me.y + Math.sin(a) * 80;
        c.globalAlpha = 0.4; drawArea(c, { k: 'pad', x: gx, y: gy, r: W.padR, f: 1, a }, t); c.globalAlpha = 1;
      }
    }
  }

  /* ---------- Sorterade ting ---------- */
  drawEntities(c, view, o) {
    const map = this.map, t = this.t, items = this._items;
    items.length = 0;
    for (const ob of map.obstacles) {
      if (view.dead.has(ob.id) || !this.inView(ob.x, ob.y, 220)) continue;
      items.push({ y: obstacleBase(ob), k: 0, o: ob });
    }
    for (const f of this.flags) if (this.inView(f.x, f.y, 120)) items.push({ y: f.y + 3, k: 1, o: f });
    for (const p of view.players) {
      const s = this.pst.get(p.id);
      if (p.st === 1 && (CFG.respawnSec - p.e1) > 2.0) continue;
      if (!this.inView(p.x, p.y, 200)) continue;
      items.push({ y: p.y, k: 2, o: p, s });
    }
    const ch = view.cheese;
    if (ch.st !== 'carried' && this.inView(ch.x, ch.y, 120)) items.push({ y: ch.y + 8, k: 3, o: ch });
    for (const b of view.proj) if (this.inView(b.x, b.y, 150)) items.push({ y: b.y, k: 4, o: b });
    for (const a of view.areas) if ((a.k === 'can' || a.k === 'mine') && this.inView(a.x, a.y, 150)) items.push({ y: a.y, k: 5, o: a });
    items.sort((a, b) => a.y - b.y);
    for (const it of items) {
      switch (it.k) {
        case 0: this.drawOb(c, it.o); break;
        case 1: drawFlagPole(c, it.o.x, it.o.y, t); break;
        case 2: this.drawPlayer(c, it.o, it.s, view, o); break;
        case 3: this.drawCheeseItem(c, it.o, view); break;
        case 4: this.drawProj(c, it.o); break;
        case 5: drawArea(c, it.o, t); break;
      }
    }
  }

  drawOb(c, ob) {
    const key = ob.t === 'house' ? 'house:' + ob.v : ob.t === 'stall' ? 'stall:' + ob.v : ob.t;
    const sp = this.sprites[key]; if (!sp) return;
    const t = this.t, dt = this.dent.get(ob.id);
    let dx = 0, sh = 0;
    if (dt !== undefined) { const age = t - dt; if (age < 0.3) dx = Math.sin(age * 60) * 4 * (1 - age / 0.3); else this.dent.delete(ob.id); }
    if (ob.t === 'tree') sh = Math.sin(t * 1.3 + ob.x * 0.01) * 0.02;
    c.save(); c.translate(ob.x + dx, ob.y);
    if (sh) c.transform(1, 0, sh, 1, 0, 0);
    c.drawImage(sp.cv, -sp.ox, -sp.oy, sp.w, sp.h);
    c.restore();
  }

  drawCheeseItem(c, ch, view) {
    const t = this.t;
    if (ch.st === 'sea') {
      const bob = Math.sin(t * 3) * 2.5;
      c.beginPath(); c.arc(ch.x, ch.y + 6, 30 + Math.sin(t * 2) * 3, 0, TAU); c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 3; c.stroke();
      c.save(); c.beginPath(); c.rect(ch.x - 50, ch.y - 90, 100, 90 + 8); c.clip();
      drawCheese(c, ch.x, ch.y + 6 + bob, ch.rot, 0, 1); c.restore();
      return;
    }
    const lift = ch.air > 0 ? Math.sin(Math.PI * clamp(1 - ch.air / CFG.cheeseAir, 0, 1)) * 34 : 0;
    c.fillStyle = 'rgba(30,20,10,0.28)'; ell(c, ch.x, ch.y + 12, 29 - lift * 0.1, 12); c.fill();
    drawCheese(c, ch.x, ch.y, ch.rot, lift, 1);
  }

  drawProj(c, b) {
    const t = this.t;
    let lift = 0;
    if (b.k === 'rocket' || b.k === 'can') {
      const dur = b.k === 'rocket' ? WEAPONS.feu.fuse : WEAPONS.epoisses.fly, age = t - (this.born.get(b.id) || t);
      lift = Math.sin(Math.PI * clamp(age / dur, 0, 1)) * (b.k === 'rocket' ? 70 : 90);
    }
    drawProjectile(c, b, t, lift);
    if (b.k === 'rocket') {
      c.globalAlpha = 0.8; c.fillStyle = '#ffd23f';
      c.beginPath(); c.arc(b.x - Math.cos(Math.atan2(b.vy, b.vx)) * 32, b.y - lift - 12 - Math.sin(Math.atan2(b.vy, b.vx)) * 32, 4 + Math.random() * 3, 0, TAU); c.fill(); c.globalAlpha = 1;
      if (Math.random() < 0.5) this.spawn({ kind: 'smoke', x: b.x, y: b.y, z: lift + 12, size: 10, grow: 1.2, col: 'rgba(235,235,235,0.6)', life: 0.5 });
    }
  }

  drawPlayer(c, p, s, view, o) {
    const meta = this.meta.get(p.id) || { skin: p.id % SKINS.length, weapon: null };
    const t = this.t, map = this.map;
    const sea = !map.onLand(p.x, p.y);
    const d = {
      x: p.x, y: p.y, skin: meta.skin, a: p.a, vx: p.vx, vy: p.vy, phase: s ? s.phase : 0, t, id: p.id,
      carry: p.carry, guard: p.guard, weapon: meta.weapon, sw: p.sw, daze: p.daze, stink: p.stink, blow: p.blow, dash: p.dash, over: p.over,
      ko: false, lift: 0, alpha: 1, spin: 0, gale: 0, galeA: null
    };
    if (p.gale > 0.03 && p.st === 0) {   // vindmätare: luta dig mot blåsaren
      const Wb = WEAPONS.souffleur; let bd = 1e9;
      for (const q of view.players) {
        if (!q.blow || q.id === p.id || q.st !== 0) continue;
        const dd = Math.hypot(q.x - p.x, q.y - p.y);
        if (dd < bd && dd < Wb.range + 80) { bd = dd; d.galeA = q.a; }
      }
      d.gale = p.gale;
    }
    const phase = view.phase;
    if (phase === 'reveal' || phase === 'count') { d.vx = d.vy = 0; }
    let sink = 0;
    if (p.st === 1) {
      const el = CFG.respawnSec - p.e1, dir = s ? s.koDir : 1;
      d.ko = true; d.carry = false; d.vx = d.vy = 0;
      const u = clamp(el / 0.55, 0, 1);
      if (sea) { sink = clamp(el / 0.9, 0, 1); d.lift = -sink * 70; d.spin = dir * 0.5 * sink; }
      else { d.lift = 4 * 62 * u * (1 - u); const e3 = 1 - Math.pow(1 - u, 3); d.spin = dir * (TAU + Math.PI / 2) * e3; }
      d.alpha = clamp((2.0 - el) / 0.5, 0, 1);
    } else if (p.st === 2) {
      const f = clamp(p.e1, 0, 1);
      d.lift = Math.sin(Math.PI * f) * 150; d.spin = f * TAU * 2 * (s && s.koDir || 1);
    }
    const nowSea = sea && p.st !== 2;
    if (p.inv && p.st === 0) {
      c.beginPath(); c.arc(p.x, p.y - 28, 36, 0, TAU);
      c.fillStyle = 'rgba(255,255,255,' + (0.12 + 0.08 * Math.sin(t * 12)) + ')'; c.fill();
      c.setLineDash([9, 7]); c.lineDashOffset = -t * 40; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 3; c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
    }
    if (p.carry && p.st === 0) {
      const pulse = 0.5 + 0.5 * Math.sin(t * 5);
      c.beginPath(); c.ellipse(p.x, p.y + 3, 38 + pulse * 3, 15, 0, 0, TAU); c.fillStyle = 'rgba(255,214,64,0.40)'; c.fill(); c.lineWidth = 3; c.strokeStyle = 'rgba(255,200,40,0.9)'; c.stroke();
    }
    if (p.id === this.me && p.st === 0) {
      c.beginPath(); c.ellipse(p.x, p.y + 3, 33, 13, 0, 0, TAU); c.setLineDash([8, 6]); c.lineDashOffset = -t * 18; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2.5; c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
    }
    if (nowSea || (p.st === 1 && sea)) {
      c.save(); c.beginPath(); c.rect(p.x - 70, p.y - 190, 140, 190 + 7 + (p.st === 1 ? 0 : 0)); c.clip();
      drawCharacter(c, d); c.restore();
      c.beginPath(); c.ellipse(p.x, p.y + 6, 30, 11, 0, 0, TAU); c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 3; c.stroke();
      if (p.st === 1 && sink > 0.2 && Math.random() < 0.3) this.spawn({ kind: 'bubble', x: p.x + (Math.random() - 0.5) * 24, y: p.y, z: 6, vz: 50, size: 3 + Math.random() * 3, col: 'rgba(255,255,255,0.9)', life: 0.7 });
    } else drawCharacter(c, d);
  }

  /* ---------- Överlager i världen: giftmoln ---------- */
  drawTopLayer(c, view) {
    for (const a of view.areas) if (a.k === 'cloud' && this.inView(a.x, a.y, a.r + 100)) drawArea(c, a, this.t);
  }

  /* ---------- Skärmrymd ---------- */
  drawNameTags(c, view) {
    const z = this.cam.z, fs = clamp(13 * Math.max(0.9, z), 12, 17);
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '800 ' + fs + 'px system-ui, "Segoe UI", Arial, sans-serif'; c.lineJoin = 'round';
    for (const p of view.players) {
      if (p.st === 1 && CFG.respawnSec - p.e1 > 1.4) continue;
      if (!this.inView(p.x, p.y, 100)) continue;
      const meta = this.meta.get(p.id); if (!meta) continue;
      const q = this.toScreen(p.x, p.y), me = p.id === this.me;
      const y = q.y + 24 * z + fs * 0.5;
      c.lineWidth = 5; c.strokeStyle = 'rgba(30,18,12,0.85)'; c.strokeText(meta.name, q.x, y);
      c.fillStyle = me ? '#ffe066' : p.carry ? '#ffd23f' : '#fff'; c.fillText(meta.name, q.x, y);
    }
  }

  drawTexts(c) {
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    for (const tx of this.texts) {
      const q = this.toScreen(tx.x, tx.y), k = tx.age / tx.life;
      const pop = tx.age < 0.18 ? 0.4 + 0.8 * (tx.age / 0.18) : 1 + Math.max(0, 0.2 - (tx.age - 0.18)) * 1.2;
      const al = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1, rise = tx.age * 46 * this.cam.z;
      c.save(); c.translate(q.x, q.y - rise); c.rotate(tx.rot); c.scale(pop, pop); c.globalAlpha = al;
      const fs = tx.size * clamp(this.cam.z, 0.8, 1.3);
      c.font = 'italic 900 ' + fs + 'px "Arial Black", Impact, system-ui, sans-serif';
      c.lineWidth = fs * 0.28; c.strokeStyle = OUT; c.strokeText(tx.str, 0, 0);
      c.fillStyle = tx.col; c.fillText(tx.str, 0, 0); c.restore();
    }
    c.globalAlpha = 1;
  }

  drawReticle(c) {
    const x = this.mouse.x, y = this.mouse.y;
    // svart sikte med tunn ljus kant (syns på gräs, kullersten och mörkt vatten)
    c.save(); c.translate(x, y); c.lineCap = 'round';
    for (const [col, w, r] of [['rgba(255,255,255,0.9)', 6.4, 3.6], ['#000', 3.2, 2]]) {
      c.strokeStyle = col; c.fillStyle = col; c.lineWidth = w;
      c.beginPath(); c.arc(0, 0, 10, 0, TAU); c.stroke();
      c.beginPath(); for (const a of [0, 1, 2, 3]) { const cx = Math.cos(a * Math.PI / 2), cy = Math.sin(a * Math.PI / 2); c.moveTo(cx * 15, cy * 15); c.lineTo(cx * 22, cy * 22); } c.stroke();
      c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
    }
    c.restore();
  }

  drawEdgeArrow(c, view) {
    const ch = view.cheese;
    if (view.phase === 'reveal') return;
    const q = this.toScreen(ch.x, ch.y), W = this.W, H = this.H, m = 46;
    if (q.x > m && q.x < W - m && q.y > m + 30 && q.y < H - m) return;
    const dx = q.x - W / 2, dy = q.y - H / 2, l = Math.hypot(dx, dy) || 1;
    const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-3), (H / 2 - m - 30) / Math.abs(dy || 1e-3));
    const px = W / 2 + dx * k, py = H / 2 + dy * k, a = Math.atan2(dy, dx), pulse = 1 + 0.12 * Math.sin(this.t * 7);
    c.save(); c.translate(px, py);
    c.save(); c.rotate(a); c.scale(pulse, pulse);
    c.beginPath(); c.moveTo(30, 0); c.lineTo(-6, -20); c.lineTo(2, 0); c.lineTo(-6, 20); c.closePath();
    c.fillStyle = '#ffd23f'; c.fill(); c.lineWidth = 4; c.strokeStyle = OUT; c.lineJoin = 'round'; c.stroke(); c.restore();
    drawCheese(c, -Math.cos(a) * 38, -Math.sin(a) * 38 + 8, this.t, 0, 0.65);
    c.restore();
  }

  /* ---------- Minikarta ---------- */
  buildMinimap(size) {
    const dpr = this.dpr, cv = document.createElement('canvas'); cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
    const c = cv.getContext('2d'), s = (size / 2 - 9) / 1080, map = this.map;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.beginPath(); c.arc(size / 2, size / 2, size / 2 - 1.5, 0, TAU); c.fillStyle = map.kind === 'place' ? 'rgba(40,125,115,0.82)' : 'rgba(30,110,150,0.78)'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#f6f1e4'; c.stroke();
    c.translate(size / 2, size / 2); c.scale(s, s);
    drawMapShapes(c, map, false);
    return { cv, size, s };
  }

  drawMinimap(c, view) {
    if (view.phase === 'reveal' || view.phase === 'idle') return;
    const size = Math.round(clamp(Math.min(this.W, this.H) * 0.27, 150, 232));
    if (!this.mm || this.mm.size !== size) this.mm = this.buildMinimap(size);
    const mm = this.mm, x0 = 16, y0 = this.H - size - 16, s = mm.s, t = this.t;
    c.drawImage(mm.cv, x0, y0, size, size);
    c.save(); c.translate(x0 + size / 2, y0 + size / 2); c.scale(s, s);
    const ch = view.cheese, pulse = 0.5 + 0.5 * Math.sin(t * 6);
    // ostens ring (syns lätt även när den bärs)
    const holder = ch.st === 'carried' ? view.players.find(p => p.id === ch.by) : null;
    const cx = holder ? holder.x : ch.x, cy = holder ? holder.y : ch.y;
    c.beginPath(); c.arc(cx, cy, (7 + pulse * 3) / s, 0, TAU); c.lineWidth = 3 / s; c.strokeStyle = holder && holder.id === this.me ? 'rgba(255,255,255,0.9)' : 'rgba(255,60,60,0.9)'; c.stroke();
    c.beginPath(); c.arc(cx, cy, 6.2 / s, 0, TAU); c.fillStyle = '#ffd23f'; c.fill(); c.lineWidth = 2.2 / s; c.strokeStyle = OUT; c.stroke();
    c.fillStyle = '#e6a800'; for (const [hx, hy] of [[-2, -1.5], [2, 1.2], [0.5, -3]]) { c.beginPath(); c.arc(cx + hx / s, cy + hy / s, 1.1 / s, 0, TAU); c.fill(); }
    const me = this.me >= 0 ? view.players.find(p => p.id === this.me) : null;
    if (me && me.st !== 1) {
      c.save(); c.translate(me.x, me.y); c.rotate(me.a);
      c.beginPath(); c.moveTo(9 / s, 0); c.lineTo(-6 / s, -6 / s); c.lineTo(-3 / s, 0); c.lineTo(-6 / s, 6 / s); c.closePath();
      c.fillStyle = '#fff'; c.fill(); c.lineWidth = 2.2 / s; c.strokeStyle = OUT; c.lineJoin = 'round'; c.stroke(); c.restore();
    }
    c.restore();
  }
}
