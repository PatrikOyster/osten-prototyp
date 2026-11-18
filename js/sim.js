'use strict';
/* =====================================================================
   SIMULERINGEN – värd-auktoritativ spelmotor (ren logik, inga DOM-anrop)
   Värden (eller solo-spelaren) kör Sim; klienter tar emot "vyer" (snapshots).
   ===================================================================== */

/* ---------- Delad rörelsekod (används även av klientens förutsägelse) ---------- */
function speedMul(p, world) {
  let m = 1;
  if (p.carry) m *= CFG.carryMul;
  if (p.swinging) m *= CFG.swingMul;
  if (p.guard) m *= CFG.guardMul;
  if (p.daze) m *= CFG.dazeMul;
  if (p.slowStink) m *= 0.75;
  if (world.map.inPond(p.x, p.y)) m *= CFG.pondMul;
  if (!world.map.onLand(p.x, p.y)) m *= CFG.seaMul;
  return m;
}

/* Styrrörelse hålls på land (glider längs kusten eller kanalkanten); den som redan är i vattnet får röra sig fritt. */
function moveLand(p, dx, dy, map) {
  const nx = p.x + dx, ny = p.y + dy;
  if (map.onLand(nx, ny) || !map.onLand(p.x, p.y)) { p.x = nx; p.y = ny; return; }
  let rx, ry;
  if (map.waterDir) { const w = map.waterDir(p.x, p.y); rx = w.x; ry = w.y; }   // kanalbanan: normalen mot närmaste vatten
  else { const d = Math.hypot(p.x, p.y) || 1; rx = p.x / d; ry = p.y / d; }     // runda öar: kusten ligger runt mitten
  const dot = dx * rx + dy * ry;
  let sx = dx, sy = dy;
  if (dot > 0) { sx -= dot * rx; sy -= dot * ry; }
  if (map.onLand(p.x + sx, p.y + sy)) { p.x += sx; p.y += sy; return; }
  if (map.onLand(nx, p.y)) { p.x = nx; return; }
  if (map.onLand(p.x, ny)) { p.y = ny; }
}

function motionStep(p, mx, my, dt, world) {
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  if (p.recT > 0) p.recT = Math.max(0, p.recT - dt);
  if (p.dashT > 0) {
    p.cvx = p.dashDx * CFG.tkSpeed; p.cvy = p.dashDy * CFG.tkSpeed;
    p.dashT -= dt;
    if (p.dashT <= 0) { p.dashT = 0; p.recT = CFG.tkRecover; p.cvx *= 0.3; p.cvy *= 0.3; }
  } else {
    const sp = CFG.speed * speedMul(p, world) * (p.recT > 0 ? 0.6 : 1);
    const tx = mx * sp, ty = my * sp;
    const acc = len > 0.01 ? CFG.accel : CFG.decel;
    const dvx = tx - p.cvx, dvy = ty - p.cvy, dl = Math.hypot(dvx, dvy), st = acc * dt;
    if (dl <= st) { p.cvx = tx; p.cvy = ty; } else { p.cvx += dvx / dl * st; p.cvy += dvy / dl * st; }
  }
  const k = Math.exp(-CFG.evDecay * dt);
  p.evx *= k; p.evy *= k;
  moveLand(p, p.cvx * dt, p.cvy * dt, world.map);
  p.x += p.evx * dt; p.y += p.evy * dt;
}

function collideObstacles(p, world) {
  let hit = null;
  const obs = world.map.obstacles;
  for (let i = 0; i < obs.length; i++) {
    const o = obs[i];
    if (world.dead.has(o.id)) continue;
    const dx = p.x - o.x, dy = p.y - o.y, min = p.r + o.r * 0.9, d2 = dx * dx + dy * dy;
    if (d2 < min * min) {
      const d = Math.sqrt(d2) || 0.001, nx = dx / d, ny = dy / d;
      p.x = o.x + nx * min; p.y = o.y + ny * min;
      const vn = p.cvx * nx + p.cvy * ny;
      if (vn < 0) { p.cvx -= vn * nx; p.cvy -= vn * ny; }
      const en = p.evx * nx + p.evy * ny;
      if (en < 0) { p.evx -= 1.4 * en * nx; p.evy -= 1.4 * en * ny; }
      hit = o;
    }
  }
  return hit;
}

const r0 = v => Math.round(v);

class Sim {
  constructor(o) {
    this.seed = (o.seed >>> 0) || 1;
    this.map = makeMap(this.seed, o.map);
    this.rng = mulberry32((this.seed ^ 0xA5A5A5A5) >>> 0);
    this.matchSec = o.matchSec || CFG.matchSec;
    this.time = 0;
    this.phase = 'reveal';
    this.pt = CFG.revealSec;
    this.timeLeft = this.matchSec;
    this.over = false;
    this.results = null;
    this.events = [];
    this.nid = 1;
    this.proj = [];
    this.areas = [];
    this.dead = new Set();
    this.obHp = new Map();
    for (const ob of this.map.obstacles) this.obHp.set(ob.id, ob.hp);
    this.cheese = { x: 0, y: 0, vx: 0, vy: 0, state: 'ground', carrier: -1, air: 0, seaT: 0, rot: 0, nudge: this.rng() * TAU };
    this.gullT = 0;
    let order;
    if (this.map.slotOrder) order = this.map.slotOrder(this.rng);   // kanalbanan: en spelare per ö först
    else {
      order = [0, 1, 2, 3, 4, 5, 6, 7];
      for (let i = 7; i > 0; i--) { const j = (this.rng() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
    }
    this.pmap = new Map();
    this.players = o.players.map((d, i) => {
      const p = this.makePlayer(d, order[i % 8]);
      this.pmap.set(p.id, p);
      return p;
    });
    for (const p of this.players) if (p.bot) this.botInit(p);
  }

  ev(...a) { this.events.push(a); }
  drainEvents() { const e = this.events; this.events = []; return e; }

  makePlayer(d, slot) {
    const sp = this.map.spawns[slot], W = WEAPONS[d.weapon];
    return {
      id: d.id, name: d.name, skin: d.skin | 0, weapon: d.weapon, bot: !!d.bot,
      x: sp.x, y: sp.y, a: Math.atan2(-sp.y, -sp.x), ad: 300,
      cvx: 0, cvy: 0, evx: 0, evy: 0, r: CFG.pr,
      st: 'alive', koT: 0, koCause: '', inv: 0,
      dashT: 0, dashDx: 0, dashDy: 0, tkCd: 0, recT: 0,
      sw: null, wcd: 0, ammo: W.ammo || 0, reload: 0, heat: 0, over: false, guard: false, guardT: 0, blow: false,
      gale: 0, galeBy: -1, galeHit: false,
      dazeT: 0, stink: 0, stinkBy: -1, slowStink: false, seaT: 0, wasSea: false,
      airT: 0, airDur: 1, airDx: 0, airDy: 0, padCd: 0,
      carry: false, swinging: false, daze: false,
      score: 0, kos: 0, hits: 0, best: 0, streak: 0,
      inp: { mx: 0, my: 0, a: 0, ad: 300, tk: 0, wp: 0, wr: 0, wd: false },
      lastTk: 0, lastWp: 0, lastWr: 0, tkBuf: 0, wpBuf: 0, wpEdge: false, wrEdge: false,
      lastHit: null, ai: null
    };
  }

  /* ---------- Gränssnitt utåt ---------- */
  setInput(pid, i) {
    const p = this.pmap.get(pid);
    if (!p || p.bot) return;
    const s = p.inp, f = (v, d) => Number.isFinite(v) ? v : d;
    let mx = f(i.mx, 0), my = f(i.my, 0);
    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    s.mx = mx; s.my = my; s.a = f(i.a, s.a); s.ad = clamp(f(i.ad, 300), 0, 1500);
    s.tk = i.tk | 0; s.wp = i.wp | 0; s.wr = i.wr | 0; s.wd = !!i.wd;
  }

  toBot(pid) {
    const p = this.pmap.get(pid);
    if (!p || p.bot) return;
    p.bot = true;
    this.botInit(p);
  }

  /* ---------- Huvudsteg ---------- */
  step(dt) {
    if (this.over) return;
    this.time += dt;
    if (this.phase === 'reveal') {
      this.pt -= dt;
      if (this.pt <= 0) { this.phase = 'count'; this.pt = CFG.countSec; this.ev('phase', 'count'); }
      return;
    }
    if (this.phase === 'count') {
      this.pt -= dt;
      if (this.pt <= 0) { this.phase = 'play'; this.pt = this.timeLeft; this.startPlay(); }
      return;
    }
    this.timeLeft -= dt;
    this.pt = this.timeLeft;
    for (const p of this.players) if (p.bot) this.botThink(p, dt);
    for (const p of this.players) this.stepPlayer(p, dt);
    this.galeDecay(dt);
    this.separate();
    this.stepCheese(dt);
    this.stepProj(dt);
    this.stepAreas(dt);
    this.pickups();
    this.scoring(dt);
    if (this.timeLeft <= 0) this.finish();
  }

  startPlay() {
    const c = this.cheese;
    const sp = this.map.startPop === undefined ? 140 : this.map.startPop;   // kanalbanan: litet puff så att osten stannar nära mitten
    c.vx = Math.cos(c.nudge) * sp; c.vy = Math.sin(c.nudge) * sp;
    for (const p of this.players) { p.lastTk = p.inp.tk; p.lastWp = p.inp.wp; p.lastWr = p.inp.wr; }
    this.ev('phase', 'play');
  }

  finish() {
    this.phase = 'end'; this.over = true; this.pt = 0; this.timeLeft = 0;
    const c = this.cheese;
    const carrier = c.state === 'carried' ? c.carrier : -2;
    const arr = this.players.slice().sort((a, b) =>
      (b.score - a.score) || ((b.id === carrier) - (a.id === carrier)) || (a.kos - b.kos));
    this.results = {
      winner: arr[0].id,
      rank: arr.map(p => ({
        id: p.id, name: p.name, skin: p.skin, weapon: p.weapon, bot: p.bot,
        score: Math.round(p.score * 10) / 10, kos: p.kos, hits: p.hits, best: Math.round(p.best * 10) / 10
      }))
    };
    this.ev('end', arr[0].id);
  }

  /* ---------- Spelare ---------- */
  stepPlayer(p, dt) {
    const i = p.inp;
    if (i.tk !== p.lastTk) { p.lastTk = i.tk; p.tkBuf = 0.18; }
    if (i.wp !== p.lastWp) { p.lastWp = i.wp; p.wpBuf = 0.18; p.wpEdge = true; }
    if (i.wr !== p.lastWr) { p.lastWr = i.wr; p.wrEdge = true; }
    p.tkCd = Math.max(0, p.tkCd - dt); p.wcd = Math.max(0, p.wcd - dt); p.inv = Math.max(0, p.inv - dt);
    p.dazeT = Math.max(0, p.dazeT - dt); p.padCd = Math.max(0, p.padCd - dt);
    const W = WEAPONS[p.weapon];
    if (p.reload > 0) { p.reload -= dt; if (p.reload <= 0) { p.reload = 0; p.ammo = W.ammo; } }
    if (p.st === 'ko') this.stepKo(p, dt);
    else if (p.st === 'air') this.stepAir(p, dt);
    else this.stepAlive(p, dt, W);
    p.tkBuf = Math.max(0, p.tkBuf - dt); p.wpBuf = Math.max(0, p.wpBuf - dt);
    p.wpEdge = false; p.wrEdge = false;
  }

  stepAlive(p, dt, W) {
    const inp = p.inp, c = this.cheese;
    p.carry = c.state === 'carried' && c.carrier === p.id;
    p.swinging = !!p.sw;
    p.daze = p.dazeT > 0;
    if (!p.sw) p.a = inp.a;
    p.ad = inp.ad;
    // Ostbäraren får inte tackla (CFG.carrierTackle). Ett tryck sparas inte till senare, och en tackling
    // som pågår när osten plockas upp avbryts – annars kunde man köra in i någon med osten i famnen.
    if (p.carry && !CFG.carrierTackle) {
      p.tkBuf = 0;
      if (p.dashT > 0) { p.dashT = 0; p.cvx *= 0.3; p.cvy *= 0.3; }
    }
    // Tackling
    if (p.tkBuf > 0 && p.tkCd <= 0 && p.dashT <= 0 && p.recT <= 0) {
      let dx = inp.mx, dy = inp.my;
      const l = Math.hypot(dx, dy);
      if (l < 0.2) { dx = Math.cos(p.a); dy = Math.sin(p.a); } else { dx /= l; dy /= l; }
      p.dashT = CFG.tkDur; p.dashDx = dx; p.dashDy = dy; p.tkCd = CFG.tkCd; p.tkBuf = 0;
      p.sw = null; p.swinging = false; p.guard = false; p.guardT = 0;
      this.ev('tackle', p.id, r0(p.x), r0(p.y), r0(Math.atan2(dy, dx) * 100));
    }
    // Vapen
    p.blow = false;
    if (p.dashT <= 0 && p.recT <= 0 && !p.carry) this.weaponLogic(p, W, dt);
    else { p.guard = false; p.guardT = 0; }
    if (p.sw) this.updateSwing(p, W, dt);
    // Rörelse
    const wasDash = p.dashT > 0;
    motionStep(p, inp.mx, inp.my, dt, this);
    const ob = collideObstacles(p, this);
    if (wasDash) {
      if (ob) { this.damageOb(ob, 1); p.dashT = 0; p.recT = CFG.tkRecover * 1.5; p.cvx = p.cvy = 0; }
      else this.dashHits(p);
    }
    // Hav
    if (this.map.onLand(p.x, p.y)) { p.seaT = 0; p.wasSea = false; }
    else {
      if (!p.wasSea) { p.wasSea = true; this.ev('splash', r0(p.x), r0(p.y)); }
      p.seaT += dt;
      if (p.seaT > CFG.drownSec) this.koDrown(p);
    }
  }

  dashHits(p) {
    if (p.dashT <= 0) return;
    for (const q of this.players) {
      if (q === p || q.st !== 'alive' || q.inv > 0) continue;
      const dx = q.x - p.x, dy = q.y - p.y;
      if (dx * dx + dy * dy < (p.r + q.r + 6) * (p.r + q.r + 6)) {
        this.koPlayer(q, p.id, 'tackle', p.dashDx, p.dashDy, CFG.tkKb);
        p.dashT = 0; p.recT = CFG.tkRecover; p.cvx *= 0.15; p.cvy *= 0.15;
        return;
      }
    }
  }

  koDrown(p) {
    const lh = p.lastHit, by = lh && this.time - lh.t < 5 ? lh.by : -1;
    this.koPlayer(p, by, 'drown', 0, 0, 0);
  }

  stepKo(p, dt) {
    p.koT -= dt;
    const k = Math.exp(-4 * dt);
    p.evx *= k; p.evy *= k;
    p.x += p.evx * dt; p.y += p.evy * dt;
    if (!p.wasSea && !this.map.onLand(p.x, p.y)) { p.wasSea = true; this.ev('splash', r0(p.x), r0(p.y)); }
    if (p.koT <= 0) this.respawn(p);
  }

  stepAir(p, dt) {
    p.airT -= dt;
    p.x += p.airDx * dt; p.y += p.airDy * dt;
    if (p.airT <= 0) {
      p.st = 'alive'; p.padCd = 0.7; p.cvx = p.cvy = p.evx = p.evy = 0;
      this.ev('land', p.id, r0(p.x), r0(p.y));
      if (!this.map.onLand(p.x, p.y)) { p.wasSea = true; p.seaT = 0; this.ev('splash', r0(p.x), r0(p.y)); }
    }
  }

  launch(q, ang) {
    const Wp = WEAPONS.trampoline;
    q.st = 'air'; q.airDur = Wp.air; q.airT = Wp.air;
    q.airDx = Math.cos(ang) * Wp.dist / Wp.air; q.airDy = Math.sin(ang) * Wp.dist / Wp.air;
    q.dashT = 0; q.recT = 0; q.sw = null; q.guard = false; q.guardT = 0; q.blow = false;
    q.cvx = q.cvy = q.evx = q.evy = 0;
  }

  respawn(p) {
    const c = this.cheese;
    let best = null, bs = -1e9;
    for (const s of this.map.spawns) {
      let near = 1e9;
      for (const q of this.players) if (q !== p && q.st === 'alive') near = Math.min(near, Math.hypot(q.x - s.x, q.y - s.y));
      if (near < 220) continue;
      const sc = Math.hypot(c.x - s.x, c.y - s.y) + this.rng() * 60;
      if (sc > bs) { bs = sc; best = s; }
    }
    if (!best) best = this.map.spawns[(this.rng() * 8) | 0];
    const W = WEAPONS[p.weapon];
    p.x = best.x; p.y = best.y; p.a = Math.atan2(-best.y, -best.x);
    p.cvx = p.cvy = p.evx = p.evy = 0;
    p.st = 'alive'; p.inv = CFG.spawnInv; p.wcd = 0.4; p.ammo = W.ammo || 0; p.reload = 0; p.heat = 0; p.over = false;
    p.tkCd = 0; p.recT = 0; p.dashT = 0; p.sw = null; p.guard = false; p.dazeT = 0; p.stink = 0;
    p.seaT = 0; p.wasSea = false; p.lastHit = null; p.padCd = 0.5;
    this.ev('respawn', p.id, r0(p.x), r0(p.y));
  }

  separate() {
    const ps = this.players;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i];
      if (a.st !== 'alive') continue;
      for (let j = i + 1; j < ps.length; j++) {
        const b = ps[j];
        if (b.st !== 'alive' || a.dashT > 0 || b.dashT > 0) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = a.r + b.r - 2;
        if (d < min && d > 0.01) {
          const push = (min - d) * 0.5;
          a.x -= dx / d * push; a.y -= dy / d * push; b.x += dx / d * push; b.y += dy / d * push;
        }
      }
    }
  }

  /* ---------- KO, ost och förstörelse ---------- */
  koPlayer(v, by, cause, kx, ky, force) {
    if (v.st !== 'alive' || this.phase !== 'play') return false;
    if (v.inv > 0 && cause !== 'drown') return false;
    const c = this.cheese;
    if (c.state === 'carried' && c.carrier === v.id) this.dropCheese(v, kx, ky);
    v.st = 'ko'; v.koT = CFG.respawnSec; v.koCause = cause;
    v.evx = kx * force; v.evy = ky * force; v.cvx = v.cvy = 0;
    v.dashT = 0; v.recT = 0; v.sw = null; v.guard = false; v.guardT = 0; v.blow = false; v.stink = 0; v.dazeT = 0; v.gale = 0;
    v.kos++;
    if (by >= 0 && by !== v.id) { const a = this.pmap.get(by); if (a) a.hits++; }
    this.ev('ko', v.id, by, cause, r0(v.x), r0(v.y), r0(kx * 100), r0(ky * 100));
    return true;
  }

  dropCheese(p, kx, ky) {
    const c = this.cheese;
    c.state = 'ground'; c.carrier = -1; c.air = CFG.cheeseAir; c.x = p.x; c.y = p.y;
    let ux = kx, uy = ky;
    const l = Math.hypot(ux, uy);
    if (l < 0.01) { ux = 0; uy = 0; } else { ux /= l; uy /= l; }
    // Osten "poppar" iväg: slumpad riktning, lite åt knuffhållet, och inåt mot ön om man är nära kusten
    const ps = this.map.popSpeed || [170, 130];
    let ra, sp;
    if (this.map.safeDir) {   // kanalbanan: samma slump och knuff, men riktningen böjs av så att osten inte hamnar i en kanal
      ra = this.rng() * TAU; sp = ps[0] + this.rng() * ps[1];
      ux = ux * 0.5 + Math.cos(ra) * 0.7; uy = uy * 0.5 + Math.sin(ra) * 0.7;
      const sd = this.map.safeDir(p.x, p.y, ux, uy, sp / CFG.cheeseFric * 1.1 + 10);
      ux = sd.x; uy = sd.y;
    } else {
      const dd = Math.hypot(p.x, p.y) || 1, cr = this.map.coastR(Math.atan2(p.y, p.x));
      const near = clamp((dd - (cr - 380)) / 280, 0, 1);
      ra = this.rng() * TAU;
      ux = ux * 0.5 + Math.cos(ra) * 0.7 - p.x / dd * near * 1.6;
      uy = uy * 0.5 + Math.sin(ra) * 0.7 - p.y / dd * near * 1.6;
      const ul = Math.hypot(ux, uy) || 1;
      sp = ps[0] + this.rng() * ps[1];
      ux /= ul; uy /= ul;
    }
    c.vx = ux * sp + p.cvx * 0.2; c.vy = uy * sp + p.cvy * 0.2;
    p.streak = 0; this.gullT = 0;
    this.ev('drop', p.id);
  }

  stepCheese(dt) {
    const c = this.cheese;
    if (c.state === 'carried') {
      const p = this.pmap.get(c.carrier);
      if (!p) { c.state = 'ground'; c.carrier = -1; }
      else if (p.st === 'ko') this.dropCheese(p, 0, 0);
      else { c.x = p.x; c.y = p.y; c.vx = c.vy = 0; return; }
    }
    if (c.state === 'sea') {
      c.seaT += dt;
      if (!this.map.still) {   // (på kanalbanan ligger osten kvar där den föll i, annars skulle den driva upp på en ö)
        const d = Math.hypot(c.x, c.y) || 1;
        c.x += c.x / d * 40 * dt; c.y += c.y / d * 40 * dt;
      }
      if (c.seaT >= CFG.seaReturn) {
        c.state = 'ground'; c.x = 0; c.y = 0; c.seaT = 0; c.air = 0.6;
        const a = this.rng() * TAU, pop = this.map.cheesePop || 100; c.vx = Math.cos(a) * pop; c.vy = Math.sin(a) * pop;
        this.ev('cheeseReset');
      }
      return;
    }
    c.air = Math.max(0, c.air - dt);
    const d = Math.hypot(c.x, c.y);
    if (!this.map.hills && d < CFG.hillR) {   // (kanalbanan har ingen kulle: osten ligger stilla på mitten-ön)
      const f = 1 - d / CFG.hillR;
      let ux, uy;
      if (d > 1) { ux = c.x / d; uy = c.y / d; } else { ux = Math.cos(c.nudge); uy = Math.sin(c.nudge); }
      c.vx += ux * CFG.hillPush * f * dt; c.vy += uy * CFG.hillPush * f * dt;
    }
    const fr = Math.exp(-(this.map.inPond(c.x, c.y) ? 3.2 : CFG.cheeseFric) * dt);
    c.vx *= fr; c.vy *= fr;
    c.x += c.vx * dt; c.y += c.vy * dt;
    for (const ob of this.map.obstacles) {
      if (this.dead.has(ob.id)) continue;
      const dx = c.x - ob.x, dy = c.y - ob.y, min = ob.r * 0.9 + CFG.cr, d2 = dx * dx + dy * dy;
      if (d2 < min * min) {
        const dd = Math.sqrt(d2) || 0.01, nx = dx / dd, ny = dy / dd;
        c.x = ob.x + nx * min; c.y = ob.y + ny * min;
        const vn = c.vx * nx + c.vy * ny;
        if (vn < 0) { c.vx -= 1.55 * vn * nx; c.vy -= 1.55 * vn * ny; }
      }
    }
    c.rot += Math.hypot(c.vx, c.vy) / CFG.cr * dt;
    if (!this.map.onLand(c.x, c.y)) { c.state = 'sea'; c.seaT = 0; this.ev('splash', r0(c.x), r0(c.y)); }
  }

  pickups() {
    const c = this.cheese;
    if (c.state !== 'ground' || c.air > 0) return;
    let best = null, bd = 0;
    for (const p of this.players) {
      if (p.st !== 'alive') continue;
      const d = Math.hypot(p.x - c.x, p.y - c.y) - (p.r + CFG.cr + 4);
      if (d < 0 && (best === null || d < bd)) { best = p; bd = d; }
    }
    if (best) {
      c.state = 'carried'; c.carrier = best.id; c.vx = c.vy = 0;
      best.streak = 0; best.sw = null; best.guard = false; best.guardT = 0; best.blow = false;
      best.inv = Math.max(best.inv, CFG.pickupInv);
      this.gullT = 0;
      this.ev('pick', best.id);
    }
  }

  scoring(dt) {
    const c = this.cheese;
    if (c.state !== 'carried') return;
    const p = this.pmap.get(c.carrier);
    if (!p) return;
    p.score += dt; p.streak += dt;
    if (p.streak > p.best) p.best = p.streak;
    if (CFG.gullOn && p.streak > CFG.gullAfter) {
      this.gullT -= dt;
      if (this.gullT <= 0) { this.spawnParisPigeon(p); this.gullT = CFG.gullEvery; }
    }
  }

  spawnParisPigeon(carrier) {
    const W = WEAPONS.pigeon, a = this.rng() * TAU;
    const x = carrier.x + Math.cos(a) * 700, y = carrier.y + Math.sin(a) * 700;
    this.proj.push({
      id: this.nid++, k: 'pigeon', cause: 'pigeon', o: -1, env: true, x, y, ang: a + Math.PI, speed: 340,
      vx: 0, vy: 0, tg: carrier.id, r: W.pr + 2, kb: W.kb, life: 6, age: 0, bounces: 0
    });
    this.ev('parisduva', r0(x), r0(y));
  }

  /* ---------- Vapen ---------- */
  weaponLogic(p, W, dt) {
    const inp = p.inp, tap = p.wpBuf > 0, hold = inp.wd;
    switch (W.kind) {
      case 'melee':
        p.guard = false;
        if ((tap || hold) && p.wcd <= 0 && !p.sw) { this.startSwing(p, W); p.wpBuf = 0; }
        break;
      case 'pan':
        if (p.sw) { p.guard = false; p.guardT = 0; break; }
        if (!p.guard && (p.wpEdge || hold) && p.wcd <= 0) { p.guard = true; p.guardT = 0; }
        if (p.guard) {
          p.guardT += dt;
          if (p.wrEdge || !hold) { p.guard = false; this.startSwing(p, W); p.wpBuf = 0; }
        }
        break;
      case 'shoot':
        if ((tap || hold) && p.wcd <= 0 && p.reload <= 0) { this.fireShots(p, W); p.wpBuf = 0; }
        break;
      case 'homing':
        if (tap && p.wcd <= 0) { this.launchPigeon(p, W); p.wpBuf = 0; }
        break;
      case 'rocket':
        if (tap && p.wcd <= 0) { this.launchRocket(p, W); p.wpBuf = 0; }
        break;
      case 'can':
        if (tap && p.wcd <= 0) { this.launchCan(p, W); p.wpBuf = 0; }
        break;
      case 'mine':
        if (tap && p.wcd <= 0) { this.placeMine(p, W); p.wpBuf = 0; }
        break;
      case 'pad':
        if (tap && p.wcd <= 0) { this.placePad(p, W); p.wpBuf = 0; }
        break;
      case 'blow':
        this.blowLogic(p, W, dt);
        break;
    }
  }

  startSwing(p, W) {
    p.sw = { t: 0, windup: W.windup, active: W.active, recover: W.recover, a0: p.a, hit: new Set(), obHit: new Set() };
    p.swinging = true;
    p.wcd = W.cd;
    this.ev('swing', p.id, p.weapon, r0(p.x), r0(p.y), r0(p.a * 100));
    if (W.squeak) {
      for (const q of this.players) {
        if (q === p || q.st !== 'alive') continue;
        if (Math.hypot(q.x - p.x, q.y - p.y) < W.squeak.r) q.dazeT = Math.max(q.dazeT, W.squeak.daze);
      }
      this.ev('squeak', p.id, r0(p.x), r0(p.y));
    }
  }

  swingAngle(W, s) {
    if (!W.sweep) return s.a0;
    const f = clamp((s.t - s.windup) / s.active, 0, 1);
    return s.a0 + (f - 0.5) * W.arc + Math.sin(s.t * 18) * W.wobble * 0.3;
  }

  updateSwing(p, W, dt) {
    const s = p.sw;
    s.t += dt;
    if (s.t >= s.windup && s.t <= s.windup + s.active + 0.0001) this.swingHits(p, W, s);
    if (s.t >= s.windup + s.active + s.recover) { p.sw = null; p.swinging = false; }
  }

  swingHits(p, W, s) {
    const a = this.swingAngle(W, s), cx = Math.cos(a), cy = Math.sin(a);
    const tipx = p.x + cx * W.range, tipy = p.y + cy * W.range;
    for (const q of this.players) {
      if (q === p || q.st !== 'alive' || q.inv > 0 || s.hit.has(q.id)) continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 0.01;
      let hit;
      if (W.sweep) hit = segDist(q.x, q.y, p.x, p.y, tipx, tipy) < q.r + 16;
      else hit = d < W.range + q.r && Math.abs(angDiff(Math.atan2(dy, dx), a)) < W.arc / 2;
      if (hit) { s.hit.add(q.id); this.koPlayer(q, p.id, p.weapon, dx / d, dy / d, W.kb); }
    }
    for (const ob of this.map.obstacles) {
      if (this.dead.has(ob.id) || s.obHit.has(ob.id)) continue;
      const dx = ob.x - p.x, dy = ob.y - p.y, d = Math.hypot(dx, dy);
      if (d > W.range + ob.r + 40) continue;
      let hit;
      if (W.sweep) hit = segDist(ob.x, ob.y, p.x, p.y, tipx, tipy) < ob.r * 0.9 + 16;
      else hit = d < W.range + ob.r * 0.9 && Math.abs(angDiff(Math.atan2(dy, dx), a)) < W.arc / 2 + 0.3;
      if (hit) { s.obHit.add(ob.id); this.damageOb(ob, 1); }
    }
  }

  fireShots(p, W) {
    p.wcd = W.cd;
    if (W.ammo) { p.ammo--; if (p.ammo <= 0) p.reload = W.reload; }
    for (let i = 0; i < W.n; i++) {
      const a = p.a + (i - (W.n - 1) / 2) * W.spread;
      this.proj.push({
        id: this.nid++, k: W.pk, cause: p.weapon, o: p.id,
        x: p.x + Math.cos(a) * (p.r + 8), y: p.y + Math.sin(a) * (p.r + 8),
        vx: Math.cos(a) * W.speed, vy: Math.sin(a) * W.speed, r: W.pr, life: W.life, kb: W.kb, age: 0, bounces: W.bounces || 0
      });
    }
    this.ev('shoot', p.id, p.weapon, r0(p.x), r0(p.y), r0(p.a * 100));
  }

  launchPigeon(p, W) {
    p.wcd = W.cd;
    let tg = -1, bs = 1e9;
    for (const q of this.players) {
      if (q === p || q.st !== 'alive') continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      const sc = d * (1 + Math.abs(angDiff(Math.atan2(dy, dx), p.a)) * 1.2);
      if (d < 900 && sc < bs) { bs = sc; tg = q.id; }
    }
    this.proj.push({
      id: this.nid++, k: 'pigeon', cause: 'pigeon', o: p.id, env: false,
      x: p.x + Math.cos(p.a) * 30, y: p.y + Math.sin(p.a) * 30, ang: p.a, speed: W.speed,
      vx: Math.cos(p.a) * W.speed, vy: Math.sin(p.a) * W.speed, tg, r: W.pr, kb: W.kb, life: W.life, age: 0, bounces: 0
    });
    this.ev('shoot', p.id, 'pigeon', r0(p.x), r0(p.y), r0(p.a * 100));
  }

  launchRocket(p, W) {
    p.wcd = W.cd;
    const dist = clamp(p.ad, W.rangeMin, W.rangeMax), sp = dist / W.fuse;
    this.proj.push({
      id: this.nid++, k: 'rocket', cause: 'feu', o: p.id,
      x: p.x + Math.cos(p.a) * 30, y: p.y + Math.sin(p.a) * 30,
      vx: Math.cos(p.a) * sp, vy: Math.sin(p.a) * sp, r: 10, life: W.fuse, age: 0, bounces: 0
    });
    this.ev('shoot', p.id, 'feu', r0(p.x), r0(p.y), r0(p.a * 100));
  }

  launchCan(p, W) {
    p.wcd = W.cd;
    const dist = clamp(p.ad, W.rangeMin, W.rangeMax), sp = dist / W.fly;
    this.proj.push({
      id: this.nid++, k: 'can', cause: 'epoisses', o: p.id, x: p.x, y: p.y,
      vx: Math.cos(p.a) * sp, vy: Math.sin(p.a) * sp, r: 12, life: W.fly, age: 0, bounces: 0
    });
    this.ev('shoot', p.id, 'epoisses', r0(p.x), r0(p.y), r0(p.a * 100));
  }

  placeMine(p, W) {
    p.wcd = W.cd;
    const mine = this.areas.filter(a => a.k === 'mine' && a.o === p.id);
    if (mine.length >= W.max) this.areas.splice(this.areas.indexOf(mine[0]), 1);
    this.areas.push({ id: this.nid++, k: 'mine', o: p.id, x: p.x, y: p.y, r: W.trigR, t: 0, a: 0 });
    this.ev('place', p.id, 'champagne', r0(p.x), r0(p.y));
  }

  placePad(p, W) {
    p.wcd = W.cd;
    const pads = this.areas.filter(a => a.k === 'pad' && a.o === p.id);
    if (pads.length >= W.max) this.areas.splice(this.areas.indexOf(pads[0]), 1);
    let x = p.x + Math.cos(p.a) * 80, y = p.y + Math.sin(p.a) * 80;
    if (!this.map.onLand(x, y)) { x = p.x; y = p.y; }
    this.areas.push({ id: this.nid++, k: 'pad', o: p.id, x, y, r: W.padR, t: 0, a: p.a });
    p.padCd = 0.8;
    this.ev('place', p.id, 'trampoline', r0(x), r0(y));
  }

  /* Vindmätaren töms för alla som inte blåstes på i det här steget */
  galeDecay(dt) {
    const out = WEAPONS.souffleur.galeOut;
    for (const q of this.players) {
      if (q.galeHit) q.galeHit = false;
      else if (q.gale > 0) q.gale = Math.max(0, q.gale - out * dt);
    }
  }

  blowLogic(p, W, dt) {
    const hold = p.inp.wd;
    if (p.over) { p.heat = Math.max(0, p.heat - W.cool * dt); if (p.heat <= W.resume) p.over = false; return; }
    if (!hold) { p.heat = Math.max(0, p.heat - W.cool * dt); return; }
    p.blow = true;
    p.heat += W.heatUp * dt;
    if (p.heat >= 1) { p.heat = 1; p.over = true; p.blow = false; this.ev('overheat', p.id); return; }
    for (const q of this.players) {
      if (q === p || q.st !== 'alive') continue;
      const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy);
      if (d > W.range + q.r || d < 1) continue;
      if (Math.abs(angDiff(Math.atan2(dy, dx), p.a)) > W.half) continue;
      const f = d / (W.range + q.r), k = 1 - 0.5 * f;
      q.evx += dx / d * W.push * k * dt; q.evy += dy / d * W.push * k * dt;
      const s = Math.hypot(q.evx, q.evy);
      if (s > W.maxEv) { q.evx *= W.maxEv / s; q.evy *= W.maxEv / s; }
      q.lastHit = { by: p.id, t: this.time };
      // Vindmätaren: den som blir kvar i luftströmmen blåses till slut bort (utslagen). Skyddstid räknas inte.
      if (q.inv > 0) continue;
      q.gale += (W.galeIn + (W.galeFar - W.galeIn) * f) * dt; q.galeHit = true; q.galeBy = p.id;
      if (q.gale >= 1) { q.gale = 0; this.koPlayer(q, p.id, 'souffleur', dx / d, dy / d, W.kb); }
    }
    for (const b of this.proj) {
      if (b.k === 'can') continue;
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
      if (d > W.range || d < 1 || Math.abs(angDiff(Math.atan2(dy, dx), p.a)) > W.half) continue;
      const ux = dx / d, uy = dy / d;
      b.x += ux * 260 * dt; b.y += uy * 260 * dt;
      if (b.k === 'potato' || b.k === 'boule') { b.vx += ux * 900 * dt; b.vy += uy * 900 * dt; }
    }
  }

  /* ---------- Projektiler ---------- */
  steerPigeon(b, dt) {
    const W = WEAPONS.pigeon;
    let t = b.tg >= 0 ? this.pmap.get(b.tg) : null;
    if (b.env) {
      const c = this.cheese;
      t = c.state === 'carried' ? this.pmap.get(c.carrier) : null;
    } else if (!t || t.st !== 'alive' || (t.id === b.o && b.age < 0.8)) {
      t = null;
      let bd = 1e9;
      for (const q of this.players) {
        if (q.st !== 'alive' || (q.id === b.o && b.age < 0.8)) continue;
        const d = Math.hypot(q.x - b.x, q.y - b.y);
        if (d < bd) { bd = d; t = q; }
      }
      b.tg = t ? t.id : -1;
    }
    if (t && t.st !== 'ko') {
      const want = Math.atan2(t.y - b.y, t.x - b.x);
      b.ang += clamp(angDiff(want, b.ang), -W.turn * dt, W.turn * dt);
    }
    b.vx = Math.cos(b.ang) * b.speed; b.vy = Math.sin(b.ang) * b.speed;
  }

  stepProj(dt) {
    const arr = this.proj, obs = this.map.obstacles;
    for (let i = arr.length - 1; i >= 0; i--) {
      const b = arr[i];
      b.age += dt; b.life -= dt;
      let gone = false;
      if (b.k === 'pigeon') this.steerPigeon(b, dt);
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.life <= 0) {
        gone = true;
        if (b.k === 'rocket') this.explode(b.x, b.y, WEAPONS.feu.boomR, b.o, 'feu', WEAPONS.feu.kb, 'feu');
        else if (b.k === 'can') this.landCan(b);
      }
      if (!gone && b.k !== 'can' && b.k !== 'pigeon') {
        for (let j = 0; j < obs.length; j++) {
          const ob = obs[j];
          if (this.dead.has(ob.id)) continue;
          const dx = b.x - ob.x, dy = b.y - ob.y, min = ob.r * 0.9 + b.r;
          if (dx * dx + dy * dy < min * min) {
            if (b.k === 'rocket') { this.explode(b.x, b.y, WEAPONS.feu.boomR, b.o, 'feu', WEAPONS.feu.kb, 'feu'); gone = true; break; }
            if (b.k === 'boule' && b.bounces > 0) {
              const d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
              if (vn < 0) { b.vx = (b.vx - 2 * vn * nx) * 0.92; b.vy = (b.vy - 2 * vn * ny) * 0.92; }
              b.x = ob.x + nx * min; b.y = ob.y + ny * min; b.bounces--;
              this.ev('clang', r0(b.x), r0(b.y));
              continue;
            }
            this.damageOb(ob, 1); gone = true; break;
          }
        }
      }
      if (!gone && b.k !== 'can' && b.k !== 'rocket') {
        for (const q of this.players) {
          if (q.st !== 'alive' || (q.id === b.o && b.age < 0.25)) continue;
          const dx = q.x - b.x, dy = q.y - b.y, min = q.r + b.r;
          if (dx * dx + dy * dy >= min * min) continue;
          if (q.guard && WEAPONS[q.weapon].kind === 'pan' &&
            Math.abs(angDiff(Math.atan2(b.y - q.y, b.x - q.x), q.a)) < WEAPONS.poele.guardArc / 2) {
            b.vx = -b.vx; b.vy = -b.vy; b.ang = (b.ang || 0) + Math.PI; b.o = q.id; b.age = 0; b.env = false; b.tg = -1;
            b.life = Math.max(b.life, 1.0);
            this.ev('clang', r0(b.x), r0(b.y));
            continue;
          }
          if (q.inv > 0) continue;
          const sp = Math.hypot(b.vx, b.vy) || 1;
          this.koPlayer(q, b.o, b.cause, b.vx / sp, b.vy / sp, b.kb);
          gone = true; break;
        }
      }
      if (gone) arr.splice(i, 1);
    }
  }

  landCan(b) {
    const W = WEAPONS.epoisses;
    if (!this.map.onLand(b.x, b.y)) { this.ev('splash', r0(b.x), r0(b.y)); return; }
    this.areas.push({ id: this.nid++, k: 'can', o: b.o, x: b.x, y: b.y, r: 30, t: 0, a: 0 });
    this.ev('place', b.o, 'epoisses', r0(b.x), r0(b.y));
  }

  /* ---------- Områden: stinkmoln, minor, studsmattor ---------- */
  stepAreas(dt) {
    const arr = this.areas;
    for (const p of this.players) p.slowStink = false;
    for (let i = arr.length - 1; i >= 0; i--) {
      const a = arr[i];
      a.t += dt;
      let gone = false;
      if (a.k === 'can') {
        if (a.t >= WEAPONS.epoisses.open) {
          a.k = 'cloud'; a.t = 0; a.r = WEAPONS.epoisses.cloudR;
          this.ev('stink', r0(a.x), r0(a.y));
        }
      } else if (a.k === 'cloud') {
        for (const q of this.players) {
          if (q.st !== 'alive') continue;
          if (Math.hypot(q.x - a.x, q.y - a.y) < a.r) { q.slowStink = true; q.stinkBy = a.o; }
        }
        if (a.t >= WEAPONS.epoisses.cloud) gone = true;
      } else if (a.k === 'mine') {
        const W = WEAPONS.champagne;
        if (a.t >= W.life) gone = true;
        else if (a.t >= W.arm) {
          for (const q of this.players) {
            if (q.st !== 'alive' || q.inv > 0) continue;
            if (Math.hypot(q.x - a.x, q.y - a.y) < W.trigR + q.r * 0.3) {
              this.explode(a.x, a.y, W.boomR, a.o, 'champagne', W.kb, 'champagne');
              gone = true; break;
            }
          }
        }
      } else if (a.k === 'pad') {
        const W = WEAPONS.trampoline;
        if (a.t >= W.life) gone = true;
        else {
          for (const q of this.players) {
            if (q.st !== 'alive' || q.padCd > 0) continue;
            if (Math.hypot(q.x - a.x, q.y - a.y) < W.padR) { this.launch(q, a.a); this.ev('boing', r0(a.x), r0(a.y)); }
          }
        }
      }
      if (gone) arr.splice(i, 1);
    }
    const koAfter = WEAPONS.epoisses.koAfter;
    for (const q of this.players) {
      if (q.st !== 'alive') { q.stink = 0; continue; }
      if (q.slowStink) {
        q.stink += dt;
        if (q.stink >= koAfter) { this.koPlayer(q, q.stinkBy, 'epoisses', 0, 0, 0); q.stink = 0; }
      } else q.stink = Math.max(0, q.stink - 1.5 * dt);
    }
  }

  explode(x, y, r, by, cause, kb, kind) {
    this.ev('boom', kind, r0(x), r0(y), r);
    for (const q of this.players) {
      if (q.st !== 'alive' || q.inv > 0) continue;
      const dx = q.x - x, dy = q.y - y, d = Math.hypot(dx, dy);
      if (d < r + q.r * 0.4) this.koPlayer(q, by, cause, d > 1 ? dx / d : 0, d > 1 ? dy / d : -1, kb);
    }
    for (const ob of this.map.obstacles) {
      if (this.dead.has(ob.id)) continue;
      if (Math.hypot(ob.x - x, ob.y - y) < r + ob.r) this.damageOb(ob, 3);
    }
  }

  damageOb(ob, dmg) {
    if (this.dead.has(ob.id)) return;
    const hp = this.obHp.get(ob.id) - dmg;
    this.obHp.set(ob.id, hp);
    if (hp <= 0) { this.dead.add(ob.id); this.ev('crash', ob.id, ob.x, ob.y, ob.t); }
    else this.ev('dent', ob.id, ob.x, ob.y);
  }

  /* ---------- Vy (för renderaren) ---------- */
  viewPlayer(p) {
    const W = WEAPONS[p.weapon], c = this.cheese;
    let e1 = 0, wcd = W.cd ? p.wcd / W.cd : 0, m = 0;
    if (p.st === 'ko') e1 = p.koT; else if (p.st === 'air') e1 = 1 - p.airT / p.airDur;
    if (W.kind === 'blow') { wcd = p.heat; m = p.heat; }
    else if (W.ammo) { m = p.ammo; if (p.reload > 0) wcd = p.reload / W.reload; }
    else if (W.kind === 'mine' || W.kind === 'pad') m = this.areas.filter(a => a.o === p.id && a.k === W.kind).length;
    return {
      id: p.id, x: p.x, y: p.y, vx: p.cvx + p.evx, vy: p.cvy + p.evy, a: p.a,
      st: p.st === 'alive' ? 0 : p.st === 'ko' ? 1 : 2,
      inv: p.inv > 0, carry: c.state === 'carried' && c.carrier === p.id, guard: p.guard, blow: p.blow,
      dash: p.dashT > 0, daze: p.dazeT > 0, slow: p.slowStink, over: p.over,
      sw: p.sw ? p.sw.t : -1, e1, wcd: clamp(wcd, 0, 1), m, stink: clamp(p.stink / WEAPONS.epoisses.koAfter, 0, 1), gale: clamp(p.gale, 0, 1),
      score: p.score, kos: p.kos, hits: p.hits, best: p.best, tk: CFG.tkCd ? p.tkCd / CFG.tkCd : 0
    };
  }

  makeView() {
    const c = this.cheese, E = WEAPONS.epoisses, M = WEAPONS.champagne, T = WEAPONS.trampoline;
    return {
      t: this.time, phase: this.phase, pt: this.pt, mt: this.matchSec,
      players: this.players.map(p => this.viewPlayer(p)),
      cheese: { x: c.x, y: c.y, vx: c.vx, vy: c.vy, st: c.state, by: c.carrier, air: c.air, rot: c.rot },
      proj: this.proj.map(b => ({ id: b.id, k: b.k, x: b.x, y: b.y, vx: b.vx, vy: b.vy, o: b.o, r: b.r })),
      areas: this.areas.map(a => ({
        id: a.id, k: a.k, x: a.x, y: a.y, r: a.r, o: a.o, a: a.a,
        f: a.k === 'can' ? a.t / E.open : a.k === 'cloud' ? 1 - a.t / E.cloud :
          a.k === 'mine' ? Math.min(1, a.t / M.arm) : 1 - a.t / T.life
      })),
      dead: this.dead
    };
  }
}

/* ---------- Kodek: vy <-> kompakt JSON (skickas från värd till klienter) ---------- */
function encodeView(v) {
  const R = Math.round;
  return {
    t: R(v.t * 1000) / 1000, ph: v.phase, pt: R(v.pt * 100) / 100, mt: v.mt,
    p: v.players.map(q => [
      q.id, R(q.x), R(q.y), R(q.vx), R(q.vy), R(q.a * 100), q.st,
      (q.inv ? 1 : 0) | (q.carry ? 2 : 0) | (q.guard ? 4 : 0) | (q.blow ? 8 : 0) | (q.dash ? 16 : 0) | (q.daze ? 32 : 0) | (q.slow ? 64 : 0) | (q.over ? 128 : 0),
      q.sw < 0 ? -1 : R(q.sw * 1000), R(q.e1 * 100), R(q.wcd * 100), R(q.m * 100), R(q.stink * 100),
      R(q.score * 10), q.kos, q.hits, R(q.best * 10), R(q.tk * 100), R(q.gale * 100)
    ]),
    c: [R(v.cheese.x), R(v.cheese.y), R(v.cheese.vx), R(v.cheese.vy), v.cheese.st, v.cheese.by, R(v.cheese.air * 100), R(v.cheese.rot * 100)],
    b: v.proj.map(b => [b.id, b.k, R(b.x), R(b.y), R(b.vx), R(b.vy), b.o, R(b.r)]),
    a: v.areas.map(a => [a.id, a.k, R(a.x), R(a.y), R(a.r), R(a.f * 100), a.o, R(a.a * 100)]),
    d: Array.from(v.dead)
  };
}

function decodeView(s) {
  const f = s.c;
  return {
    t: s.t, phase: s.ph, pt: s.pt, mt: s.mt,
    players: s.p.map(q => ({
      id: q[0], x: q[1], y: q[2], vx: q[3], vy: q[4], a: q[5] / 100, st: q[6],
      inv: !!(q[7] & 1), carry: !!(q[7] & 2), guard: !!(q[7] & 4), blow: !!(q[7] & 8), dash: !!(q[7] & 16),
      daze: !!(q[7] & 32), slow: !!(q[7] & 64), over: !!(q[7] & 128),
      sw: q[8] < 0 ? -1 : q[8] / 1000, e1: q[9] / 100, wcd: q[10] / 100, m: q[11] / 100, stink: q[12] / 100,
      score: q[13] / 10, kos: q[14], hits: q[15], best: q[16] / 10, tk: q[17] / 100, gale: (q[18] || 0) / 100
    })),
    cheese: { x: f[0], y: f[1], vx: f[2], vy: f[3], st: f[4], by: f[5], air: f[6] / 100, rot: f[7] / 100 },
    proj: s.b.map(b => ({ id: b[0], k: b[1], x: b[2], y: b[3], vx: b[4], vy: b[5], o: b[6], r: b[7] })),
    areas: s.a.map(a => ({ id: a[0], k: a[1], x: a[2], y: a[3], r: a[4], f: a[5] / 100, o: a[6], a: a[7] / 100 })),
    dead: new Set(s.d)
  };
}

/* Interpolation mellan två vyer (f = 0..1). Spelare matchas via index (samma ordning hela matchen). */
function lerpView(A, B, f) {
  const out = {
    t: lerp(A.t, B.t, f), phase: B.phase, pt: lerp(A.pt, B.pt, f), mt: B.mt, dead: B.dead,
    players: B.players.map((b, i) => {
      const a = A.players[i];
      if (!a || a.id !== b.id) return b;
      const teleport = Math.abs(b.x - a.x) + Math.abs(b.y - a.y) > 500 || a.st !== b.st && (b.st === 0 || a.st === 0);
      if (teleport) return b;
      return Object.assign({}, b, { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), a: lerpAng(a.a, b.a, f) });
    })
  };
  const ac = A.cheese, bc = B.cheese;
  out.cheese = Math.hypot(bc.x - ac.x, bc.y - ac.y) > 400 ? bc :
    Object.assign({}, bc, { x: lerp(ac.x, bc.x, f), y: lerp(ac.y, bc.y, f), rot: lerp(ac.rot, bc.rot, f) });
  const am = new Map(A.proj.map(b => [b.id, b]));
  out.proj = B.proj.map(b => { const a = am.get(b.id); return a ? Object.assign({}, b, { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) }) : b; });
  const aa = new Map(A.areas.map(b => [b.id, b]));
  out.areas = B.areas.map(b => { const a = aa.get(b.id); return a ? Object.assign({}, b, { f: lerp(a.f, b.f, f) }) : b; });
  return out;
}
