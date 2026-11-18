'use strict';
/* =====================================================================
   BOT-AI – botarna styrs via samma input-struktur (p.inp) som människor,
   så reglerna är identiska. Används för solo-spel, för att fylla rum till
   8 spelare och när en spelare tappar anslutningen.
   ===================================================================== */

/* ---------- Navigering på banor med kanaler (map.nav) ----------
   Ett rutnät över banan (NAV_CELL px per ruta). En ruta är gångbar om hela spelaren ryms på land. BFS-fält ger
   kortaste väg i rutor; botarna följer fältet och tar det längsta steg de har fri sikt till. Banor utan map.nav
   (de runda öarna) använder inte detta alls: där räcker det att gå rakt mot målet. */
const NAV_CELL = 32, NAV_MARGIN = 24;
const NDI = [1, -1, 0, 0, 1, 1, -1, -1], NDJ = [0, 0, 1, -1, 1, -1, 1, -1];

function buildNav(map) {
  const b = map.bounds, cs = NAV_CELL;
  const x0 = Math.floor(b.x0 / cs) * cs, y0 = Math.floor(b.y0 / cs) * cs;
  const w = Math.ceil((b.x1 - x0) / cs), h = Math.ceil((b.y1 - y0) / cs), n = w * h;
  const ok = new Uint8Array(n), R = NAV_MARGIN, H = R * Math.SQRT1_2;
  // gångbar = mitten och åtta punkter runt den (NAV_MARGIN ut) ligger på land. (Inte "sd < -marginal": inne på land underskattar
  // distansfunktionen djupet där en bro möter en ö, och då skulle brohuvudena se ut som avbrott i rutnätet.)
  const lnd = (x, y) => map.onLand(x, y);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const x = x0 + (i + 0.5) * cs, y = y0 + (j + 0.5) * cs;
    ok[j * w + i] = lnd(x, y) && lnd(x + R, y) && lnd(x - R, y) && lnd(x, y + R) && lnd(x, y - R) && lnd(x + H, y + H) && lnd(x - H, y + H) && lnd(x + H, y - H) && lnd(x - H, y - H) ? 1 : 0;
  }
  return { cs, x0, y0, w, h, n, ok, q: new Int32Array(n), cache: new Map() };
}
function navCell(nav, x, y) {
  const i = clamp(Math.floor((x - nav.x0) / nav.cs), 0, nav.w - 1), j = clamp(Math.floor((y - nav.y0) / nav.cs), 0, nav.h - 1);
  return j * nav.w + i;
}
function navX(nav, c) { return nav.x0 + ((c % nav.w) + 0.5) * nav.cs; }
function navY(nav, c) { return nav.y0 + (((c / nav.w) | 0) + 0.5) * nav.cs; }
/* Närmaste gångbara ruta (en ruta som redan är gångbar returneras som den är) */
function navSnap(nav, c) {
  if (nav.ok[c]) return c;
  const i0 = c % nav.w, j0 = (c / nav.w) | 0;
  for (let r = 1; r <= 6; r++) {
    let best = -1, bd = 1e9;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= nav.w || j >= nav.h || !nav.ok[j * nav.w + i]) continue;
      const d = di * di + dj * dj;
      if (d < bd) { bd = d; best = j * nav.w + i; }
    }
    if (best >= 0) return best;
  }
  return -1;
}
/* BFS (8 grannar, inga diagonaler runt hörn) från en eller flera rutor. Avstånd i rutor, -1 = ej nådd. */
function navBfs(nav, sources, maxDepth, parent) {
  const w = nav.w, h = nav.h, ok = nav.ok, q = nav.q, dist = new Int16Array(nav.n).fill(-1);
  let qh = 0, qt = 0;
  for (const s of sources) if (dist[s] < 0) { dist[s] = 0; if (parent) parent[s] = -1; q[qt++] = s; }
  while (qh < qt) {
    const c = q[qh++], d = dist[c] + 1;
    if (d > maxDepth) continue;
    const ci = c % w, cj = (c / w) | 0;
    for (let k = 0; k < 8; k++) {
      const i = ci + NDI[k], j = cj + NDJ[k];
      if (i < 0 || j < 0 || i >= w || j >= h) continue;
      const nc = j * w + i;
      if (!ok[nc] || dist[nc] >= 0) continue;
      if (k >= 4 && (!ok[cj * w + i] || !ok[j * w + ci])) continue;
      dist[nc] = d; if (parent) parent[nc] = c; q[qt++] = nc;
    }
  }
  return dist;
}
/* Avståndsfält till ett mål (banan är fast, så fälten kan sparas) */
function navField(nav, goal) {
  let f = nav.cache.get(goal);
  if (!f) { f = navBfs(nav, [goal], 9999, null); if (nav.cache.size > 160) nav.cache.clear(); nav.cache.set(goal, f); }
  return f;
}
/* Fri sikt över gångbara rutor (de första 40 px från start räknas inte: man kan stå vid kanten) */
function navLos(nav, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy), n = Math.ceil(d / 14);
  for (let k = 1; k <= n; k++) {
    if (k * d / n < 40) continue;
    if (!nav.ok[navCell(nav, x0 + dx * k / n, y0 + dy * k / n)]) return false;
  }
  return true;
}

Sim.prototype.getNav = function () { const m = this.map; return m._nav || (m._nav = buildNav(m)); };

/* Riktning (enhetsvektor) att gå för att ta sig till (gx, gy) över banans broar, eller null om man kan gå rakt. */
Sim.prototype.navDir = function (px, py, gx, gy) {
  const nav = this.getNav();
  if (navLos(nav, px, py, gx, gy)) return null;
  const goal = navSnap(nav, navCell(nav, gx, gy)); if (goal < 0) return null;
  const dist = navField(nav, goal), w = nav.w, h = nav.h;
  let c = navSnap(nav, navCell(nav, px, py));
  if (c < 0 || dist[c] <= 0) return null;
  let first = -1, far = -1;
  for (let step = 0; step < 16 && dist[c] > 0; step++) {
    const ci = c % w, cj = (c / w) | 0;
    let nb = -1, nd = dist[c];
    for (let k = 0; k < 8; k++) {
      const i = ci + NDI[k], j = cj + NDJ[k];
      if (i < 0 || j < 0 || i >= w || j >= h) continue;
      const nc = j * w + i;
      if (dist[nc] < 0 || dist[nc] >= nd) continue;
      if (k >= 4 && (!nav.ok[cj * w + i] || !nav.ok[j * w + ci])) continue;
      nd = dist[nc]; nb = nc;
    }
    if (nb < 0) break;
    c = nb;
    if (first < 0) first = c;
    if (navLos(nav, px, py, navX(nav, c), navY(nav, c))) far = c;
  }
  const t = far >= 0 ? far : first;
  if (t < 0) return null;
  const dx = navX(nav, t) - px, dy = navY(nav, t) - py, l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
};

/* Flykt för ostbäraren: välj den ruta jag hinner till före alla andra och som ligger längst från dem
   (avstånd över broarna, men skott över vattnet räknas också), och gå dit. */
Sim.prototype.navFlee = function (p, ai) {
  const nav = this.getNav(), cs = nav.cs;
  const me = navSnap(nav, navCell(nav, p.x, p.y)); if (me < 0) return null;
  const src = [], ex = [], ey = [];
  for (const q of this.players) {
    if (q === p || q.st !== 'alive') continue;
    const c = navSnap(nav, navCell(nav, q.x, q.y));
    if (c >= 0) { src.push(c); ex.push(q.x); ey.push(q.y); }
  }
  if (!src.length) return null;
  const par = new Int32Array(nav.n), M = navBfs(nav, [me], 26, par), E = navBfs(nav, src, 90, null);
  let best = -1, bs = -1e9, fb = -1, fbs = -1e9;
  for (let c = 0; c < nav.n; c++) {
    const m = M[c]; if (m < 0) continue;
    const cx = navX(nav, c), cy = navY(nav, c);
    let eu = 1e9; for (let k = 0; k < ex.length; k++) { const d = Math.hypot(cx - ex[k], cy - ey[k]); if (d < eu) eu = d; }
    const T = Math.min(E[c] < 0 ? 40 : E[c], 1.5 * eu / cs, 40);
    const sc = T - 0.45 * m + (c === ai.fleeCell ? 1.5 : 0);
    if (m < T * 0.9 && sc > bs) { bs = sc; best = c; }
    const g = T - m; if (g > fbs) { fbs = g; fb = c; }
  }
  if (best < 0) best = fb;
  if (best < 0 || best === me) { ai.fleeCell = -1; return null; }
  ai.fleeCell = best;
  const path = [];
  for (let c = best; c !== me && c >= 0; c = par[c]) path.push(c);
  path.reverse();
  let t = -1;
  for (let i = 0; i < path.length && i < 14; i++) if (navLos(nav, p.x, p.y, navX(nav, path[i]), navY(nav, path[i]))) t = path[i];
  if (t < 0) t = path[0];
  const dx = navX(nav, t) - p.x, dy = navY(nav, t) - p.y, l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
};

Sim.prototype.botInit = function (p) {
  const r = this.rng;
  p.ai = {
    think: r() * 0.2, skill: 0.45 + r() * 0.45,
    mode: 'idle', dx: 0, dy: 0, tx: 0, ty: 0, stand: 0,
    strafe: r() < 0.5 ? 1 : -1, orb: r() < 0.5 ? 1 : -1,
    react: 0, aimErr: 0, tgt: -1, mineT: 2 + r() * 5, padT: 6 + r() * 8,
    aggr: 0.3 + r() * 0.7, hunter: true, opp: r() < 0.25, roleT: r() * 6, fireWait: 0.3 + r() * 0.8, leadK: 0.6 + r() * 0.6,
    stuck: 0, lx: p.x, ly: p.y, burst: 0, bx: 0, by: 0
  };
};

Sim.prototype.botThink = function (p, dt) {
  if (!p.ai) this.botInit(p);
  const ai = p.ai, inp = p.inp;
  if (p.st !== 'alive') { inp.mx = inp.my = 0; inp.wd = false; return; }
  const W = WEAPONS[p.weapon];
  ai.think -= dt;
  if (ai.think <= 0) { ai.think = 0.12 + this.rng() * 0.12; this.botPlan(p, ai, W); }
  this.botSteer(p, ai, dt);
  this.botAct(p, ai, W, dt);
};

Sim.prototype.botPlan = function (p, ai, W) {
  const c = this.cheese, rng = this.rng;
  ai.aimErr = (1 - ai.skill) * 0.45 * (rng() * 2 - 1);
  ai.route = null;
  if (rng() < 0.12) ai.strafe = -ai.strafe;
  ai.roleT -= 0.18;
  if (ai.roleT <= 0) { ai.roleT = 5 + rng() * 6; ai.hunter = rng() < ai.aggr; ai.opp = rng() < 0.25; ai.leadK = 0.6 + rng() * 0.6; }
  if (!this.map.onLand(p.x, p.y)) {
    ai.mode = 'swim';
    if (this.map.landDir) { const w = this.map.landDir(p.x, p.y); ai.dx = w.x; ai.dy = w.y; }   // kanalbanan: närmaste land
    else { const l = Math.hypot(p.x, p.y) || 1; ai.dx = -p.x / l; ai.dy = -p.y / l; }
    return;
  }
  const carrying = c.state === 'carried' && c.carrier === p.id;
  if (carrying) {
    ai.mode = 'flee';
    if (this.map.nav) { const d = this.navFlee(p, ai); if (d) { ai.dx = d.x; ai.dy = d.y; return; } }
    let fx = 0, fy = 0;
    for (const q of this.players) {
      if (q === p || q.st !== 'alive') continue;
      const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1;
      if (d < 750) { const w = Math.pow((750 - d) / 750, 2) * 3; fx += dx / d * w; fy += dy / d * w; }
    }
    const rd = Math.hypot(p.x, p.y) || 1;
    fx += -p.y / rd * ai.orb * 0.8; fy += p.x / rd * ai.orb * 0.8;
    const edge = this.map.coastR(Math.atan2(p.y, p.x)) - this.map.fleeMargin;
    if (rd > edge) { const k = Math.min(3, (rd - edge) / 80); fx -= p.x / rd * k; fy -= p.y / rd * k; }
    const l = Math.hypot(fx, fy) || 1;
    ai.dx = fx / l; ai.dy = fy / l;
    return;
  }
  if (c.state === 'ground') {
    const dme = Math.hypot(p.x - c.x, p.y - c.y);
    let rank = 0;
    for (const q of this.players) if (q !== p && q.st === 'alive' && Math.hypot(q.x - c.x, q.y - c.y) < dme) rank++;
    if (rank <= 2 || (ai.skill > 0.75 && rank <= 3)) {
      ai.mode = 'fetch'; ai.tx = c.x + c.vx * 0.3; ai.ty = c.y + c.vy * 0.3; ai.stand = 0;
    } else { ai.mode = 'cover'; ai.tx = c.x; ai.ty = c.y; ai.stand = 260; }
  } else if (c.state === 'sea') {
    ai.mode = 'cover'; ai.tx = 0; ai.ty = 0; ai.stand = 250;
  } else {
    const t = this.pmap.get(c.carrier);
    ai.mode = 'hunt';
    if (t && !ai.hunter) { ai.mode = 'cover'; ai.tx = t.x; ai.ty = t.y; ai.stand = 430; }
    else if (t) {
      const d = Math.hypot(t.x - p.x, t.y - p.y), lead = Math.min(0.7, d / 500);
      ai.tx = t.x + (t.cvx + t.evx) * lead; ai.ty = t.y + (t.cvy + t.evy) * lead;
      const k = W.kind;
      ai.stand = (k === 'melee' || k === 'pan') ? (W.sweep ? 130 : 50) :
        k === 'shoot' ? 330 : k === 'homing' ? 420 : k === 'rocket' ? 380 : k === 'can' ? 300 : k === 'blow' ? 170 : 240;
    }
  }
  // Banor med kanaler: finns det ingen fri väg till målet går botten via broarna
  if (this.map.nav) ai.route = this.navDir(p.x, p.y, ai.tx, ai.ty);
};

Sim.prototype.botSteer = function (p, ai, dt) {
  const inp = p.inp;
  let dx, dy, sp = 1;
  if (ai.burst > 0) {
    ai.burst -= dt; dx = ai.bx; dy = ai.by;
  } else if (ai.mode === 'flee' || ai.mode === 'swim') { dx = ai.dx; dy = ai.dy; }
  else {
    dx = ai.tx - p.x; dy = ai.ty - p.y;
    const d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    if (ai.route) { dx = ai.route.x; dy = ai.route.y; }
    else if (ai.stand > 0 && d < ai.stand) {
      dx = -uy * ai.strafe; dy = ux * ai.strafe; sp = 0.55;
      if (d < ai.stand * 0.6) { dx -= ux * 0.8; dy -= uy * 0.8; }
    } else { dx = ux; dy = uy; if (ai.stand > 0 && d < ai.stand + 80) sp = 0.7; }
  }
  let l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  // Undvik hinder framför
  let sx = 0, sy = 0;
  for (const o of this.map.obstacles) {
    if (this.dead.has(o.id)) continue;
    const ox = o.x - p.x, oy = o.y - p.y, t = ox * dx + oy * dy;
    if (t < 0 || t > 120 + o.r) continue;
    const lat = ox * -dy + oy * dx, need = o.r * 0.9 + p.r + 14;
    if (Math.abs(lat) < need) {
      const s = lat >= 0 ? -1 : 1, k = (1 - Math.abs(lat) / need) * 1.8 + 0.3;
      sx += -dy * s * k; sy += dx * s * k;
    }
  }
  dx += sx; dy += sy;
  l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  // Håll dig på land (glid längs kusten)
  if (this.map.onLand(p.x, p.y) && !this.map.onLand(p.x + dx * 80, p.y + dy * 80)) {
    let rx, ry;
    if (this.map.waterDir) { const w = this.map.waterDir(p.x, p.y); rx = w.x; ry = w.y; }
    else { const rd = Math.hypot(p.x, p.y) || 1; rx = p.x / rd; ry = p.y / rd; }
    const dot = dx * rx + dy * ry;
    if (dot > 0) { dx -= dot * rx * 1.2; dy -= dot * ry * 1.2; }
  }
  inp.mx = dx * sp; inp.my = dy * sp;
  // Fastnat? Gör ett litet slumpmässigt utfall.
  ai.stuck += dt;
  if (ai.stuck > 0.6) {
    if (sp > 0.5 && Math.hypot(p.x - ai.lx, p.y - ai.ly) < 25 && p.dashT <= 0) {
      const a = this.rng() * TAU; ai.bx = Math.cos(a); ai.by = Math.sin(a); ai.burst = 0.45;
    }
    ai.lx = p.x; ai.ly = p.y; ai.stuck = 0;
  }
};

Sim.prototype.botAct = function (p, ai, W, dt) {
  const inp = p.inp, c = this.cheese, rng = this.rng;
  inp.wd = false;
  const carrying = c.state === 'carried' && c.carrier === p.id;
  let t = null;
  if (carrying) {
    // Bäraren kan varken slåss eller tackla (CFG.carrierTackle): den springer bara, blicken åt det håll den springer
    if (!CFG.carrierTackle) { ai.react = 0; ai.tgt = -1; if (inp.mx || inp.my) inp.a = Math.atan2(inp.my, inp.mx); return; }
    // (carrierTackle på:) Bäraren bryr sig bara om dem som är precis intill (för att tackla)
    let nd = 200;
    for (const q of this.players) {
      if (q === p || q.st !== 'alive') continue;
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < nd) { nd = d; t = q; }
    }
  } else {
    if (c.state === 'carried') {
      const ct = this.pmap.get(c.carrier);
      if (ct && ct.st === 'alive') {
        const cd = Math.hypot(ct.x - p.x, ct.y - p.y);
        if (cd < (ai.hunter ? 650 : 220)) t = ct;
      }
    }
    if (!t && ai.opp) {
      let nd = 330;
      for (const q of this.players) {
        if (q === p || q.st !== 'alive') continue;
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d < nd) { nd = d; t = q; }
      }
    }
  }
  if (!t) { ai.react = 0; ai.tgt = -1; if (inp.mx || inp.my) inp.a = Math.atan2(inp.my, inp.mx); return; }
  if (ai.tgt !== t.id) { ai.tgt = t.id; ai.react = 0; }
  ai.react += dt;
  const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy) || 1;
  const tvx = t.cvx + t.evx, tvy = t.cvy + t.evy;
  if (ai.fireWait > 0) ai.fireWait -= dt;
  const ready = ai.react > 0.22 + (1 - ai.skill) * 0.45 && ai.fireWait <= 0;
  const shot = () => { ai.fireWait = 0.25 + rng() * 0.9; };
  inp.a = Math.atan2(dy, dx) + ai.aimErr; inp.ad = d;
  // Tackling
  if (ready && p.tkCd <= 0 && p.recT <= 0 && d < (carrying ? 125 : 150) && rng() < (carrying ? 0.12 : 0.03)) {
    inp.mx = dx / d; inp.my = dy / d; inp.tk++; shot();
  }
  if (carrying) return;
  switch (W.kind) {
    case 'melee':
      if (ready && p.wcd <= 0 && d < (W.range + t.r) * 0.92 && Math.abs(angDiff(Math.atan2(dy, dx), inp.a)) < 0.4) { inp.wd = true; shot(); }
      break;
    case 'pan': {
      const reach = W.range + t.r;
      if (p.guard && d < reach * 0.95) inp.wd = false;          // släpp = smäll
      else if (ready && p.wcd <= 0 && d < reach * 0.95) { inp.wd = true; shot(); }   // höj skölden
      else if (d < 460 && d > reach + 70) inp.wd = true;      // skölden uppe mot skott
      break;
    }
    case 'shoot': {
      const lead = d / W.speed * ai.leadK;
      inp.a = Math.atan2(t.y + tvy * lead - p.y, t.x + tvx * lead - p.x) + ai.aimErr;
      if (ready && d < W.speed * W.life * 0.85 && d > 70 && p.wcd <= 0 && p.reload <= 0) { inp.wp++; shot(); }
      break;
    }
    case 'homing':
      if (ready && d < 650 && p.wcd <= 0) { inp.wp++; shot(); }
      break;
    case 'rocket': {
      const px = t.x + tvx * W.fuse * 0.85, py = t.y + tvy * W.fuse * 0.85, dd = Math.hypot(px - p.x, py - p.y);
      if (ready && p.wcd <= 0 && dd >= W.rangeMin && dd <= W.rangeMax && dd > W.boomR + 40) {
        inp.a = Math.atan2(py - p.y, px - p.x); inp.ad = dd; inp.wp++; shot();
      }
      break;
    }
    case 'can': {
      const px = t.x + tvx * W.fly, py = t.y + tvy * W.fly, dd = Math.hypot(px - p.x, py - p.y);
      if (ready && p.wcd <= 0 && dd >= W.rangeMin && dd <= W.rangeMax) {
        inp.a = Math.atan2(py - p.y, px - p.x); inp.ad = dd; inp.wp++; shot();
      }
      break;
    }
    case 'mine':
      ai.mineT -= dt;
      if (ai.mineT <= 0 && p.wcd <= 0 && Math.hypot(p.x - c.x, p.y - c.y) < 450) { inp.wp++; ai.mineT = 4 + rng() * 5; }
      break;
    case 'blow':
      if (ai.fireWait <= 0.0001 || p.blow) { if (d < W.range * 0.85 && Math.abs(angDiff(Math.atan2(dy, dx), inp.a)) < W.half * 0.8 && ai.react > 0.3) inp.wd = true; }
      break;
    case 'pad':
      ai.padT -= dt;
      if (ai.padT <= 0 && p.wcd <= 0 && d < 330) { inp.wp++; ai.padT = 8 + rng() * 6; }
      break;
  }
};
