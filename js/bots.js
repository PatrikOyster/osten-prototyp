'use strict';
/* =====================================================================
   BOT-AI – botarna styrs via samma input-struktur (p.inp) som människor,
   så reglerna är identiska. Används för solo-spel, för att fylla rum till
   8 spelare och när en spelare tappar anslutningen.
   ===================================================================== */

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
  if (rng() < 0.12) ai.strafe = -ai.strafe;
  ai.roleT -= 0.18;
  if (ai.roleT <= 0) { ai.roleT = 5 + rng() * 6; ai.hunter = rng() < ai.aggr; ai.opp = rng() < 0.25; ai.leadK = 0.6 + rng() * 0.6; }
  if (!this.map.onLand(p.x, p.y)) {
    ai.mode = 'swim';
    const l = Math.hypot(p.x, p.y) || 1; ai.dx = -p.x / l; ai.dy = -p.y / l;
    return;
  }
  const carrying = c.state === 'carried' && c.carrier === p.id;
  if (carrying) {
    ai.mode = 'flee';
    let fx = 0, fy = 0;
    for (const q of this.players) {
      if (q === p || q.st !== 'alive') continue;
      const dx = p.x - q.x, dy = p.y - q.y, d = Math.hypot(dx, dy) || 1;
      if (d < 750) { const w = Math.pow((750 - d) / 750, 2) * 3; fx += dx / d * w; fy += dy / d * w; }
    }
    const rd = Math.hypot(p.x, p.y) || 1;
    fx += -p.y / rd * ai.orb * 0.8; fy += p.x / rd * ai.orb * 0.8;
    const edge = coastR(Math.atan2(p.y, p.x)) - 330;
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
    if (ai.stand > 0 && d < ai.stand) {
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
    const rd = Math.hypot(p.x, p.y) || 1, rx = p.x / rd, ry = p.y / rd, dot = dx * rx + dy * ry;
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
    // Bäraren bryr sig bara om dem som är precis intill (för att tackla)
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
