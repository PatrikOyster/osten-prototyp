'use strict';
/* =====================================================================
   ART – all grafik ritas med canvas-primitiver (inga bildfiler).
   Stilen ska vara rolig men inte för putsad: tjocka konturer, lite skeva former.
   ===================================================================== */
const OUT = '#2a1a12';

function oStroke(ctx, w) { ctx.lineWidth = w || 3; ctx.strokeStyle = OUT; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke(); }
function fillOut(ctx, fill, w) { ctx.fillStyle = fill; ctx.fill(); oStroke(ctx, w); }
function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, TAU); }
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}
function star(ctx, x, y, r, rot) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5, rr = i & 1 ? r * 0.45 : r; ctx[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath();
}

/* ---------------- Ost ---------------- */
function drawBeret(ctx, x, y, w, col, tilt) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(tilt || 0);
  ell(ctx, 0, 0, w, w * 0.42); fillOut(ctx, col, 2.5);
  ctx.beginPath(); ctx.arc(-w * 0.25, -w * 0.12, w * 0.5, 3.6, 5.0); ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 3; ctx.stroke();
  ell(ctx, w * 0.12, -w * 0.4, 2.8, 2.8); fillOut(ctx, col, 2);
  ctx.restore();
}

function drawCheese(ctx, x, y, rot, lift, sc) {
  sc = sc || 1;
  ctx.save(); ctx.translate(x, y - (lift || 0)); ctx.scale(sc, sc);
  ell(ctx, 0, 9, 29, 21); fillOut(ctx, '#d99a1e', 3);               // sidan
  ell(ctx, 0, 0, 29, 22); fillOut(ctx, '#ffd23f', 3);               // ovansidan
  ctx.save(); ell(ctx, 0, 0, 27, 20); ctx.clip();
  ctx.fillStyle = '#e6a800';
  const holes = [[-12, -6, 6, 4.5], [10, -9, 5, 3.5], [14, 6, 7, 5], [-8, 8, 5, 3.6], [0, -1, 4, 3], [-19, 2, 4, 3]];
  for (const [hx, hy, rx, ry] of holes) {
    const c = Math.cos(rot), s = Math.sin(rot), px = hx * c - hy * s * 1.0, py = (hx * s + hy * c) * 0.78;
    ell(ctx, px, py, rx, ry); ctx.fill();
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(-4, -3, 19, 3.5, 4.6); ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 3; ctx.stroke();
  drawBeret(ctx, -2, -17, 13, '#1b1b1f', -0.18);                      // osten bär basker, naturligtvis
  ctx.restore();
}

/* ---------------- Vapenikoner ----------------
   Ritas med greppet i (0,0) och vapnet pekande längs +x. sc = skala, t = tid. */
function drawWeaponIcon(ctx, id, x, y, sc, rot, t, st) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot || 0); ctx.scale(sc, sc);
  t = t || 0; st = st || {};
  switch (id) {
    case 'baguette':
      rrect(ctx, -4, -7, 78, 14, 7); fillOut(ctx, '#e3a95c', 3);
      ctx.strokeStyle = '#a8681f'; ctx.lineWidth = 3;
      for (const sx of [14, 32, 50]) { ctx.beginPath(); ctx.moveTo(sx, -5); ctx.lineTo(sx + 8, 3); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(2, -4); ctx.lineTo(66, -4); ctx.strokeStyle = 'rgba(255,240,200,0.5)'; ctx.lineWidth = 2; ctx.stroke();
      break;
    case 'coq':
      ctx.strokeStyle = '#e8892a'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(14, -5); ctx.moveTo(0, 3); ctx.lineTo(14, 6); ctx.stroke();
      ell(ctx, 30, 0, 18, 12); fillOut(ctx, '#f6cf3a', 3);
      ell(ctx, 30, 3, 9, 5); ctx.fillStyle = '#e7b81e'; ctx.fill();
      ell(ctx, 52, -2, 8.5, 8); fillOut(ctx, '#f6cf3a', 3);
      ctx.beginPath(); ctx.moveTo(59, -2); ctx.lineTo(70, 1); ctx.lineTo(59, 3); ctx.closePath(); fillOut(ctx, '#e8892a', 2);
      ctx.beginPath(); ctx.moveTo(49, -9); ctx.quadraticCurveTo(52, -17, 55, -9); ctx.quadraticCurveTo(58, -14, 58, -7); ctx.closePath(); fillOut(ctx, '#d62839', 2);
      ell(ctx, 54, -4, 2.4, 2.4); ctx.fillStyle = '#fff'; ctx.fill(); ell(ctx, 55, -4, 1.1, 1.1); ctx.fillStyle = '#111'; ctx.fill();
      break;
    case 'poele':
      rrect(ctx, -4, -4, 36, 8, 4); fillOut(ctx, '#5b3b24', 3);
      ell(ctx, 52, 0, 23, 23); fillOut(ctx, '#6d737c', 3);
      ell(ctx, 52, 0, 17, 17); ctx.fillStyle = '#4a4f57'; ctx.fill();
      ell(ctx, 47, -5, 6, 4, -0.6); ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill();
      break;
    case 'poireau': {
      const wob = Math.sin(t * 7) * (st.wob === undefined ? 3 : st.wob);
      ctx.beginPath(); ctx.moveTo(-4, -6); ctx.lineTo(28, -6); ctx.quadraticCurveTo(60, -7 + wob, 92, -2 + wob * 1.6);
      ctx.lineTo(92, 6 + wob * 1.6); ctx.quadraticCurveTo(60, 6 + wob, 28, 6); ctx.lineTo(-4, 6); ctx.closePath();
      const g = ctx.createLinearGradient(-4, 0, 92, 0); g.addColorStop(0, '#f3f6e4'); g.addColorStop(0.3, '#f3f6e4'); g.addColorStop(0.36, '#8fcf6a'); g.addColorStop(1, '#4f9c3a');
      fillOut(ctx, g, 3);
      for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(88, wob * 1.6); ctx.quadraticCurveTo(100, (i - 1) * 12 + wob * 2, 108 + i * 3, (i - 1) * 16 + wob * 2); ctx.quadraticCurveTo(98, (i - 1) * 7 + 5, 88, wob * 1.6 + 3); ctx.closePath(); fillOut(ctx, '#5fae43', 2.5); }
      break;
    }
    case 'patate':
      rrect(ctx, 6, 5, 14, 18, 3); fillOut(ctx, '#4a4f57', 3);
      rrect(ctx, -2, -9, 58, 18, 5); fillOut(ctx, '#6b707a', 3);
      ctx.fillStyle = '#ffb703'; ctx.fillRect(20, -9, 7, 18); ctx.fillRect(34, -9, 5, 18);
      ctx.beginPath(); ctx.moveTo(54, -9); ctx.lineTo(66, -14); ctx.lineTo(66, 14); ctx.lineTo(54, 9); ctx.closePath(); fillOut(ctx, '#565b64', 3);
      ell(ctx, 70, 0, 9, 7.5, 0.3); fillOut(ctx, '#b9884f', 2.5);
      break;
    case 'petanque':
      for (const [bx, by] of [[22, -9], [24, 11]]) {
        const g = ctx.createRadialGradient(bx - 4, by - 4, 2, bx, by, 14); g.addColorStop(0, '#f1f4f8'); g.addColorStop(1, '#7c8794');
        ctx.beginPath(); ctx.arc(bx, by, 13, 0, TAU); fillOut(ctx, g, 3);
        ctx.beginPath(); ctx.arc(bx, by, 8, 0.4, 2.2); ctx.strokeStyle = 'rgba(40,40,50,0.5)'; ctx.lineWidth = 1.6; ctx.stroke();
      }
      ctx.beginPath(); ctx.arc(52, 1, 6, 0, TAU); fillOut(ctx, '#e8b84b', 2.5);
      break;
    case 'pigeon': {
      const flap = Math.sin(t * 9) * 0.25;
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-6, -8); ctx.lineTo(-6, 8); ctx.closePath(); fillOut(ctx, '#8e98ab', 2.5);
      ell(ctx, 24, 0, 18, 12); fillOut(ctx, '#aab4c8', 3);
      ell(ctx, 22, 3 + flap * 10, 11, 6, 0.2); ctx.fillStyle = '#7f8aa0'; ctx.fill();
      ell(ctx, 28, -1, 7, 4); ctx.fillStyle = '#6fd3a8'; ctx.fill();
      ell(ctx, 42, -3, 8, 7.5); fillOut(ctx, '#b9c2d4', 3);
      ctx.beginPath(); ctx.moveTo(49, -4); ctx.lineTo(57, -2); ctx.lineTo(49, 0); ctx.closePath(); fillOut(ctx, '#f0a04b', 2);
      ell(ctx, 44, -5, 2.3, 2.3); ctx.fillStyle = '#ff8c1a'; ctx.fill(); ell(ctx, 44.6, -5, 1, 1); ctx.fillStyle = '#111'; ctx.fill();
      break;
    }
    case 'feu':
      rrect(ctx, -6, -2, 50, 4, 2); fillOut(ctx, '#b98a52', 2.5);
      ctx.fillStyle = '#2442a8'; rrect(ctx, 28, -8, 14, 16, 2); fillOut(ctx, '#2442a8', 2.5);
      ctx.fillStyle = '#fff'; ctx.fillRect(41, -7, 12, 14); ctx.fillStyle = '#d62839'; ctx.fillRect(52, -7, 12, 14);
      ctx.beginPath(); ctx.moveTo(63, -8); ctx.lineTo(80, 0); ctx.lineTo(63, 8); ctx.closePath(); fillOut(ctx, '#d62839', 2.5);
      ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.strokeRect(41, -8, 22, 16);
      star(ctx, -6, 0, 5 + Math.sin(t * 30) * 1.5, t * 6); ctx.fillStyle = '#ffd23f'; ctx.fill();
      break;
    case 'epoisses': {
      ell(ctx, 30, 0, 24, 24); fillOut(ctx, '#b07b3c', 3);
      ell(ctx, 30, 0, 18, 18); fillOut(ctx, '#e8a24e', 2.5);
      ctx.beginPath(); ctx.arc(30, 0, 11, 0.2, 2.6); ctx.strokeStyle = 'rgba(160,70,30,0.5)'; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = 'rgba(140,200,50,0.85)'; ctx.lineWidth = 3;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); const bx = 18 + i * 12; ctx.moveTo(bx, -18); for (let k = 1; k <= 4; k++) ctx.lineTo(bx + Math.sin(t * 4 + k + i) * 4, -18 - k * 6); ctx.stroke(); }
      break;
    }
    case 'champagne':
      rrect(ctx, -2, -9, 46, 18, 7); fillOut(ctx, '#1f6b3b', 3);
      ctx.beginPath(); ctx.moveTo(40, -7); ctx.lineTo(62, -4); ctx.lineTo(62, 4); ctx.lineTo(40, 7); ctx.closePath(); fillOut(ctx, '#1f6b3b', 3);
      ctx.fillStyle = '#f2c94c'; rrect(ctx, 52, -6, 14, 12, 2); fillOut(ctx, '#f2c94c', 2.5);
      rrect(ctx, 66, -4, 8, 8, 3); fillOut(ctx, '#d9b27c', 2.5);
      rrect(ctx, 14, -7, 18, 14, 3); fillOut(ctx, '#fff4d6', 2);
      ctx.fillStyle = '#d62839'; ctx.fillRect(19, -2, 8, 4);
      break;
    case 'souffleur':
      rrect(ctx, -4, -13, 24, 26, 5); fillOut(ctx, '#ff9f1c', 3);
      ell(ctx, 8, 0, 6, 6); ctx.fillStyle = '#7a4a06'; ctx.fill();
      rrect(ctx, 18, -7, 38, 14, 4); fillOut(ctx, '#e8e8ea', 3);
      ctx.beginPath(); ctx.moveTo(54, -7); ctx.lineTo(70, -13); ctx.lineTo(70, 13); ctx.lineTo(54, 7); ctx.closePath(); fillOut(ctx, '#ff9f1c', 3);
      rrect(ctx, 20, 7, 10, 16, 3); fillOut(ctx, '#4a4f57', 2.5);
      break;
    case 'trampoline': {
      ell(ctx, 28, 0, 30, 15, 0); fillOut(ctx, '#d62839', 3);
      ell(ctx, 28, 0, 22, 10.5, 0); fillOut(ctx, '#2f6ef0', 2.5);
      ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(42, 0); ctx.moveTo(34, -5); ctx.lineTo(42, 0); ctx.lineTo(34, 5); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
      break;
    }
  }
  ctx.restore();
}

/* ---------------- Karaktärer ---------------- */
function drawShirt(ctx, sk, cx, cy, rx, ry) {
  const c1 = sk.shirt[0], c2 = sk.shirt[1], c3 = sk.shirt[2];
  ctx.save();
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); ctx.clip();
  ctx.fillStyle = c2; ctx.fillRect(cx - rx - 2, cy - ry - 2, rx * 2 + 4, ry * 2 + 4);
  ctx.fillStyle = c1; ctx.strokeStyle = c1;
  const x0 = cx - rx - 2, x1 = cx + rx + 2, y0 = cy - ry - 2, y1 = cy + ry + 2;
  switch (sk.pat) {
    case 'hoop': for (let y = y0 + 1; y < y1; y += 8) ctx.fillRect(x0, y, x1 - x0, 4); break;
    case 'wide': for (let y = y0 + 1; y < y1; y += 14) ctx.fillRect(x0, y, x1 - x0, 7); break;
    case 'vert': for (let x = x0 + 1; x < x1; x += 10) ctx.fillRect(x, y0, 5, y1 - y0); break;
    case 'diag': ctx.translate(cx, cy); ctx.rotate(-0.7); for (let y = -40; y < 40; y += 9) ctx.fillRect(-40, y, 80, 4.5); break;
    case 'chev':
      ctx.lineWidth = 4;
      for (let y = y0; y < y1 + 8; y += 10) { ctx.beginPath(); for (let x = x0, i = 0; x <= x1 + 6; x += 9, i++) { const yy = y + (i & 1 ? 6 : 0); if (i) ctx.lineTo(x, yy); else ctx.moveTo(x, yy); } ctx.stroke(); }
      break;
    case 'wavy':
      ctx.lineWidth = 4;
      for (let y = y0 + 2; y < y1 + 6; y += 9) { ctx.beginPath(); for (let x = x0; x <= x1; x += 3) { const yy = y + Math.sin(x * 0.45) * 3; if (x === x0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); } ctx.stroke(); }
      break;
    case 'tri': { const w = (x1 - x0) / 3; ctx.fillStyle = c1; ctx.fillRect(x0, y0, w, y1 - y0); ctx.fillStyle = c2; ctx.fillRect(x0 + w, y0, w, y1 - y0); ctx.fillStyle = c3; ctx.fillRect(x0 + 2 * w, y0, w + 2, y1 - y0); break; }
  }
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU); oStroke(ctx, 3);
}

function drawFace(ctx, sk, hc, a, o) {
  const dk = '#2b1a10';
  if (o.ko) {
    ctx.strokeStyle = dk; ctx.lineWidth = 2.4;
    for (const ex of [-6.5, 6.5]) { ctx.beginPath(); ctx.moveTo(ex - 3, hc - 4); ctx.lineTo(ex + 3, hc + 2); ctx.moveTo(ex + 3, hc - 4); ctx.lineTo(ex - 3, hc + 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-4, hc + 9); ctx.quadraticCurveTo(0, hc + 5, 4, hc + 9); ctx.stroke();
    return;
  }
  const lx = Math.cos(a) * 2.3, ly = Math.sin(a) * 2;
  if (sk.extra === 'shades') {
    rrect(ctx, -13, hc - 8, 26, 9, 3); fillOut(ctx, '#15151a', 2.5);
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillRect(-10, hc - 6, 4, 2); ctx.fillRect(3, hc - 6, 4, 2);
  } else if (sk.extra === 'bigshades') {
    for (const ex of [-7, 7]) { ctx.beginPath(); ctx.arc(ex, hc - 3, 7, 0, TAU); fillOut(ctx, '#2a1530', 2.5); ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.fillRect(ex - 4, hc - 7, 3, 2); }
    ctx.beginPath(); ctx.moveTo(-1, hc - 4); ctx.lineTo(1, hc - 4); oStroke(ctx, 2.5);
  } else {
    for (const ex of [-6.5, 6.5]) {
      ctx.beginPath(); ctx.arc(ex, hc - 3, 5.2, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill(); oStroke(ctx, 2);
      ctx.beginPath(); ctx.arc(ex + lx, hc - 3 + ly, 2.4, 0, TAU); ctx.fillStyle = '#111'; ctx.fill();
    }
    if (sk.extra === 'lashes') { ctx.strokeStyle = dk; ctx.lineWidth = 1.8; for (const ex of [-6.5, 6.5]) for (const k of [-1, 0, 1]) { ctx.beginPath(); ctx.moveTo(ex + k * 3.5, hc - 7.5); ctx.lineTo(ex + k * 5, hc - 11); ctx.stroke(); } }
    if (sk.extra === 'glasses') { ctx.strokeStyle = '#3a3a48'; ctx.lineWidth = 1.8; for (const ex of [-6.5, 6.5]) { ctx.beginPath(); ctx.arc(ex, hc - 3, 7, 0, TAU); ctx.stroke(); } ctx.beginPath(); ctx.moveTo(-0.5, hc - 3); ctx.lineTo(0.5, hc - 3); ctx.stroke(); }
  }
  // mun
  if (sk.extra === 'lashes') { ell(ctx, 0, hc + 8, 4, 2.4); ctx.fillStyle = '#d62839'; ctx.fill(); }
  else if (o.open) { ell(ctx, 0, hc + 8.5, 3.6, 3); ctx.fillStyle = dk; ctx.fill(); }
  else { ctx.beginPath(); ctx.arc(0, hc + 5, 4.5, 0.2 * Math.PI, 0.8 * Math.PI); ctx.strokeStyle = dk; ctx.lineWidth = 2; ctx.stroke(); }
  if (sk.extra === 'mustache') {
    ctx.strokeStyle = '#2b1a10'; ctx.lineWidth = 4; ctx.beginPath();
    ctx.moveTo(0, hc + 4); ctx.quadraticCurveTo(-7, hc + 8, -12, hc + 2); ctx.moveTo(0, hc + 4); ctx.quadraticCurveTo(7, hc + 8, 12, hc + 2); ctx.stroke();
  }
  if (sk.extra === 'goatee') { ctx.beginPath(); ctx.moveTo(-4, hc + 12); ctx.lineTo(4, hc + 12); ctx.lineTo(0, hc + 19); ctx.closePath(); ctx.fillStyle = '#4a2b17'; ctx.fill(); }
  if (sk.extra === 'hoops') { ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 2.4; for (const ex of [-17.5, 17.5]) { ctx.beginPath(); ctx.arc(ex, hc + 8, 4.5, 0, TAU); ctx.stroke(); } }
}

function drawHairBack(ctx, sk, hc) {
  if (sk.hair && !sk.bun) { ell(ctx, 0, hc + 3, 18.5, 19); fillOut(ctx, sk.hair, 3); }
}
function drawHairFront(ctx, sk, hc) {
  if (sk.curl) { for (let i = 0; i < 9; i++) { const a = Math.PI + i * Math.PI / 8; ctx.beginPath(); ctx.arc(Math.cos(a) * 15, hc - 3 + Math.sin(a) * 15, 6.5, 0, TAU); fillOut(ctx, sk.hair, 2.5); } }
  else if (sk.hair && !sk.bun) { ctx.beginPath(); ctx.moveTo(-17, hc - 3); ctx.quadraticCurveTo(-8, hc - 21, 17, hc - 8); ctx.quadraticCurveTo(2, hc - 12, -17, hc - 3); ctx.closePath(); fillOut(ctx, sk.hair, 2.5); }
  if (sk.bun) {
    ctx.beginPath(); ctx.arc(0, hc - 2, 16.5, Math.PI * 1.08, Math.PI * 1.92); fillOut(ctx, sk.hair, 2.5);
    ctx.beginPath(); ctx.arc(0, hc - 22, 7, 0, TAU); fillOut(ctx, sk.hair, 2.5);
  }
}
function drawHat(ctx, sk, hc) {
  if (sk.hat === 'beret') drawBeret(ctx, 3, hc - 14, 20, sk.hatCol, 0.16);
  else if (sk.hat === 'toque') {
    rrect(ctx, -11, hc - 30, 22, 20, 3); fillOut(ctx, '#fff', 3);
    for (const [bx, by, r] of [[-9, hc - 34, 9], [0, hc - 40, 10], [9, hc - 34, 9]]) { ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); fillOut(ctx, '#fff', 3); }
    ctx.fillStyle = '#e9e9ef'; ctx.fillRect(-10, hc - 14, 20, 4);
  }
}

/* o: { x, y, skin, a, vx, vy, phase, t, id, carry, guard, weapon, sw (s eller -1), ko, koT, air (0..1), inv, daze, stink, blow, dash, alpha, lift } */
function drawCharacter(ctx, o) {
  const sk = SKINS[o.skin % SKINS.length], t = o.t || 0;
  const speed = Math.hypot(o.vx || 0, o.vy || 0), moving = speed > 30 && !o.ko;
  const ph = o.phase || 0;
  const bob = moving ? Math.abs(Math.sin(ph)) * 3.5 : Math.sin(t * 2.4 + (o.id || 0)) * 0.9;
  const lift = o.lift || 0;
  const a = o.a || 0, W = o.weapon ? WEAPONS[o.weapon] : null;
  ctx.save();
  if (o.alpha !== undefined && o.alpha < 1) ctx.globalAlpha = Math.max(0, o.alpha);
  ctx.translate(o.x, o.y);
  const sh = 1 - Math.min(1, lift / 170) * 0.5;
  ctx.fillStyle = 'rgba(30,20,10,0.26)'; ell(ctx, 0, 4, 22 * sh, 9 * sh); ctx.fill();
  // vindmätare på marken runt fötterna: fylls tills man blåses bort
  const gl = o.gale || 0;
  if (gl > 0.03 && !o.ko) {
    ctx.save(); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.ellipse(0, 4, 36, 15, 0, 0, TAU); ctx.strokeStyle = 'rgba(42,26,18,0.55)'; ctx.lineWidth = 10; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 4, 36, 15, 0, 0, TAU); ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 4, 36, 15, 0, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, gl)); ctx.strokeStyle = gl > 0.7 ? '#e63b2e' : '#ff9f1c'; ctx.lineWidth = 6; ctx.stroke();
    ctx.restore();
  }
  ctx.translate(0, -lift);
  if (gl > 0.03 && !o.ko) { // kroppen lutar mot vinden och darrar
    const wa = o.galeA === null || o.galeA === undefined ? 0 : o.galeA;
    ctx.rotate(-Math.cos(wa) * (0.08 + 0.22 * gl) + Math.sin(t * 42) * 0.035 * gl);
  }
  if (o.spin) { ctx.translate(0, -22); ctx.rotate(o.spin); ctx.translate(0, 22); }
  if (o.dash) { ctx.translate(0, 0); ctx.rotate(0); ctx.scale(1.12, 0.9); }
  const hc = -47 - bob;
  const facing = Math.cos(a) >= 0 ? 1 : -1;
  // vapnet bakom kroppen om man siktar uppåt
  const showW = W && !o.ko && !o.carry;
  const hand = { x: Math.cos(a) * 21, y: -21 + Math.sin(a) * 10 - bob * 0.5 };
  const weaponBehind = Math.sin(a) < -0.35;
  const drawWeapon = () => {
    if (!showW) return;
    let rot = a, st = null;
    const s = o.sw;
    if (s !== undefined && s >= 0) {
      if (W.sweep) rot = Sim.prototype.swingAngle(W, { a0: a, windup: W.windup, active: W.active, t: s });
      else { const f = clamp((s - W.windup * 0.2) / (W.windup + W.active), 0, 1); rot = a + (f - 0.5) * W.arc * 0.95; }
      if (W.kind === 'melee' || W.kind === 'pan') {
        const act = s >= W.windup && s <= W.windup + W.active + 0.05;
        if (act) {
          ctx.save(); ctx.translate(hand.x, hand.y);
          ctx.beginPath(); ctx.arc(0, 0, W.range * 0.85, a - W.arc / 2, a + W.arc / 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke(); ctx.restore();
        }
      }
    }
    if (o.guard && W.kind === 'pan') {
      ctx.save(); ctx.translate(hand.x, hand.y);
      drawWeaponIcon(ctx, o.weapon, Math.cos(a) * 16, Math.sin(a) * 8, 1.15, a + Math.PI / 2 * 0, t);
      ctx.restore();
      return;
    }
    drawWeaponIcon(ctx, o.weapon, hand.x, hand.y, 0.95, rot, t, o.over ? { wob: 0 } : null);
    if (W.kind === 'blow' && o.blow) {
      ctx.save(); ctx.translate(hand.x, hand.y); ctx.rotate(a);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) { const d = ((t * 380 + i * 60) % 300) + 70, w2 = (d - 70) * 0.18; ctx.beginPath(); ctx.moveTo(d, -w2 + (i - 2) * 6); ctx.lineTo(d + 30, -w2 + (i - 2) * 7); ctx.stroke(); }
      ctx.restore();
    }
  };
  if (weaponBehind) drawWeapon();
  // fötter
  for (const s of [-1, 1]) { ell(ctx, s * 9, Math.sin(ph + (s > 0 ? Math.PI : 0)) * (moving ? 3.2 : 0), 8.5, 5.2); fillOut(ctx, '#3b2a22', 2.5); }
  // kropp
  const sq = moving ? 1 + Math.sin(ph * 2) * 0.04 : 1;
  ctx.save(); ctx.translate(0, -bob * 0.6); ctx.scale(sq, 2 - sq);
  drawShirt(ctx, sk, 0, -21, 17, 18);
  ctx.restore();
  // andra handen
  if (!o.carry) {
    const ox = -facing * 18, oy = -19 + Math.sin(ph + 1.5) * (moving ? 3 : 0);
    ctx.beginPath(); ctx.arc(ox, oy, 5.6, 0, TAU); fillOut(ctx, sk.skin, 2.5);
  }
  // huvud
  drawHairBack(ctx, sk, hc);
  ell(ctx, 0, hc, 16.5, 16.5 + (moving ? Math.sin(ph * 2) * 0.5 : 0)); fillOut(ctx, sk.skin, 3);
  ctx.beginPath(); ctx.arc(10, hc - 1, 3.2, 0, TAU); ctx.fillStyle = 'rgba(230,120,120,0.35)'; ctx.fill();
  drawFace(ctx, sk, hc, a, { ko: o.ko, open: moving && speed > 200 || o.dash || o.carry });
  drawHairFront(ctx, sk, hc);
  drawHat(ctx, sk, hc);
  if (!weaponBehind) {
    // arm till vapenhanden
    if (showW) {
      const sx = (hand.x >= 0 ? 1 : -1) * 13;
      ctx.beginPath(); ctx.moveTo(sx, -27 - bob * 0.5); ctx.lineTo(hand.x, hand.y); ctx.strokeStyle = OUT; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke();
      ctx.strokeStyle = sk.skin; ctx.lineWidth = 4.2; ctx.stroke();
    }
    drawWeapon();
  }
  if (showW) { ctx.beginPath(); ctx.arc(hand.x, hand.y, 5.8, 0, TAU); fillOut(ctx, sk.skin, 2.5); }
  // bär osten ovanför huvudet
  if (o.carry) {
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 14, -28); ctx.lineTo(s * 21, hc - 22); ctx.strokeStyle = OUT; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke(); ctx.strokeStyle = sk.skin; ctx.lineWidth = 4.2; ctx.stroke(); }
    drawCheese(ctx, 0, hc - 34 - Math.abs(Math.sin(ph)) * (moving ? 3 : 0), o.cheeseRot || 0, 0, 0.82);
  }
  // statuseffekter
  if (o.daze) { for (let i = 0; i < 3; i++) { const aa = t * 5 + i * TAU / 3; star(ctx, Math.cos(aa) * 17, hc - 24 + Math.sin(aa) * 5, 4.4, aa); ctx.fillStyle = '#ffd23f'; ctx.fill(); oStroke(ctx, 1.4); } }
  if (o.stink > 0.05) {
    ctx.strokeStyle = `rgba(130,190,40,${0.35 + o.stink * 0.6})`; ctx.lineWidth = 3;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); const bx = i * 11; ctx.moveTo(bx, hc - 20); for (let k = 1; k <= 4; k++) ctx.lineTo(bx + Math.sin(t * 6 + k + i * 2) * 4, hc - 20 - k * 7); ctx.stroke(); }
  }
  if (o.ko) { for (let i = 0; i < 3; i++) { const aa = t * 6 + i * TAU / 3; star(ctx, Math.cos(aa) * 20, hc - 22 + Math.sin(aa) * 6, 5, aa * 1.3); ctx.fillStyle = '#ffe066'; ctx.fill(); oStroke(ctx, 1.4); } }
  ctx.restore();
}

/* ---------------- Hinder ---------------- */
function drawStripes(ctx, x, y, w, h, n, c1, c2, vertical) {
  const sw = (vertical ? h : w) / n;
  for (let i = 0; i < n; i++) { ctx.fillStyle = i & 1 ? c2 : c1; if (vertical) ctx.fillRect(x, y + i * sw, w, sw + 0.5); else ctx.fillRect(x + i * sw, y, sw + 0.5, h); }
}

const HOUSE_STYLES = {
  boulangerie: { wall: '#f4dfb4', a1: '#d62839', a2: '#fff', sign: 'BOULANGERIE', signBg: '#5a3a1e', signFg: '#ffe9b0', shutter: '#d62839' },
  cafe: { wall: '#f1e6d2', a1: '#1f3a8a', a2: '#fff', sign: 'CAFÉ', signBg: '#1f3a8a', signFg: '#fff', shutter: '#1f3a8a' },
  fromagerie: { wall: '#fbf0c0', a1: '#f2b81f', a2: '#fff', sign: 'FROMAGERIE', signBg: '#8a5a12', signFg: '#fff2b8', shutter: '#2f9e5b' },
  maison: { wall: '#ead9c2', a1: '#2f9e5b', a2: '#fff', sign: '', signBg: '', signFg: '', shutter: '#6b8fd8' }
};

function drawHouse(ctx, ob, t) {
  const st = HOUSE_STYLES[ob.v] || HOUSE_STYLES.maison, w = 116;
  ctx.save(); ctx.translate(ob.x, ob.y);
  ctx.fillStyle = 'rgba(30,20,10,0.25)'; ell(ctx, 6, 14, 74, 20); ctx.fill();
  // vägg
  rrect(ctx, -w / 2, -50, w, 62, 3); fillOut(ctx, st.wall, 3);
  // tak
  ctx.beginPath(); ctx.moveTo(-w / 2 - 9, -48); ctx.lineTo(-w / 2 + 14, -92); ctx.lineTo(w / 2 - 14, -92); ctx.lineTo(w / 2 + 9, -48); ctx.closePath(); fillOut(ctx, '#c85a3a', 3);
  ctx.strokeStyle = 'rgba(80,20,10,0.35)'; ctx.lineWidth = 2;
  for (let y = -84; y < -52; y += 9) { ctx.beginPath(); ctx.moveTo(-w / 2 + 14 - (y + 92) * 0.55 * -1 * 0 - (y + 92) * -0.5, y); ctx.lineTo(w / 2 - 14 + (y + 92) * 0.5, y); ctx.stroke(); }
  rrect(ctx, w / 2 - 36, -108, 14, 26, 2); fillOut(ctx, '#a8473a', 3);
  // skylt
  if (st.sign) {
    rrect(ctx, -38, -47, 76, 14, 3); fillOut(ctx, st.signBg, 2.5);
    ctx.fillStyle = st.signFg; ctx.font = 'bold 9px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(st.sign, 0, -40);
  }
  // fönster + fönsterluckor
  for (const sx of [-1, 1]) {
    rrect(ctx, sx * 36 - 13, -14, 26, 22, 2); fillOut(ctx, '#bfe6ff', 2.5);
    ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx * 36, -14); ctx.lineTo(sx * 36, 8); ctx.moveTo(sx * 36 - 13, -3); ctx.lineTo(sx * 36 + 13, -3); ctx.stroke();
    ctx.fillStyle = st.shutter; ctx.fillRect(sx * 36 - 19, -14, 5, 22); ctx.fillRect(sx * 36 + 14, -14, 5, 22);
  }
  // dörr
  rrect(ctx, -10, -16, 20, 28, 3); fillOut(ctx, '#7b4a28', 3);
  ctx.beginPath(); ctx.arc(5, -2, 1.8, 0, TAU); ctx.fillStyle = '#f2c230'; ctx.fill();
  // markis
  if (st.sign) {
    const ax = -w / 2 + 4, aw = w - 8, ay = -31, ah = 12, n = 9;
    drawStripes(ctx, ax, ay, aw, ah, n, st.a1, st.a2, false);
    const sw = aw / n;
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(ax + sw * (i + 0.5), ay + ah, sw / 2, 0, Math.PI); ctx.fillStyle = i & 1 ? st.a2 : st.a1; ctx.fill(); }
    ctx.strokeStyle = OUT; ctx.lineWidth = 2.5; ctx.strokeRect(ax, ay, aw, ah);
    ctx.beginPath(); for (let i = 0; i < n; i++) ctx.arc(ax + sw * (i + 0.5), ay + ah, sw / 2, 0, Math.PI); ctx.stroke();
  } else {
    ctx.fillStyle = '#7a4a26'; ctx.fillRect(-w / 2 + 14, 4, 30, 6); ctx.fillStyle = '#e63946'; for (let i = 0; i < 5; i++) { ell(ctx, -w / 2 + 19 + i * 6, 2, 3, 3); ctx.fill(); }
  }
  ctx.restore();
}

function drawTower(ctx, ob, t) {
  ctx.save(); ctx.translate(ob.x, ob.y);
  ctx.fillStyle = 'rgba(30,20,10,0.25)'; ell(ctx, 10, 28, 62, 16); ctx.fill();
  const iron = '#6b5a4a', ironL = '#9b8671';
  const leg = s => {
    ctx.beginPath(); ctx.moveTo(s * 52, 30); ctx.quadraticCurveTo(s * 30, -20, s * 18, -80); ctx.lineTo(s * 8, -80); ctx.quadraticCurveTo(s * 18, -20, s * 32, 30); ctx.closePath();
  };
  leg(-1); ctx.fillStyle = iron; ctx.fill(); oStroke(ctx, 2.5);
  leg(1); ctx.fillStyle = iron; ctx.fill(); oStroke(ctx, 2.5);
  // fackverk
  ctx.strokeStyle = ironL; ctx.lineWidth = 1.6;
  for (let i = 0; i < 4; i++) { const y = 24 - i * 26, wd = 44 - i * 9; ctx.beginPath(); ctx.moveTo(-wd, y); ctx.lineTo(wd - 18, y - 26); ctx.moveTo(wd, y); ctx.lineTo(-wd + 18, y - 26); ctx.stroke(); }
  // båge
  ctx.beginPath(); ctx.moveTo(-34, 30); ctx.quadraticCurveTo(0, -22, 34, 30); ctx.lineTo(28, 30); ctx.quadraticCurveTo(0, -12, -28, 30); ctx.closePath(); fillOut(ctx, iron, 2.5);
  // plattformar
  rrect(ctx, -34, -42, 68, 9, 2); fillOut(ctx, '#7d6a58', 2.5);
  rrect(ctx, -18, -92, 36, 8, 2); fillOut(ctx, '#7d6a58', 2.5);
  // övre del
  ctx.beginPath(); ctx.moveTo(-14, -84); ctx.lineTo(-5, -152); ctx.lineTo(5, -152); ctx.lineTo(14, -84); ctx.closePath(); fillOut(ctx, iron, 2.5);
  ctx.strokeStyle = ironL; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-13, -86); ctx.lineTo(4, -118); ctx.moveTo(13, -86); ctx.lineTo(-4, -118); ctx.moveTo(-8, -118); ctx.lineTo(3, -148); ctx.moveTo(8, -118); ctx.lineTo(-3, -148); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -152); ctx.lineTo(0, -178); oStroke(ctx, 2.5);
  // flagga
  const wv = Math.sin(t * 5) * 2;
  ctx.fillStyle = '#2442a8'; ctx.fillRect(1, -178, 9, 8 + wv * 0.2); ctx.fillStyle = '#fff'; ctx.fillRect(10, -178, 9, 8 + wv * 0.3); ctx.fillStyle = '#d62839'; ctx.fillRect(19, -178, 9, 8 + wv * 0.4);
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.strokeRect(1, -178, 27, 8);
  ctx.restore();
}

function drawTree(ctx, ob, t) {
  const sway = Math.sin(t * 1.3 + ob.x * 0.01) * 1.6;
  ctx.save(); ctx.translate(ob.x, ob.y);
  ctx.fillStyle = 'rgba(30,20,10,0.25)'; ell(ctx, 4, 12, 36, 12); ctx.fill();
  rrect(ctx, -6, -22, 12, 34, 4); fillOut(ctx, '#8a5a34', 3);
  ctx.beginPath(); ctx.moveTo(-6, -4); ctx.lineTo(-2, -4); ctx.moveTo(6, -12); ctx.lineTo(2, -12); ctx.strokeStyle = 'rgba(60,30,10,0.6)'; ctx.lineWidth = 2; ctx.stroke();
  for (const [cx, cy, r, col] of [[-17 + sway, -46, 25, '#4b9a38'], [17 + sway, -48, 26, '#58a843'], [sway * 1.4, -66, 28, '#64b84c'], [-4 + sway, -44, 22, '#58a843']]) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); fillOut(ctx, col, 3);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.14)'; ell(ctx, -6 + sway * 1.4, -74, 14, 8, -0.3); ctx.fill();
  ctx.restore();
}

function drawBarrel(ctx, ob) {
  ctx.save(); ctx.translate(ob.x, ob.y);
  ctx.fillStyle = 'rgba(30,20,10,0.25)'; ell(ctx, 3, 9, 24, 8); ctx.fill();
  rrect(ctx, -17, -26, 34, 36, 8); fillOut(ctx, '#a8693a', 3);
  ctx.fillStyle = '#4a4f57'; ctx.fillRect(-17, -16, 34, 4); ctx.fillRect(-17, 0, 34, 4);
  ell(ctx, 0, -26, 17, 7); fillOut(ctx, '#c58a52', 3);
  ctx.strokeStyle = 'rgba(60,30,10,0.4)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(-6, -24); ctx.lineTo(-6, 9); ctx.moveTo(6, -24); ctx.lineTo(6, 9); ctx.stroke();
  ctx.restore();
}

function drawCafeTable(ctx, ob) {
  ctx.save(); ctx.translate(ob.x, ob.y);
  ctx.fillStyle = 'rgba(30,20,10,0.22)'; ell(ctx, 3, 10, 30, 10); ctx.fill();
  rrect(ctx, -2, -22, 4, 30, 2); fillOut(ctx, '#3a3a44', 2.5);
  ell(ctx, 0, -4, 16, 6); fillOut(ctx, '#fff', 3);
  // parasoll
  ctx.save(); ctx.beginPath(); ctx.moveTo(-36, -48); ctx.quadraticCurveTo(0, -84, 36, -48); ctx.quadraticCurveTo(0, -42, -36, -48); ctx.closePath(); ctx.clip();
  drawStripes(ctx, -36, -90, 72, 50, 8, '#d62839', '#fff', false); ctx.restore();
  ctx.beginPath(); ctx.moveTo(-36, -48); ctx.quadraticCurveTo(0, -84, 36, -48); ctx.quadraticCurveTo(0, -42, -36, -48); ctx.closePath(); oStroke(ctx, 3);
  ctx.beginPath(); ctx.moveTo(0, -70); ctx.lineTo(0, -80); oStroke(ctx, 3);
  ctx.restore();
}


/* ---------------- Torget: marknadsstånd, Morris-kolonn, karusell, bouquinistlåda ---------------- */
const STALL_STYLES = {
  fromage: { a1: '#f2b81f', a2: '#fff', goods: 'cheese' },
  fruits: { a1: '#d62839', a2: '#fff', goods: 'fruit' },
  pain: { a1: '#2442a8', a2: '#fff', goods: 'bread' },
  fleurs: { a1: '#2f9e5b', a2: '#fff', goods: 'flowers' }
};

function drawStall(ctx, ob) {
  const st = STALL_STYLES[ob.v] || STALL_STYLES.fruits;
  ctx.save(); ctx.translate(ob.x, ob.y);
  ctx.fillStyle = 'rgba(30,20,10,0.25)'; ell(ctx, 4, 14, 54, 15); ctx.fill();
  for (const sx of [-1, 1]) { rrect(ctx, sx * 44 - 3, -72, 6, 82, 2); fillOut(ctx, '#7a4a26', 2.5); }
  rrect(ctx, -42, -66, 84, 30, 3); fillOut(ctx, '#d9b27c', 2.5);
  rrect(ctx, -46, -12, 92, 30, 4); fillOut(ctx, '#b98a56', 3);
  ctx.fillStyle = 'rgba(60,30,10,0.32)'; for (let i = -3; i <= 3; i++) ctx.fillRect(i * 13 - 1, -6, 2, 20);
  switch (st.goods) {
    case 'cheese':
      for (const [x, y, r] of [[-26, -17, 13], [4, -15, 14], [32, -18, 11]]) { ell(ctx, x, y, r, r * 0.55); fillOut(ctx, '#ffd23f', 2.5); ctx.fillStyle = '#e6a800'; ell(ctx, x - r * 0.3, y, 2, 1.4); ctx.fill(); ell(ctx, x + r * 0.35, y - 1, 1.8, 1.2); ctx.fill(); }
      break;
    case 'fruit':
      for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(-36 + i * 10.3, -17 - (i % 2) * 3, 6, 0, TAU); fillOut(ctx, ['#e63946', '#f4a261', '#8bc34a'][i % 3], 2); }
      break;
    case 'bread':
      for (const [x, a] of [[-25, -0.25], [0, 0.1], [25, -0.12]]) {
        ctx.save(); ctx.translate(x, -16); ctx.rotate(a); rrect(ctx, -16, -5, 32, 10, 5); fillOut(ctx, '#e0a458', 2.5);
        ctx.strokeStyle = 'rgba(120,70,20,0.6)'; ctx.lineWidth = 1.6; for (const sx of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(sx - 2, -3); ctx.lineTo(sx + 2, 3); ctx.stroke(); }
        ctx.restore();
      }
      break;
    case 'flowers':
      for (let i = 0; i < 5; i++) {
        const x = -32 + i * 16; ctx.beginPath(); ctx.moveTo(x, -8); ctx.lineTo(x, -16); ctx.strokeStyle = '#2f7d3a'; ctx.lineWidth = 3; ctx.stroke();
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x + (k - 1) * 5, -21 - (k & 1) * 3, 5.5, 0, TAU); fillOut(ctx, ['#ff7aa8', '#ffd23f', '#c78bff'][(i + k) % 3], 2); }
      }
      break;
  }
  // markis
  const ax0 = -44, ax1 = 44, ay = -106, bx0 = -56, bx1 = 56, by = -64, n = 8;
  ctx.save(); ctx.beginPath(); ctx.moveTo(ax0, ay); ctx.lineTo(ax1, ay); ctx.lineTo(bx1, by); ctx.lineTo(bx0, by); ctx.closePath(); ctx.clip();
  drawStripes(ctx, bx0, ay, bx1 - bx0, by - ay + 2, n, st.a1, st.a2, false); ctx.restore();
  ctx.beginPath(); ctx.moveTo(ax0, ay); ctx.lineTo(ax1, ay); ctx.lineTo(bx1, by); ctx.lineTo(bx0, by); ctx.closePath(); oStroke(ctx, 3);
  const sw = (bx1 - bx0) / n;
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(bx0 + sw * (i + 0.5), by, sw / 2, 0, Math.PI); ctx.fillStyle = i & 1 ? st.a2 : st.a1; ctx.fill(); }
  ctx.beginPath(); for (let i = 0; i < n; i++) ctx.arc(bx0 + sw * (i + 0.5), by, sw / 2, 0, Math.PI); oStroke(ctx, 2.5);
  ctx.restore();
}

function drawColumn(ctx, ob) {
  ctx.save(); ctx.translate(ob.x, ob.y);
  ctx.fillStyle = 'rgba(30,20,10,0.25)'; ell(ctx, 4, 10, 24, 8); ctx.fill();
  rrect(ctx, -15, -72, 30, 82, 5); fillOut(ctx, '#2f8f5b', 3);
  rrect(ctx, -12, -64, 24, 22, 2); fillOut(ctx, '#fdf1c4', 2);
  ctx.fillStyle = '#d62839'; ctx.fillRect(-10, -62, 20, 6); ctx.fillStyle = '#2442a8'; ctx.fillRect(-10, -52, 12, 6);
  rrect(ctx, -12, -36, 24, 20, 2); fillOut(ctx, '#ffd23f', 2);
  ctx.fillStyle = OUT; ctx.fillRect(-9, -33, 18, 2.5); ctx.fillRect(-9, -28, 12, 2.5); ctx.fillRect(-9, -23, 15, 2.5);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(-12, -70, 5, 78);
  ell(ctx, 0, 9, 18, 6.5); fillOut(ctx, '#245f43', 2.5);
  ell(ctx, 0, -73, 18, 7); fillOut(ctx, '#245f43', 2.5);
  ctx.beginPath(); ctx.arc(0, -78, 8, Math.PI, 0); ctx.closePath(); fillOut(ctx, '#245f43', 2.5);
  ctx.beginPath(); ctx.arc(0, -90, 3.6, 0, TAU); fillOut(ctx, '#f2c230', 2);
  ctx.restore();
}

function drawCarousel(ctx, ob, t) {
  ctx.save(); ctx.translate(ob.x, ob.y);
  ctx.fillStyle = 'rgba(30,20,10,0.26)'; ell(ctx, 6, 26, 84, 24); ctx.fill();
  ell(ctx, 0, 14, 76, 28); fillOut(ctx, '#7a4a26', 3);
  ell(ctx, 0, 8, 72, 26); fillOut(ctx, '#e8d6b0', 3);
  ctx.save(); ell(ctx, 0, 8, 72, 26); ctx.clip();
  for (let i = 0; i < 16; i++) { ctx.beginPath(); ctx.moveTo(0, 8); ctx.arc(0, 8, 90, i * TAU / 16, (i + 1) * TAU / 16); ctx.fillStyle = i & 1 ? 'rgba(214,40,57,0.24)' : 'rgba(36,66,168,0.18)'; ctx.fill(); }
  ctx.restore();
  const horse = (hx, hy, col) => {
    ctx.beginPath(); ctx.moveTo(hx, hy - 54); ctx.lineTo(hx, hy + 2); ctx.strokeStyle = '#f2c230'; ctx.lineWidth = 3.6; ctx.stroke();
    for (const lx of [-8, 8]) { ctx.beginPath(); ctx.moveTo(hx + lx, hy - 20); ctx.lineTo(hx + lx * 1.2, hy - 6); ctx.strokeStyle = OUT; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 2.6; ctx.stroke(); }
    ell(ctx, hx, hy - 26, 15, 9); fillOut(ctx, col, 2.5);
    ctx.beginPath(); ctx.moveTo(hx + 8, hy - 30); ctx.lineTo(hx + 17, hy - 44); ctx.lineTo(hx + 25, hy - 40); ctx.lineTo(hx + 18, hy - 24); ctx.closePath(); fillOut(ctx, col, 2.5);
    ctx.beginPath(); ctx.moveTo(hx + 10, hy - 33); ctx.quadraticCurveTo(hx + 4, hy - 42, hx + 12, hy - 46); ctx.strokeStyle = '#8a5a34'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hx - 14, hy - 28); ctx.quadraticCurveTo(hx - 24, hy - 24, hx - 20, hy - 14); ctx.strokeStyle = '#8a5a34'; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(hx + 19, hy - 38, 1.5, 0, TAU); ctx.fillStyle = OUT; ctx.fill();
  };
  horse(-48, 6, '#ffffff'); horse(48, 6, '#ffd23f'); horse(0, -6, '#2442a8');
  rrect(ctx, -7, -86, 14, 98, 3); fillOut(ctx, '#f2c230', 3);
  horse(-26, 26, '#d62839'); horse(28, 26, '#ffffff');
  // tak: kon med ränder och kantskoning
  const apy = -138, bl = -84, br = 84, by = -80, n = 12, sw = (br - bl) / n;
  ctx.save(); ctx.beginPath(); ctx.moveTo(0, apy); ctx.lineTo(br, by); ctx.lineTo(bl, by); ctx.closePath(); ctx.clip();
  for (let i = 0; i < n; i++) { const x0 = bl + sw * i, x1 = bl + sw * (i + 1); ctx.beginPath(); ctx.moveTo(0, apy); ctx.lineTo(x1, by + 2); ctx.lineTo(x0, by + 2); ctx.closePath(); ctx.fillStyle = i & 1 ? '#fff' : '#d62839'; ctx.fill(); }
  ctx.restore();
  ctx.beginPath(); ctx.moveTo(0, apy); ctx.lineTo(br, by); ctx.lineTo(bl, by); ctx.closePath(); oStroke(ctx, 3);
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(bl + sw * (i + 0.5), by, sw / 2, 0, Math.PI); ctx.fillStyle = i & 1 ? '#fff' : '#d62839'; ctx.fill(); }
  ctx.beginPath(); for (let i = 0; i < n; i++) ctx.arc(bl + sw * (i + 0.5), by, sw / 2, 0, Math.PI); oStroke(ctx, 2.5);
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(bl + sw * (i + 0.5), by + sw / 2 - 2, 2.6, 0, TAU); ctx.fillStyle = '#ffe066'; ctx.fill(); }
  ctx.beginPath(); ctx.moveTo(0, apy); ctx.lineTo(0, apy - 28); oStroke(ctx, 2.5);
  const wv = Math.sin((t || 0) * 5) * 2;
  ctx.fillStyle = '#2442a8'; ctx.fillRect(1, apy - 28, 9, 8 + wv * 0.2); ctx.fillStyle = '#fff'; ctx.fillRect(10, apy - 28, 9, 8 + wv * 0.3); ctx.fillStyle = '#d62839'; ctx.fillRect(19, apy - 28, 9, 8 + wv * 0.4);
  ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.strokeRect(1, apy - 28, 27, 8);
  ctx.restore();
}

function drawKiosk(ctx, ob) {
  ctx.save(); ctx.translate(ob.x, ob.y);
  ctx.fillStyle = 'rgba(30,20,10,0.25)'; ell(ctx, 3, 10, 36, 10); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-34, -22); ctx.lineTo(-28, -52); ctx.lineTo(28, -52); ctx.lineTo(34, -22); ctx.closePath(); fillOut(ctx, '#3f8a64', 3);
  const cols = ['#d62839', '#2442a8', '#f2c230', '#fff4d6', '#8a5a34', '#2f9e5b'];
  for (let i = 0; i < 10; i++) { const x = -25 + i * 5.4, h = 14 + (i * 7) % 6; ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(x, -22 - h, 4.8, h); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.strokeRect(x, -22 - h, 4.8, h); }
  rrect(ctx, -34, -24, 68, 34, 3); fillOut(ctx, '#2d6a4f', 3);
  ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(-31, -21, 62, 4);
  rrect(ctx, -5, -12, 10, 8, 2); fillOut(ctx, '#f2c230', 2);
  ctx.restore();
}

function drawObstacle(ctx, ob, t) {
  switch (ob.t) {
    case 'house': drawHouse(ctx, ob, t); break;
    case 'tower': drawTower(ctx, ob, t); break;
    case 'tree': drawTree(ctx, ob, t); break;
    case 'barrel': drawBarrel(ctx, ob); break;
    case 'cafe': drawCafeTable(ctx, ob); break;
    case 'stall': drawStall(ctx, ob); break;
    case 'column': drawColumn(ctx, ob); break;
    case 'carousel': drawCarousel(ctx, ob, t); break;
    case 'kiosk': drawKiosk(ctx, ob); break;
  }
}
/* Vilket y som ska användas för djupsortering (sprites ritas uppåt från basen) */
function obstacleBase(ob) { return ob.y + (ob.t === 'house' ? 12 : ob.t === 'tower' ? 28 : ob.t === 'carousel' ? 22 : ob.t === 'stall' ? 16 : ob.t === 'tree' ? 12 : 10); }

function drawRubble(ctx, ob) {
  const rng = mulberry32(ob.id * 7919 + 3);
  ctx.save(); ctx.translate(ob.x, ob.y);
  const big = ob.t === 'house' || ob.t === 'tower' || ob.t === 'carousel';
  const n = big ? 11 : ob.t === 'stall' ? 8 : 6, sc = ob.t === 'house' ? 52 : ob.t === 'carousel' ? 56 : ob.t === 'tower' ? 40 : ob.t === 'stall' ? 32 : 22;
  const cols = { house: ['#a8473a', '#c85a3a', '#e8d6b0', '#7a5a40'], tower: ['#6b5a4a', '#8a7762', '#4a3e34'],
    tree: ['#7a4c2a', '#4b9a38', '#64b84c'], barrel: ['#a8693a', '#c58a52', '#4a4f57'],
    stall: ['#d62839', '#fff', '#b98a56', '#f2b81f'], column: ['#2f8f5b', '#fdf1c4', '#d62839'],
    carousel: ['#d62839', '#fff', '#f2c230', '#2442a8'], kiosk: ['#2d6a4f', '#8a5a34', '#fff4d6', '#d62839'] }[ob.t] || ['#d62839', '#fff', '#3a3a44'];
  for (let i = 0; i < n; i++) {
    const a = rng() * TAU, d = Math.sqrt(rng()) * sc, w = 6 + rng() * 11, h = 4 + rng() * 7;
    ctx.save(); ctx.translate(Math.cos(a) * d, Math.sin(a) * d * 0.55); ctx.rotate(rng() * 3);
    rrect(ctx, -w / 2, -h / 2, w, h, 2); fillOut(ctx, cols[(rng() * cols.length) | 0], 2); ctx.restore();
  }
  ctx.restore();
}

/* ---------------- Projektiler och områden ---------------- */
function drawProjectile(ctx, b, t, lift) {
  lift = lift || 0;
  ctx.save(); ctx.translate(b.x, b.y);
  const ang = Math.atan2(b.vy, b.vx);
  switch (b.k) {
    case 'potato':
      ctx.fillStyle = 'rgba(30,20,10,0.22)'; ell(ctx, 0, 14, 11, 4); ctx.fill();
      ctx.rotate(t * 9); ell(ctx, 0, -8, 13, 10.5, 0.3); fillOut(ctx, '#b9884f', 3);
      ctx.fillStyle = '#8a5f33'; for (const [px, py] of [[-4, -10], [5, -6], [1, -3]]) { ell(ctx, px, py, 1.6, 1.2); ctx.fill(); }
      break;
    case 'boule': {
      ctx.fillStyle = 'rgba(30,20,10,0.22)'; ell(ctx, 0, 12, 10, 4); ctx.fill();
      const g = ctx.createRadialGradient(-3, -13, 2, 0, -9, 12); g.addColorStop(0, '#f4f7fb'); g.addColorStop(1, '#7c8794');
      ctx.beginPath(); ctx.arc(0, -9, 11, 0, TAU); fillOut(ctx, g, 3);
      ctx.save(); ctx.translate(0, -9); ctx.rotate(t * 11); ctx.beginPath(); ctx.arc(0, 0, 6.5, 0.4, 2.3); ctx.strokeStyle = 'rgba(40,40,50,0.55)'; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore();
      break;
    }
    case 'pigeon': {
      const env = b.o < 0, big = env ? 1.25 : 1, flap = Math.sin(t * 28 + b.id) * 0.9;
      ctx.fillStyle = 'rgba(30,20,10,0.2)'; ell(ctx, 0, 24, 14, 5); ctx.fill();
      ctx.translate(0, -16); ctx.scale(big * (Math.cos(ang) >= 0 ? 1 : -1), big);
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(-20, -4); ctx.lineTo(-20, 5); ctx.closePath(); fillOut(ctx, env ? '#5d6678' : '#8e98ab', 2.5);
      ell(ctx, 0, 0, 14, 9); fillOut(ctx, env ? '#7b869b' : '#aab4c8', 3);
      ctx.save(); ctx.translate(-2, -2); ctx.rotate(-flap); ell(ctx, 0, -9, 7, 12, 0.2); fillOut(ctx, env ? '#566074' : '#7f8aa0', 2.5); ctx.restore();
      ell(ctx, 13, -4, 6.5, 6); fillOut(ctx, env ? '#8793a8' : '#b9c2d4', 3);
      ctx.beginPath(); ctx.moveTo(18, -5); ctx.lineTo(25, -3); ctx.lineTo(18, -1); ctx.closePath(); fillOut(ctx, '#f0a04b', 2);
      ell(ctx, 14, -6, 2, 2); ctx.fillStyle = env ? '#ff2a2a' : '#ff8c1a'; ctx.fill();
      if (env) drawBeret(ctx, 11, -13, 8, '#1b1b1f', 0.3);
      break;
    }
    case 'rocket': {
      ctx.fillStyle = 'rgba(30,20,10,0.2)'; ell(ctx, 0, 14, 12, 4); ctx.fill();
      ctx.translate(0, -12 - lift); ctx.rotate(ang);
      ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(-26 - Math.sin(t * 40) * 4, -4); ctx.lineTo(-30 - Math.sin(t * 33) * 6, 0); ctx.lineTo(-26, 4); ctx.closePath(); ctx.fillStyle = '#ffb703'; ctx.fill();
      ctx.fillStyle = '#2442a8'; rrect(ctx, -14, -6, 10, 12, 2); fillOut(ctx, '#2442a8', 2.5);
      ctx.fillStyle = '#fff'; ctx.fillRect(-4, -5.5, 9, 11); ctx.fillStyle = '#d62839'; ctx.fillRect(5, -5.5, 9, 11);
      ctx.beginPath(); ctx.moveTo(13, -6); ctx.lineTo(24, 0); ctx.lineTo(13, 6); ctx.closePath(); fillOut(ctx, '#d62839', 2.5);
      ctx.strokeStyle = OUT; ctx.lineWidth = 2.2; ctx.strokeRect(-4, -6, 18, 12);
      break;
    }
    case 'can':
      ctx.fillStyle = 'rgba(30,20,10,0.2)'; ell(ctx, 0, 14, 12, 4); ctx.fill();
      ctx.translate(0, -22 - lift); ctx.rotate(t * 8); ell(ctx, 0, 0, 14, 14); fillOut(ctx, '#b07b3c', 3); ell(ctx, 0, 0, 9.5, 9.5); fillOut(ctx, '#e8a24e', 2.5);
      break;
  }
  ctx.restore();
}

function drawArea(ctx, a, t) {
  ctx.save(); ctx.translate(a.x, a.y);
  switch (a.k) {
    case 'can':
      ctx.fillStyle = 'rgba(30,20,10,0.2)'; ell(ctx, 2, 6, 24, 9); ctx.fill();
      ctx.translate(0, -4 + Math.sin(t * 20) * a.f * 1.5);
      ell(ctx, 0, 3, 23, 18); fillOut(ctx, '#b07b3c', 3); ell(ctx, 0, 0, 20, 15); fillOut(ctx, '#e8a24e', 2.5);
      ctx.strokeStyle = `rgba(140,200,50,${0.3 + a.f * 0.6})`; ctx.lineWidth = 3;
      for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(i * 11, -12); for (let k = 1; k <= 4; k++) ctx.lineTo(i * 11 + Math.sin(t * 5 + k + i) * 4, -12 - k * 6 * (0.4 + a.f)); ctx.stroke(); }
      break;
    case 'cloud': {
      const al = 0.18 + 0.4 * Math.min(1, a.f * 2.5);
      for (let i = 0; i < 7; i++) {
        const aa = i * TAU / 7 + t * 0.6, rr = a.r * 0.58 + Math.sin(t * 2 + i * 1.7) * 9;
        const g = ctx.createRadialGradient(Math.cos(aa) * rr * 0.5, Math.sin(aa) * rr * 0.5, 4, Math.cos(aa) * rr * 0.5, Math.sin(aa) * rr * 0.5, a.r * 0.55);
        g.addColorStop(0, `rgba(160,210,60,${al})`); g.addColorStop(1, 'rgba(160,210,60,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(Math.cos(aa) * rr * 0.5, Math.sin(aa) * rr * 0.5, a.r * 0.55, 0, TAU); ctx.fill();
      }
      ctx.strokeStyle = `rgba(120,170,30,${al + 0.15})`; ctx.lineWidth = 3;
      for (let i = 0; i < 6; i++) { const aa = i * 1.05 + 0.3, d = a.r * 0.5; ctx.beginPath(); const bx = Math.cos(aa) * d, by = Math.sin(aa) * d; ctx.moveTo(bx, by); for (let k = 1; k <= 4; k++) ctx.lineTo(bx + Math.sin(t * 4 + k + i) * 5, by - k * 9 - ((t * 20 + i * 11) % 14)); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(0, 0, a.r, 0, TAU); ctx.setLineDash([8, 8]); ctx.strokeStyle = 'rgba(110,160,30,0.45)'; ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]);
      break;
    }
    case 'mine': {
      const armed = a.f >= 1, sh = armed ? Math.sin(t * 25) * 1.2 : 0;
      ctx.beginPath(); ctx.arc(0, 0, a.r, 0, TAU); ctx.setLineDash([5, 7]); ctx.strokeStyle = armed ? 'rgba(214,40,57,0.5)' : 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(30,20,10,0.22)'; ell(ctx, 2, 6, 14, 6); ctx.fill();
      ctx.globalAlpha = armed ? 1 : 0.55 + a.f * 0.3;
      ctx.translate(sh, 0);
      rrect(ctx, -9, -30, 18, 34, 7); fillOut(ctx, '#1f6b3b', 3);
      rrect(ctx, -5, -42, 10, 16, 3); fillOut(ctx, '#f2c94c', 2.5);
      rrect(ctx, -4, -48, 8, 8, 3); fillOut(ctx, '#d9b27c', 2.5);
      rrect(ctx, -7, -20, 14, 12, 2); fillOut(ctx, '#fff4d6', 2);
      if (armed) { ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(Math.sin(t * 7 + i * 2) * 6, -50 - ((t * 30 + i * 9) % 14), 2.2, 0, TAU); ctx.fill(); } }
      break;
    }
    case 'pad': {
      ctx.fillStyle = 'rgba(30,20,10,0.22)'; ell(ctx, 3, 6, 58, 24); ctx.fill();
      ell(ctx, 0, 0, a.r, a.r * 0.62); fillOut(ctx, '#d62839', 3);
      ctx.save(); ell(ctx, 0, 0, a.r, a.r * 0.62); ctx.clip();
      for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, a.r + 4, i * TAU / 8, (i + 1) * TAU / 8); ctx.fillStyle = i & 1 ? '#fff' : '#2442a8'; ctx.fill(); }
      ctx.restore(); ell(ctx, 0, 0, a.r, a.r * 0.62); oStroke(ctx, 3);
      ell(ctx, 0, 0, a.r * 0.72, a.r * 0.45); fillOut(ctx, '#2f6ef0', 2.5);
      ctx.save(); ctx.rotate(a.a); ctx.scale(1, 0.62);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 0; i < 2; i++) { const o = ((t * 40 + i * 24) % 48) - 24; ctx.beginPath(); ctx.moveTo(o - 8, -12); ctx.lineTo(o + 8, 0); ctx.lineTo(o - 8, 12); ctx.stroke(); }
      ctx.restore();
      if (a.f < 0.2 && (t * 6 | 0) % 2) { ctx.globalAlpha = 0.5; ell(ctx, 0, 0, a.r, a.r * 0.62); ctx.fillStyle = '#fff'; ctx.fill(); }
      break;
    }
  }
  ctx.restore();
}

/* ---------------- Små flaggstänger vid startplatserna ---------------- */
function drawFlagPole(ctx, x, y, t, flip) {
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = 'rgba(30,20,10,0.2)'; ell(ctx, 2, 3, 9, 4); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 2); ctx.lineTo(0, -52); ctx.strokeStyle = '#5b3b24'; ctx.lineWidth = 4; ctx.stroke();
  const wv = Math.sin(t * 4 + x) * 2.5;
  ctx.fillStyle = '#2442a8'; ctx.fillRect(2, -52, 9, 12 + wv * 0.2); ctx.fillStyle = '#fff'; ctx.fillRect(11, -52, 9, 12 + wv * 0.4); ctx.fillStyle = '#d62839'; ctx.fillRect(20, -52, 9, 12 + wv * 0.6);
  ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.strokeRect(2, -52, 27, 12);
  ctx.restore();
}
