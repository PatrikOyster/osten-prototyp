#!/usr/bin/env node
'use strict';
/* Tester för spelkärnan (js/cfg.js, js/sim.js, js/bots.js) och lobbylogiken i js/net.js (HostSession) – körs i Node utan webbläsare.
   Användning:  node tools/test-core.js [antal_matcher]      (standard 24)
                node tools/test-core.js 60 --stats           (visar balansstatistik per vapen)
                node tools/test-core.js 24 --maps=ile,place  (bot-matcherna spelas bara på de banorna, t.ex. för att jämföra mot äldre version)  */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = vm.createContext({ console, Math, Set, Map, Object, Array, JSON, Number, String, isFinite, Date, URLSearchParams, location: { search: '' }, setTimeout, clearTimeout });
for (const f of ['cfg', 'sim', 'bots', 'net']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
}
const G = vm.runInContext('({CFG, WEAPONS, WEAPON_ORDER, SKINS, Sim, makeMap, coastR, placeR, MAPS, MAP_ORDER, encodeView, decodeView, lerpView, motionStep, botCount, TAU, HostSession, PROTO_VERSION, CANAL, canalSd, canalBridgeSd, CANAL_QUADS, navCell, navField, navSnap, navLos})', ctx);
const { CFG, WEAPONS, WEAPON_ORDER, Sim, makeMap, placeR, MAPS, MAP_ORDER, encodeView, decodeView, lerpView, botCount, HostSession, PROTO_VERSION, CANAL, canalSd, canalBridgeSd, CANAL_QUADS, navCell, navField, navSnap, navLos } = G;

let fails = 0, passes = 0;
function ok(cond, msg) { if (cond) { passes++; } else { fails++; console.log('  FAIL: ' + msg); } }
function section(s) { console.log('\n== ' + s); }
const DT = 1 / 60;

function mk(weapons, opts = {}) {
  const players = weapons.map((w, i) => ({ id: i, name: 'P' + i, skin: i % 8, weapon: w, bot: !!(opts.bots) }));
  const s = new Sim({ seed: opts.seed || 7, players, matchSec: opts.matchSec || 300, map: opts.map });
  s.phase = 'play'; s.pt = s.timeLeft; s.startPlay();
  if (!opts.keepObstacles) s.map.obstacles.length = 0;
  if (!opts.keepCheese) { s.cheese.state = 'sea'; s.cheese.seaT = -1e9; s.cheese.x = 0; s.cheese.y = 0; }
  return s;
}
function run(s, sec) { for (let i = 0; i < Math.round(sec / DT); i++) s.step(DT); }
function put(p, x, y, a) { p.x = x; p.y = y; p.a = a || 0; p.inp.a = a || 0; p.cvx = p.cvy = p.evx = p.evy = 0; p.inv = 0; p.st = 'alive'; }
const press = p => { p.inp.wp++; p.inp.wd = true; };
const release = p => { p.inp.wr++; p.inp.wd = false; };

/* ---------------------------------------------------------------- karta */
section('Karta');
for (const seed of [1, 2, 3, 42, 1234, 99999]) {
  const m = makeMap(seed);
  const cnt = {}; for (const o of m.obstacles) cnt[o.t] = (cnt[o.t] || 0) + 1;
  ok(m.spawns.every(s => m.onLand(s.x, s.y)), `seed ${seed}: alla startplatser på land`);
  ok((cnt.house || 0) === 4 && cnt.tower === 1, `seed ${seed}: by (4 hus) och torn finns (${JSON.stringify(cnt)})`);
  ok((cnt.tree || 0) >= 18, `seed ${seed}: minst 18 träd (${cnt.tree})`);
  ok(m.obstacles.every(o => m.onLand(o.x, o.y)), `seed ${seed}: alla hinder på land`);
  ok(m.obstacles.every(o => Math.hypot(o.x, o.y) > CFG.hillR + o.r), `seed ${seed}: kullen är fri`);
  ok(m.onLand(0, 0) && !m.onLand(2000, 0) && m.onLand(0, m.pier.y1 - 5), `seed ${seed}: land/hav/brygga`);
  const m2 = makeMap(seed);
  ok(JSON.stringify(m.obstacles) === JSON.stringify(m2.obstacles), `seed ${seed}: deterministisk`);
}

/* ---------------------------------------------------------------- torget */
section('Karta: Torget i Paris');
{
  ok(MAP_ORDER.length === 3 && MAP_ORDER.every(k => MAPS[k] && MAPS[k].name && MAPS[k].desc), 'banlistan har tre banor med namn och beskrivning');
  ok(MAP_ORDER.join() === 'ile,place,canal', 'banordningen är ön, torget, fyra öar');
  ok(makeMap(5, 'ile').kind === 'ile' && makeMap(5, 'place').kind === 'place' && makeMap(5, 'canal').kind === 'canal' && makeMap(5).kind === 'ile' && makeMap(5, 'finns-inte').kind === 'ile', 'makeMap väljer bana (okänd bana ger ön)');
  ok(['ile', 'place'].every(k => !makeMap(3, k).nav && !makeMap(3, k).still && !makeMap(3, k).hills && !makeMap(3, k).waterDir && !makeMap(3, k).slotOrder), 'de runda banorna har inga kanalbaneflaggor (gamla kodvägar orörda)');
  const fixed = o => JSON.stringify(o.filter(x => x.t !== 'barrel').map(x => [x.t, x.v, x.x, x.y, x.r]));
  const base = fixed(makeMap(1, 'place').obstacles);
  for (const seed of [1, 2, 3, 42, 1234, 99999, 20261117]) {
    const m = makeMap(seed, 'place'), cnt = {}; for (const o of m.obstacles) cnt[o.t] = (cnt[o.t] || 0) + 1;
    const tag = `torg ${seed}`;
    ok(m.spawns.length === 8 && m.spawns.every(sp => m.onLand(sp.x, sp.y)), `${tag}: åtta startplatser på land`);
    ok(m.obstacles.every(o => m.onLand(o.x, o.y)), `${tag}: alla hinder på land`);
    ok(m.obstacles.every(o => Math.hypot(o.x, o.y) > CFG.hillR + o.r), `${tag}: kullen är fri`);
    ok(m.obstacles.every(o => !m.inPond(o.x, o.y, o.r)), `${tag}: bassängen är fri`);
    ok(new Set(m.obstacles.map(o => o.id)).size === m.obstacles.length, `${tag}: unika hinder-id`);
    let overlap = 0; for (let i = 0; i < m.obstacles.length; i++) for (let j = i + 1; j < m.obstacles.length; j++) { const a = m.obstacles[i], b = m.obstacles[j]; if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - 6) overlap++; }
    ok(overlap === 0, `${tag}: inga överlappande hinder (${overlap})`);
    ok(m.spawns.every(sp => m.obstacles.every(o => Math.hypot(sp.x - o.x, sp.y - o.y) > o.r + 40)), `${tag}: startplatserna är fria`);
    ok(fixed(m.obstacles) === base, `${tag}: fasta delar identiska oavsett seed`);
    ok((cnt.stall || 0) === 6 && (cnt.column || 0) === 4 && cnt.carousel === 1 && cnt.tower === 1 && (cnt.kiosk || 0) === 4 && (cnt.tree || 0) === 12 && (cnt.cafe || 0) === 6, `${tag}: stånd, kolonner, karusell, torn, kiosker, träd och caféer (${JSON.stringify(cnt)})`);
    ok((cnt.barrel || 0) >= 4, `${tag}: minst 4 tunnor (${cnt.barrel})`);
    ok(m.onLand(0, 0) && !m.onLand(2000, 0) && !m.onLand(0, -2000), `${tag}: land/Seine`);
    ok(m.pier === null && m.village === null, `${tag}: ingen brygga eller by`);
    for (let k = 0; k < 24; k++) { const th = k / 24 * G.TAU, r = placeR(th); ok(m.onLand(Math.cos(th) * (r - 12), Math.sin(th) * (r - 12)) && !m.onLand(Math.cos(th) * (r + 12), Math.sin(th) * (r + 12)), `${tag}: kustlinjen stämmer i vinkel ${k}`); }
    ok(JSON.stringify(m.obstacles) === JSON.stringify(makeMap(seed, 'place').obstacles), `${tag}: deterministisk`);
  }
  // Spegelsymmetri: ingen startplats har fördel av läget
  const m = makeMap(7, 'place'), dist = m.spawns.map(sp => Math.hypot(sp.x, sp.y));
  ok(Math.max(...dist) - Math.min(...dist) < 120, `startplatserna ligger ungefär lika långt från kullen (${Math.round(Math.min(...dist))}-${Math.round(Math.max(...dist))})`);
  // Regler på torget
  const s = mk(['baguette', 'poireau'], { map: 'place' });
  ok(s.map.kind === 'place', 'simen kör torget när banan väljs');
  const a = s.players[0], b = s.players[1];
  put(a, 0, -300, 0); put(b, 0, 500, 0); a.inp.mx = 0; a.inp.my = 0;
  s.cheese.state = 'ground'; s.cheese.x = 0; s.cheese.y = 0; s.cheese.carrier = -1; s.cheese.vx = s.cheese.vy = 0; s.cheese.air = 0; s.cheese.seaT = 0;
  // en spelare utanför kajkanten drunknar efter en kort stund
  put(b, 0, placeR(Math.PI / 2) + 60, 0); run(s, 1.4);
  ok(b.st === 'ko' && b.koCause === 'drown', 'den som hamnar i Seine drunknar');
  run(s, 3.2);
  ok(b.st === 'alive' && s.map.onLand(b.x, b.y), 'och återuppstår på land');
  // osten i Seine återställs till kullen
  const c = s.cheese; c.state = 'sea'; c.x = 0; c.y = placeR(Math.PI / 2) + 80; c.seaT = 0; c.carrier = -1;
  run(s, 6.5);
  ok(c.state === 'ground' && Math.hypot(c.x, c.y) < CFG.hillR, 'osten som hamnar i Seine hamnar på kullen efter fem sekunder');
  // kullen trycker ut osten på torget också
  c.x = 20; c.y = 10; c.vx = c.vy = 0; run(s, 2.5);
  ok(Math.hypot(c.x, c.y) > 40, 'kullen på torget puttar ut osten');
  // förstörbara hinder
  const pm = mk(['baguette', 'poireau'], { map: 'place', keepObstacles: true });
  for (const t of ['stall', 'column', 'carousel', 'kiosk']) { const o = pm.map.obstacles.find(q => q.t === t); ok(!!o && o.hp > 0, `${t} har hållfasthet`); }
}

/* ---------------------------------------------------------------- fyra öar */
section('Karta: Fyra öar');
{
  const C = CANAL, mc = makeMap(5, 'canal'), rndq = (() => { let a = 4242; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
  ok(MAPS.canal.name === 'Fyra öar' && /Quatre/.test(MAPS.canal.fr), 'banan heter Fyra öar (med fransk undertitel)');
  ok(mc.nav === true && mc.still === true && Array.isArray(mc.hills) && mc.hills.length === 0 && ['sd', 'waterDir', 'landDir', 'safeDir', 'slotOrder'].every(k => typeof mc[k] === 'function'), 'banan har kanalbaneflaggorna och hjälpfunktionerna');
  // Land och vatten
  ok(mc.onLand(0, 0), 'osten startar på mitten-ön');
  ok(CANAL_QUADS_OK(), 'alla fyra öarnas mittpunkter ligger på land');
  function CANAL_QUADS_OK() { return CANAL_QUADS.every(([sx, sy]) => mc.onLand(sx * C.qcx, sy * C.qcy)); }
  ok([[300, 0], [-300, 0], [0, 300], [0, -300], [198.6, 82.3], [-198.6, -82.3]].every(([x, y]) => !mc.onLand(x, y)), 'kanalerna (korset och ringen) är vatten');
  ok([[900, 0], [0, 800], [-900, 300], [830, 710]].every(([x, y]) => !mc.onLand(x, y)), 'utanför öarna är det hav');
  ok([[155, -155], [-155, -155], [155, 155], [-155, 155], [500, 0], [-500, 0], [0, 440], [0, -440]].every(([x, y]) => mc.onLand(x, y)), 'fyra ekerbroar in mot mitten och fyra ringbroar mellan grannöarna finns');
  // Längs korset går man över exakt en bro (mitt-ön -> kanal -> bro -> kanal) i varje riktning
  for (const [dx, dy, lim] of [[1, 0, 900], [-1, 0, 900], [0, 1, 800], [0, -1, 800]]) {
    let trans = 0, prev = true; for (let t = 0; t <= lim; t += 2) { const l = mc.onLand(dx * t, dy * t); if (prev && !l) trans++; prev = l; }
    ok(trans === 2, `längs kanalen (${dx},${dy}) finns en enda bro (land->vatten ${trans} gånger, väntat 2)`);
  }
  // Spegelsymmetri: ingen ö, bro eller startplats har fördel av läget
  let asym = 0; for (let i = 0; i < 4000; i++) { const x = (rndq() * 2 - 1) * 950, y = (rndq() * 2 - 1) * 850, d = canalSd(x, y); if (Math.abs(d - canalSd(-x, y)) > 1e-9 || Math.abs(d - canalSd(x, -y)) > 1e-9 || Math.abs(d - canalSd(-x, -y)) > 1e-9) asym++; }
  ok(asym === 0, `distansfunktionen är spegelsymmetrisk i x och y (${asym} avvikelser av 4000)`);
  // Hjälpfunktionerna ger rätt håll: vattenriktningen ökar avståndet, landriktningen minskar det
  let wrong = 0;
  for (let i = 0; i < 600; i++) {
    const x = (rndq() * 2 - 1) * 900, y = (rndq() * 2 - 1) * 800, d = canalSd(x, y);
    if (d < -6 && d > -14) { const w = mc.waterDir(x, y), wx = w.x, wy = w.y; if (!(canalSd(x + wx * 4, y + wy * 4) > d)) wrong++; }
    if (d > 6 && d < 60) { const l = mc.landDir(x, y), lx = l.x, ly = l.y; if (!(canalSd(x + lx * 10, y + ly * 10) < d)) wrong++; }
  }
  ok(wrong === 0, `waterDir pekar mot vattnet och landDir mot land (${wrong} fel)`);

  const lay = {};
  for (const seed of [1, 2, 3, 42, 1234, 99999, 20261118]) {
    const m = makeMap(seed, 'canal'), cnt = {}; for (const o of m.obstacles) cnt[o.t] = (cnt[o.t] || 0) + 1, lay[seed] = JSON.stringify(m.obstacles);
    const tag = `fyra öar ${seed}`;
    ok(m.spawns.length === 8 && m.spawns.every(sp => m.onLand(sp.x, sp.y) && -canalSd(sp.x, sp.y) >= 40), `${tag}: åtta startplatser, minst 40 från kanten`);
    ok(m.obstacles.length === 52 && cnt.house === 4 && cnt.tree === 12 && cnt.stall === 8 && cnt.column === 4 && cnt.cafe === 12 && cnt.kiosk === 4 && cnt.barrel === 8, `${tag}: hindren (${JSON.stringify(cnt)})`);
    ok(m.obstacles.every(o => m.onLand(o.x, o.y) && -canalSd(o.x, o.y) >= o.r + 40), `${tag}: alla hinder ligger på land, med fri gångyta mot kanten`);
    ok(m.obstacles.every(o => canalBridgeSd(o.x, o.y) >= o.r + 60 || -canalSd(o.x, o.y) >= o.r + 40 && Math.hypot(o.x, o.y) > C.rm + o.r + 40 && canalBridgeSd(o.x, o.y) >= o.r + 60), `${tag}: broarna och brohuvudena är fria`);
    ok(m.obstacles.every(o => Math.hypot(o.x, o.y) > C.rm + o.r + 40), `${tag}: mitten-ön och bryggorna in mot den är fria`);
    ok(new Set(m.obstacles.map(o => o.id)).size === m.obstacles.length, `${tag}: unika hinder-id`);
    let overlap = 0; for (let i = 0; i < m.obstacles.length; i++) for (let j = i + 1; j < m.obstacles.length; j++) { const a = m.obstacles[i], b = m.obstacles[j]; if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r + 20) overlap++; }
    ok(overlap === 0, `${tag}: hinder ligger inte för tätt (${overlap})`);
    ok(m.spawns.every(sp => m.obstacles.every(o => Math.hypot(sp.x - o.x, sp.y - o.y) > o.r + 80)), `${tag}: startplatserna är fria`);
    ok(m.spawns.every(sp => Math.abs(sp.a - Math.atan2(-sp.y, -sp.x)) < 1e-9), `${tag}: spelarna startar vända mot mitten`);
    // varje hinder har tre spegelbilder med samma typ, storlek och hållfasthet
    ok(m.obstacles.every(o => [[-1, 1], [1, -1], [-1, -1]].every(([a, b]) => m.obstacles.some(q => q.t === o.t && q.r === o.r && q.hp === o.hp && q.x === o.x * a && q.y === o.y * b))), `${tag}: hinder och startplatser är spegelsymmetriska`);
    ok(m.spawns.every(sp => [[-1, 1], [1, -1], [-1, -1]].every(([a, b]) => m.spawns.some(q => q.x === sp.x * a && q.y === sp.y * b))), `${tag}: startplatserna är spegelsymmetriska`);
    ok(m.pier === null && m.village === null && m.pond === null && m.kind === 'canal', `${tag}: ingen brygga, by eller bassäng`);
  }
  ok(Object.values(lay).every(v => v === lay[1]), 'banan är fast: samma hinder oavsett seed');
  { const m = makeMap(9, 'canal'), d = m.spawns.map(sp => Math.hypot(sp.x, sp.y)); ok(Math.max(...d) - Math.min(...d) < 60, `startplatserna ligger ungefär lika långt från osten (${Math.round(Math.min(...d))}-${Math.round(Math.max(...d))})`); }

  // Startordning: en spelare per ö först, så att få spelare inte hamnar på samma ö
  const quad = p => (p.x < 0 ? 0 : 1) + (p.y < 0 ? 0 : 2);
  let slotBad = 0, slotAll = 0;
  for (let seed = 1; seed <= 60; seed++) for (const n of [2, 3, 4, 5, 8]) {
    const pl = []; for (let i = 0; i < n; i++) pl.push({ id: i, name: 'P' + i, skin: i % 8, weapon: 'baguette', bot: false });
    const s = new Sim({ seed, players: pl, matchSec: 60, map: 'canal' });
    const firstFour = s.players.slice(0, Math.min(n, 4)).map(quad);
    if (new Set(firstFour).size !== firstFour.length) slotBad++;
    if (n === 8) { const q = s.players.map(quad), cnt = [0, 0, 0, 0]; q.forEach(x => cnt[x]++); if (cnt.some(x => x !== 2) || new Set(s.players.map(p => p.x + ',' + p.y)).size !== 8) slotAll++; }
  }
  ok(slotBad === 0, `de fyra första spelarna hamnar på fyra olika öar (${slotBad} fel av 300 starter)`);
  ok(slotAll === 0, `åtta spelare får två per ö och olika platser (${slotAll} fel)`);

  // Rättvisa: samma väg (över broarna) från varje ö till osten på mitten
  const sN = mk(['baguette', 'baguette'], { map: 'canal' }), nav = sN.getNav();
  const goal = navSnap(nav, navCell(nav, 0, 0)), dist = navField(nav, goal);
  const cell = (x, y) => navSnap(nav, navCell(nav, x, y));
  const dsp = sN.map.spawns.map(sp => dist[cell(sp.x, sp.y)]);
  ok(dsp.every(d => d > 0), 'alla startplatser nås från mitten över broarna (rutnätet)');
  for (const k of [0, 1]) { const q = [0, 1, 2, 3].map(i => dsp[i * 2 + k]); ok(Math.max(...q) - Math.min(...q) <= 1, `väglängd (rutor) till mitten är lika från alla fyra öar (±1 ruta: målrutan ligger inte exakt i mitten), plats ${k + 1}: ${q.join('/')}`); }
  { let total = 0, reached = 0; for (let c = 0; c < nav.n; c++) if (nav.ok[c]) { total++; if (dist[c] >= 0) reached++; } ok(reached === total, `all gångbar mark hänger ihop med mitten (${reached}/${total} rutor)`); }
  // Man kan inte springa rakt in i mitten från hela ön: bara ekerbron ger en rak väg, från öns flanker går det inte
  ok(CANAL_QUADS.every(([sx, sy]) => [[700, 100], [120, 600], [400, 100], [600, 300]].every(([x, y]) => !navLos(nav, sx * x, sy * y, 0, 0))), 'från öarnas flanker finns ingen rak gångväg till osten: kanalerna ligger i vägen');
  ok(CANAL_QUADS.every(([sx, sy]) => navLos(nav, sx * 330, sy * 330, 0, 0)), '...men ekerbron ger rak väg från öns hörn in mot mitten');
  { // och går man ringbron i stället för mitten tar man sig mellan grannöarna: NO -> SO
    const a = dist[cell(500, -300)], b = navBfsLen(nav, cell(500, -300), cell(500, 300)), viaMid = dist[cell(500, -300)] + dist[cell(500, 300)];
    ok(b > 0 && b < viaMid, `mellan två grannöar är ringbron kortare än vägen via mitten (${b} < ${viaMid} rutor)`);
    function navBfsLen(nv, from, to) { const par = null, G2 = navField(nv, to); return G2[from]; }
  }

  // Rörelse till fots: man kan inte gå ut i kanalen, men över broarna
  const walk = (s, p, mx, my, sec) => { p.inp.mx = mx; p.inp.my = my; let off = 0; for (let i = 0; i < Math.round(sec / DT); i++) { s.step(DT); if (!s.map.onLand(p.x, p.y)) off++; } p.inp.mx = p.inp.my = 0; return off; };
  for (const [sx, sy] of CANAL_QUADS) {
    let s = mk(['baguette', 'baguette'], { map: 'canal' }), p = s.players[0];
    put(p, sx * 300, sy * 100, 0);
    let off = walk(s, p, 0, -sy, 2.0);   // rakt mot kanalen längs x-axeln
    ok(off === 0 && Math.abs(p.y) >= 50 && Math.abs(p.y) < 66 && Math.abs(p.x - sx * 300) < 1, `ö (${sx},${sy}): man stannar vid kanalkanten (y ${p.y.toFixed(1)}, ${off} steg i vatten)`);
    put(p, sx * 300, sy * 100, 0); off = walk(s, p, sx, -sy, 1.5);   // snett in mot kanalen: man glider längs kanten
    ok(off === 0 && Math.abs(p.y) >= 50 && Math.abs(p.x) > 300 + 150, `ö (${sx},${sy}): man glider längs kanalkanten (x ${p.x.toFixed(0)}, y ${p.y.toFixed(1)})`);
    put(p, sx * 100, sy * 300, 0); off = walk(s, p, -sx, 0, 2.0);   // mot den andra kanalen (norr-söder)
    ok(off === 0 && Math.abs(p.x) >= 50 && Math.abs(p.x) < 66, `ö (${sx},${sy}): man stannar vid den andra kanalkanten (x ${p.x.toFixed(1)}, ${off} steg i vatten)`);
    put(p, sx * 300, sy * 330, 0); off = walk(s, p, sx * 0.7, sy * 0.7, 3.0);   // ut mot havet
    ok(off === 0 && canalSd(p.x, p.y) < -6, `ö (${sx},${sy}): man går inte ut i havet (${off} steg i vatten)`);
  }
  {
    let s = mk(['baguette', 'baguette'], { map: 'canal' }), p = s.players[0];
    put(p, 500, -130, Math.PI / 2); let off = walk(s, p, 0, 1, 1.6);
    ok(off === 0 && p.y > 100, `man tar sig över ringbron (norr->söder): y ${p.y.toFixed(0)}, ${off} steg i vatten`);
    put(p, 500, 0, 0); off = walk(s, p, 1, 0, 1.0);
    ok(off === 0 && p.x > 540 && p.x <= 500 + 65 - 5, `man kan inte gå av bron åt sidan (x ${p.x.toFixed(1)})`);
    put(p, 0, 0, 0); off = walk(s, p, 1, -1, 2.0);
    ok(off === 0 && p.x > 250 && p.y < -250, `man tar sig från mitten ut över ekerbron mot nordöst (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
    put(p, 0, 0, 0); off = walk(s, p, 1, 0, 1.0);
    ok(off === 0 && Math.hypot(p.x, p.y) < C.rc, `rakt österut från mitten kommer man bara till ringkanalens kant (${p.x.toFixed(0)}, ${p.y.toFixed(0)})`);
  }
  // Den som hamnar i kanalen drunknar och återuppstår på land
  {
    const s = mk(['baguette', 'poireau'], { map: 'canal' }), b = s.players[1];
    put(b, 300, 0, 0); run(s, 1.4);
    ok(b.st === 'ko' && b.koCause === 'drown', 'den som hamnar i kanalen drunknar');
    run(s, 3.2);
    ok(b.st === 'alive' && s.map.onLand(b.x, b.y) && Math.hypot(b.x, b.y) > 700, 'och återuppstår på land, på en ö långt från mitten');
    // en tackling över kanten knuffar ut offret i vattnet
    const t = mk(['baguette', 'baguette'], { map: 'canal' });
    put(t.players[0], 300, -100, Math.PI / 2); put(t.players[1], 300, -62, Math.PI * 1.5);
    t.players[0].inp.my = 1; t.players[0].inp.a = Math.PI / 2; t.players[0].inp.tk++; run(t, 0.5);
    ok(t.players[1].st === 'ko', 'tackling vid kanalkanten KO:ar målet');
    run(t, 3.5); ok(t.players[1].st === 'alive' && t.map.onLand(t.players[1].x, t.players[1].y), 'det slagna offret återuppstår på land');
  }

  // Osten: ligger stilla på mitten-ön, flyter inte iväg i kanalen och återvänder dit efter fem sekunder
  {
    let s = mk(['baguette', 'baguette'], { map: 'canal', keepCheese: true });
    ok(s.cheese.state === 'ground' && s.cheese.x === 0 && s.cheese.y === 0, 'osten startar stilla i mitten');
    run(s, 30); ok(Math.hypot(s.cheese.x, s.cheese.y) < 50 && s.cheese.state === 'ground' && Math.hypot(s.cheese.vx, s.cheese.vy) < 0.1, `osten ligger kvar nära mitten (${Math.hypot(s.cheese.x, s.cheese.y).toFixed(0)} px; ingen kulle puttar bort den)`);
    s = mk(['baguette', 'baguette'], { map: 'canal' });
    const c = s.cheese; Object.assign(c, { state: 'sea', x: 400, y: 0, seaT: 0, carrier: -1, vx: 0, vy: 0 });
    run(s, 3); ok(c.state === 'sea' && Math.abs(c.x - 400) < 0.5 && Math.abs(c.y) < 0.5, 'osten i kanalen driver inte (ligger kvar där den föll)');
    run(s, 3); ok(c.state === 'ground', 'osten flyter tillbaka efter fem sekunder');
    run(s, 6); ok(c.state === 'ground' && Math.hypot(c.x, c.y) < C.rc - 10 && s.map.onLand(c.x, c.y), `och hamnar på mitten-ön (${Math.hypot(c.x, c.y).toFixed(0)} px från mitten)`);
    let badReset = 0;
    for (let k = 0; k < 60; k++) { const q = mk(['baguette', 'baguette'], { map: 'canal', seed: 100 + k }), e = q.cheese; Object.assign(e, { state: 'sea', x: 600, y: 300 * ((k % 3) - 1), seaT: 0, carrier: -1 }); run(q, 12); if (e.state !== 'ground' || Math.hypot(e.x, e.y) > C.rc - 10) badReset++; }
    ok(badReset === 0, `osten återvänder alltid till mitten-ön (${badReset} fel av 60)`);
  }
  // Osten som tappas vid en kant poppar inåt eller längs bron – aldrig ut i kanalen
  {
    let drops = 0, wet = 0;
    const pts = [];
    for (let k = 0; k < 16; k++) { const a = k / 16 * G.TAU; pts.push([Math.cos(a) * 150, Math.sin(a) * 150]); }
    for (let x = 300; x <= 780; x += 80) pts.push([x, -62], [x, -690]);
    for (let y = -120; y >= -690; y -= 80) pts.push([62, y], [790, y]);
    pts.push([500, -60], [500, 0], [500, 60], [0, 440], [0, -440], [155, -155], [250, -250]);
    for (const [px, py] of pts) {
      if (canalSd(px, py) >= -6) continue;
      for (let rep = 0; rep < 8; rep++) {
        const s = mk(['baguette', 'baguette'], { map: 'canal', seed: 50 + rep, keepCheese: true }), a = s.players[0], w = s.map.waterDir(px, py), kx = w.x, ky = w.y;
        put(a, px, py, 0); Object.assign(s.cheese, { state: 'carried', carrier: 0, x: px, y: py });
        s.koPlayer(a, 1, 'baguette', kx, ky, 500);
        let sea = false; for (let i = 0; i < 300 && !sea; i++) { s.step(DT); if (s.cheese.state === 'sea') sea = true; }
        drops++; if (sea) wet++;
      }
    }
    ok(drops > 300 && wet === 0, `osten tappad vid kant eller bro hamnar aldrig i kanalen (${wet} av ${drops})`);
  }
  // Bärare som slås ut mitt i kanalen (efter studs eller knuff) förlorar osten, den flyter tillbaka till mitten
  {
    const s = mk(['baguette', 'baguette'], { map: 'canal', keepCheese: true }), a = s.players[0];
    put(a, 300, 0, 0); Object.assign(s.cheese, { state: 'carried', carrier: 0, x: 300, y: 0 });
    run(s, 1.2); ok(a.st === 'ko' && a.koCause === 'drown', 'bäraren som hamnar i kanalen drunknar');
    ok(s.cheese.state === 'sea' || s.cheese.state === 'ground', 'osten tappas');
    run(s, 8); ok(s.cheese.state === 'ground' && Math.hypot(s.cheese.x, s.cheese.y) < C.rc, 'och flyter tillbaka till mitten-ön');
  }

  // Botnavigering över broarna
  {
    const s = mk(['baguette', 'baguette'], { map: 'canal' }), p = s.players[0];
    let bad = 0, slow = 0, tot = 0;
    const starts = s.map.spawns.map(sp => [sp.x, sp.y]).concat([[780, -680], [-780, 680], [780, 680], [-780, -680], [500, -300], [-500, 300], [0, 600]].filter(([x, y]) => s.map.onLand(x, y)));
    for (const [sx, sy] of starts) {
      put(p, sx, sy, 0); let t = 0, off = 0;
      for (; t < 14 && Math.hypot(p.x, p.y) > 40; t += DT) {
        const d = s.navDir(p.x, p.y, 0, 0); let mx, my;
        if (d) { mx = d.x; my = d.y; } else { const l = Math.hypot(p.x, p.y) || 1; mx = -p.x / l; my = -p.y / l; }
        p.inp.mx = mx; p.inp.my = my; s.step(DT); if (!s.map.onLand(p.x, p.y)) off++;
      }
      tot++; if (Math.hypot(p.x, p.y) > 40 || off) bad++; if (t > 5.5) slow++;
    }
    ok(bad === 0, `botnavigering: alla ${tot} utgångspunkter tar sig till mitten över broarna utan att hamna i vattnet (${bad} fel)`);
    ok(slow === 0, `och det tar under 5.5 s (${slow} för långsamma)`);
    // ...och tvärtom: mitten -> en avlägsen ö, och mellan grannöar via ringbron
    for (const [gx, gy] of [[700, -515], [-700, 515], [585, 610]]) {
      put(p, 0, 0, 0); let t = 0;
      for (; t < 14 && Math.hypot(p.x - gx, p.y - gy) > 40; t += DT) {
        const d = s.navDir(p.x, p.y, gx, gy); let mx, my;
        if (d) { mx = d.x; my = d.y; } else { const l = Math.hypot(gx - p.x, gy - p.y) || 1; mx = (gx - p.x) / l; my = (gy - p.y) / l; }
        p.inp.mx = mx; p.inp.my = my; s.step(DT);
      }
      ok(Math.hypot(p.x - gx, p.y - gy) <= 40, `botnavigering: från mitten till (${gx},${gy}) på ${t.toFixed(1)} s`);
    }
    put(p, 500, -300, 0);
    let t2 = 0; for (; t2 < 8 && Math.hypot(p.x - 500, p.y - 300) > 40; t2 += DT) { const d = s.navDir(p.x, p.y, 500, 300); let mx = 0, my = 1; if (d) { mx = d.x; my = d.y; } p.inp.mx = mx; p.inp.my = my; s.step(DT); }
    ok(Math.hypot(p.x - 500, p.y - 300) <= 40 && t2 < 4, `botnavigering: över ringbron mellan grannöarna på ${t2.toFixed(1)} s`);
  }
}

/* ---------------------------------------------------------------- botantal */
section('Botantal');
{
  const t = (h, w, exp) => ok(botCount(h, w) === exp, `botCount(${h} människor, önskat ${w}) = ${botCount(h, w)} (väntat ${exp})`);
  t(1, 7, 7); t(1, 0, 1); t(1, 3, 3); t(2, 0, 0); t(2, 7, 6); t(3, 7, 5); t(8, 7, 0); t(7, 0, 0); t(4, 2, 2); t(1, NaN, 1); t(1, -4, 1); t(1, 99, 7);
  for (let h = 1; h <= 8; h++) for (let w = 0; w <= 7; w++) { const n = botCount(h, w); ok(h + n <= CFG.maxPlayers && n >= 0 && (h + n >= 2 || h + n === CFG.maxPlayers), `botCount ${h}/${w} inom gränserna`); }
}

/* ---------------------------------------------------------------- vapen */
section('Tackling, KO och respawn');
{
  const s = mk(['baguette', 'baguette']);
  put(s.players[0], 300, 300, 0); put(s.players[1], 420, 300, Math.PI);
  s.players[0].inp.mx = 1; s.players[0].inp.tk++;
  run(s, 0.5);
  ok(s.players[1].st === 'ko', 'tackling KO:ar målet');
  ok(s.players[0].hits === 1 && s.players[1].kos === 1, 'statistik räknas (träffar/KO)');
  run(s, 2.8);
  ok(s.players[1].st === 'alive' && s.players[1].inv > 0, 'respawn efter ca 2.6 s med skydd');
  ok(Math.hypot(s.players[1].x, s.players[1].y) > 600, 'respawn vid kusten');
}
section('Osten tappas vid träff och kan plockas upp');
{
  const s = mk(['baguette', 'baguette'], { keepCheese: true });
  put(s.players[0], 300, 300, 0); put(s.players[1], 380, 300, Math.PI);
  s.cheese.state = 'carried'; s.cheese.carrier = 1; s.cheese.x = 380; s.cheese.y = 300;
  run(s, 0.2);
  ok(s.cheese.state === 'carried' && s.players[1].carry, 'bäraren har osten');
  press(s.players[0]); run(s, 0.05); release(s.players[0]);
  run(s, 0.3);
  ok(s.players[1].st === 'ko', 'bäraren träffas av baguetten');
  ok(s.cheese.state === 'ground' || s.cheese.state === 'carried', 'osten tappades');
  run(s, 1.5);
  ok(s.cheese.state === 'carried' && s.cheese.carrier === 0 || s.cheese.state === 'ground', 'osten ligger på marken eller har tagits');
}
section('Bäraren kan varken använda vapen eller tackla');
{
  let s = mk(['baguette', 'baguette'], { keepCheese: true });
  put(s.players[0], 300, 300, 0); put(s.players[1], 380, 300, Math.PI);
  s.cheese.state = 'carried'; s.cheese.carrier = 0; s.cheese.x = 300; s.cheese.y = 300;
  press(s.players[0]); run(s, 0.4);
  ok(s.players[1].st === 'alive', 'bäraren kan inte slå med vapnet');
  release(s.players[0]);
  s.players[0].inp.mx = 1; s.players[0].inp.tk++; run(s, 0.4);
  ok(s.players[1].st === 'alive', 'bäraren kan inte tackla (CFG.carrierTackle av)');
  ok(s.players[0].tkCd === 0 && s.players[0].dashT === 0, 'ett blockerat tacklingsförsök laddar inte ur tacklingen');
  ok(s.cheese.state === 'carried' && s.cheese.carrier === 0, 'bäraren behåller osten');
  // Tacklingen sparas inte till senare: ett tryck med osten i famnen ger ingen tackling när man släppt den
  Object.assign(s.cheese, { state: 'ground', carrier: -1, x: -300, y: -300, vx: 0, vy: 0, air: 100 });
  put(s.players[0], 300, 300, 0); put(s.players[1], 380, 300, Math.PI);
  s.players[0].inp.mx = 0; run(s, 0.3);
  ok(s.players[1].st === 'alive', 'inget uppdämt tacklingstryck finns kvar när osten är borta');
  // ...men utan osten fungerar tacklingen som vanligt
  s.players[0].inp.mx = 1; s.players[0].inp.tk++; run(s, 0.4);
  ok(s.players[1].st === 'ko', 'utan osten kan samma spelare tackla igen');

  // En tackling som pågår när man kör över osten avbryts – man ska inte kunna tackla med osten i famnen
  s = mk(['baguette', 'baguette'], { keepCheese: true });
  put(s.players[0], 300, 300, 0); put(s.players[1], 420, 300, Math.PI);
  Object.assign(s.cheese, { state: 'ground', carrier: -1, x: 360, y: 300, vx: 0, vy: 0, air: 0, seaT: 0 });
  s.players[0].inp.mx = 1; s.players[0].inp.tk++; run(s, 0.5);
  ok(s.cheese.state === 'carried' && s.cheese.carrier === 0, 'tacklingen plockar upp osten som ligger i vägen');
  ok(s.players[1].st === 'alive' && s.players[0].dashT === 0, 'tacklingen avbröts vid upptagningen: ingen träffas av en bärare');

  // Växeln: med CFG.carrierTackle = true gäller reglerna från v0.2 igen (bäraren tacklar)
  CFG.carrierTackle = true;
  try {
    s = mk(['baguette', 'baguette'], { keepCheese: true });
    put(s.players[0], 300, 300, 0); put(s.players[1], 380, 300, Math.PI);
    s.cheese.state = 'carried'; s.cheese.carrier = 0; s.cheese.x = 300; s.cheese.y = 300;
    s.players[0].inp.mx = 1; s.players[0].inp.tk++; run(s, 0.4);
    ok(s.players[1].st === 'ko', 'med CFG.carrierTackle = true kan bäraren tackla (växeln fungerar)');
  } finally { CFG.carrierTackle = false; }
}
section('Lobby: lås in, lås upp och byt vapen');
{
  // solo: värdens egen lobby
  const h = new HostSession({ solo: true, name: 'Värd', skin: 0 });
  ok(!h.canStart(), 'kan inte starta utan ett låst vapen');
  h.unpick(); ok(!h.roster[0].locked, 'upplåsning utan låsning gör ingenting');
  h.pick('baguette'); ok(h.roster[0].locked && h.canStart(), 'efter "lås in" går det att starta');
  h.pick('feu'); ok(h.roster[0].weapon === 'baguette', 'man byter inte vapen utan att låsa upp först');
  h.unpick();
  ok(!h.roster[0].locked && !h.canStart() && h.start() === false, 'efter "lås upp" går det inte att starta');
  const st = h.lobbyState(); ok(st.locked === false && st.myWeapon === 'baguette', 'lobbyn visar upplåst men minns tidigare val (förvalt)');
  h.pick('feu'); ok(h.roster[0].locked && h.roster[0].weapon === 'feu', 'man kan låsa in ett annat vapen');
  ok(h.start() === true && h.phase === 'match', 'matchen startar');
  ok(h.sim.players.find(p => p.id === 0).weapon === 'feu', 'matchen startar med det omvalda vapnet');
  h.unpick(); ok(h.roster[0].locked, 'efter matchstart går det inte att låsa upp');
  h.backToLobby(); ok(h.phase === 'lobby' && !h.roster[0].locked && h.roster[0].weapon === null, 'tillbaka i lobbyn börjar alla om utan låst vapen');

  // värd + gäst via låtsasanslutning
  const g = new HostSession({ solo: false, name: 'Värd', skin: 0 });
  const mkConn = () => ({ sent: [], send(m) { this.sent.push(m); }, close() {}, onmessage: null, onclose: null });
  const c1 = mkConn(); g.addConn(c1);
  c1.onmessage({ t: 'hello', v: PROTO_VERSION, name: 'Gäst', skin: 1 });
  const guest = g.roster.find(r => r.conn === c1);
  ok(guest && !guest.locked && c1.sent.some(m => m.t === 'welcome'), 'gästen ansluter');
  const old = mkConn(); g.addConn(old);
  old.onmessage({ t: 'hello', v: PROTO_VERSION - 1, name: 'Gammal', skin: 2 });
  ok(old.sent.some(m => m.t === 'bad') && !g.roster.some(r => r.conn === old), 'en klient med gammal protokollversion nekas (laddar om sidan)');
  g.pick('baguette');
  c1.onmessage({ t: 'pick', w: 'poele' });
  ok(guest.locked && guest.weapon === 'poele' && c1.sent.some(m => m.t === 'picked' && m.w === 'poele'), 'gästen låser in och får bekräftelse');
  ok(g.canStart(), 'alla människor låsta: värden kan starta');
  c1.onmessage({ t: 'unpick' });
  ok(!guest.locked && c1.sent.some(m => m.t === 'unpicked'), 'gästen låser upp och får bekräftelse');
  ok(!g.canStart() && g.start() === false, 'då kan värden inte starta förrän gästen låst igen');
  ok(g.pub().find(p => p.id === guest.id).locked === false, 'de andra ser att gästen väljer igen');
  c1.onmessage({ t: 'pick', w: 'finns-inte' });
  ok(!guest.locked, 'okänt vapen avvisas');
  c1.onmessage({ t: 'pick', w: 'patate' });
  ok(guest.locked && guest.weapon === 'patate' && g.canStart(), 'gästen väljer om (patate) och värden kan starta');
  ok(!/patate|poele|baguette/.test(JSON.stringify(g.pub())), 'valda vapen är hemliga i rumslistan');
  g.unpick(); ok(!g.canStart(), 'värden kan också låsa upp sig själv');
  g.pick('coq'); ok(g.canStart(), '...och välja om');
  ok(g.start() === true, 'start');
  ok(g.sim.players.find(p => p.id === guest.id).weapon === 'patate' && g.sim.players.find(p => p.id === 0).weapon === 'coq', 'simen har de omvalda vapnen');
  c1.onmessage({ t: 'unpick' }); ok(guest.locked, 'efter matchstart ignoreras gästens upplåsning');
  // åskådare (ansluter under matchen) kan inte låsa upp något
  const c3 = mkConn(); g.addConn(c3); c3.onmessage({ t: 'hello', v: PROTO_VERSION, name: 'Sen', skin: 3 });
  const late = g.roster.find(r => r.conn === c3);
  c3.onmessage({ t: 'pick', w: 'baguette' }); c3.onmessage({ t: 'unpick' });
  ok(late.spec && !late.locked && late.weapon === null, 'åskådare kan varken välja eller låsa upp');
}
section('Närstridsvapen');
{
  let s = mk(['baguette', 'baguette']);
  put(s.players[0], 300, 300, 0); put(s.players[1], 300 + 110, 300, Math.PI);
  press(s.players[0]); run(s, 0.4);
  ok(s.players[1].st === 'ko', 'baguetten träffar på 110');
  s = mk(['baguette', 'baguette']);
  put(s.players[0], 300, 300, 0); put(s.players[1], 300 + 240, 300, Math.PI);
  press(s.players[0]); run(s, 0.4);
  ok(s.players[1].st === 'alive', 'baguetten når inte 240');
  s = mk(['poireau', 'baguette']);
  put(s.players[0], 300, 300, 0); put(s.players[1], 300 + 150, 300, Math.PI);
  press(s.players[0]); run(s, 0.8);
  ok(s.players[1].st === 'ko', 'purjolöken sveper över 150');
  s = mk(['coq', 'baguette', 'baguette']);
  put(s.players[0], 300, 300, 0); put(s.players[1], 300, 480, 0); put(s.players[2], 700, 300, 0);
  press(s.players[0]); run(s, 0.1);
  ok(s.players[1].dazeT > 0 || s.players[1].daze, 'gummituppens kacklande gör grannar tveksamma');
  ok(s.players[2].dazeT === 0, 'men inte de långt borta');
}
section('Stekpannan');
{
  const s = mk(['poele', 'patate']);
  put(s.players[0], 300, 300, 0); put(s.players[1], 700, 300, Math.PI);
  s.players[0].inp.wd = true; s.players[0].inp.wp++; run(s, 0.15);
  ok(s.players[0].guard, 'pannan höjs vid håll');
  s.players[1].inp.wp++; run(s, 1.2);
  ok(s.players[0].st === 'alive', 'skyddad mot skott');
  ok(s.players[1].st === 'ko', 'skottet studsade tillbaka och KO:ade skytten');
}
section('Projektilvapen');
{
  let s = mk(['patate', 'baguette']);
  put(s.players[0], 100, 300, 0); put(s.players[1], 600, 300, Math.PI);
  press(s.players[0]); run(s, 0.8);
  ok(s.players[1].st === 'ko', 'potatiskanonen träffar på 500');
  s = mk(['petanque', 'baguette']);
  put(s.players[0], 100, 300, 0); put(s.players[1], 500, 300, Math.PI);
  press(s.players[0]); run(s, 0.05);
  ok(s.proj.length === 2, 'pétanque skjuter två kulor');
  ok(s.players[0].ammo === WEAPONS.petanque.ammo - 1, 'ammo minskar');
  s = mk(['pigeon', 'baguette']);
  put(s.players[0], 100, 300, 0); put(s.players[1], 500, 450, Math.PI);
  press(s.players[0]); run(s, 2.5);
  ok(s.players[1].st === 'ko', 'brevduvan hittar fram');
}
section('Raket, stinkost, mina, blåsare, studsmatta');
{
  let s = mk(['feu', 'baguette']);
  put(s.players[0], 100, 300, 0); put(s.players[1], 400, 300, Math.PI);
  s.players[0].inp.ad = 300; press(s.players[0]); run(s, 1.0);
  ok(s.players[1].st === 'alive', 'raketen har ännu inte exploderat efter 1.0 s');
  run(s, 0.7);
  ok(s.players[1].st === 'ko', 'raketen sprängs vid siktet efter 1.5 s');
  s = mk(['epoisses', 'baguette']);
  put(s.players[0], 100, 300, 0); put(s.players[1], 350, 300, Math.PI);
  s.players[0].inp.ad = 250; press(s.players[0]); run(s, 3.0);
  ok(s.players[1].st === 'alive', 'stinkosten har inte fällt någon efter 3.0 s');
  run(s, 1.6);
  ok(s.players[1].st === 'ko', 'stinkmolnet svimmar den som står kvar');
  s = mk(['champagne', 'baguette']);
  put(s.players[0], 300, 300, 0); put(s.players[1], 700, 300, Math.PI);
  press(s.players[0]); run(s, 0.1); put(s.players[0], 100, 300, 0); run(s, 1.0);
  put(s.players[1], 300, 300, 0); run(s, 0.2);
  ok(s.players[1].st === 'ko', 'champagneminan ploppar när någon kliver nära');
  s = mk(['souffleur', 'baguette']);
  const cr = G.coastR(0);
  put(s.players[0], cr - 330, 0, 0); put(s.players[1], cr - 100, 0, Math.PI);
  s.players[0].inp.wd = true; run(s, 2.2);
  ok(s.players[1].st === 'ko' && s.players[1].koCause === 'drown', 'lövblåsaren blåser ut någon i havet');
  ok(s.players[0].hits === 1, 'blåsaren får poäng för dopp');
  // vindmätaren: den som blir kvar i luftströmmen blåses bort – men inte direkt, och man kan ta sig ur
  s = mk(['souffleur', 'baguette']);
  put(s.players[0], -300, 0, 0); put(s.players[1], -120, 0, Math.PI);
  s.players[0].inp.wd = true; s.players[0].inp.mx = 1; run(s, 0.25);
  ok(s.players[1].st === 'alive' && s.players[1].gale > 0.1 && s.players[1].gale < 1, 'vindmätaren fylls men ingen blåses bort direkt (' + s.players[1].gale.toFixed(2) + ')');
  ok(s.makeView().players[1].gale > 0.1, 'vindmätaren finns i vyn');
  run(s, 2.0);
  ok(s.players[1].st === 'ko' && s.players[1].koCause === 'souffleur', 'den som blir kvar i vinden blåses bort (KO, orsak souffleur)');
  ok(s.players[0].hits === 1 && s.players[1].gale === 0, 'blåsaren får träff och mätaren nollas');
  s = mk(['souffleur', 'baguette']);
  put(s.players[0], -300, 0, 0); put(s.players[1], -120, 0, Math.PI);
  s.players[0].inp.wd = true; s.players[0].inp.mx = 1; s.players[1].inp.my = 1; s.players[1].inp.a = Math.PI / 2;
  run(s, 2.5);
  ok(s.players[1].st === 'alive', 'den som springer åt sidan slipper undan vinden');
  s.players[0].inp.wd = false; s.players[0].inp.mx = 0; run(s, 1.0);
  ok(s.players[1].gale === 0, 'vindmätaren töms när vinden upphör');
  s = mk(['souffleur', 'baguette']);
  put(s.players[0], -300, 0, 0); put(s.players[1], -150, 0, Math.PI); s.players[1].inv = 5;
  s.players[0].inp.wd = true; s.players[0].inp.mx = 1; run(s, 1.5);
  ok(s.players[1].st === 'alive' && s.players[1].gale === 0, 'skyddstid hindrar vindutslagning');
  s = mk(['souffleur', 'baguette']);
  put(s.players[0], -300, 0, 0); put(s.players[1], -150, 0, Math.PI); s.players[1].gale = 0.5;
  { const d2 = decodeView(JSON.parse(JSON.stringify(encodeView(s.makeView())))); ok(Math.abs(d2.players[1].gale - 0.5) < 0.011, 'vindmätaren överlever kodeken'); }
  s = mk(['trampoline', 'baguette']);
  put(s.players[0], 300, 300, 0); put(s.players[1], 700, 300, 0);
  press(s.players[0]); run(s, 0.1);
  s.players[0].inp.wd = false;
  put(s.players[0], 100, 100, 0); // flytta undan
  put(s.players[1], 380, 300, 0); run(s, 0.1);
  ok(s.players[1].st === 'air', 'studsmattan skickar upp den som kliver på');
  run(s, 1.0);
  ok(s.players[1].st === 'alive' && s.players[1].x > 700, 'landar ~420 enheter bort');
}

/* ---------------------------------------------------------------- kodek */
section('Kodek för snapshots');
{
  const s = mk(['baguette', 'patate', 'feu', 'epoisses', 'champagne', 'trampoline', 'pigeon', 'souffleur'], { keepObstacles: true, keepCheese: true, bots: true });
  run(s, 30);
  const v = s.makeView();
  const json = JSON.stringify(encodeView(v));
  const d = decodeView(JSON.parse(json));
  ok(d.players.length === 8 && d.players.every((p, i) => p.id === v.players[i].id), 'spelare bevaras');
  ok(Math.abs(d.players[0].x - v.players[0].x) <= 0.5, 'position bevaras (avrundning)');
  ok(d.cheese.st === v.cheese.st, 'ostens tillstånd bevaras');
  ok(!/NaN|null|undefined/.test(json), 'inga NaN/null i JSON');
  console.log('  snapshot-storlek: ' + json.length + ' byte (8 spelare)');
  const mid = lerpView(d, decodeView(JSON.parse(json)), 0.5);
  ok(mid.players.length === 8, 'lerpView fungerar');
}

/* ---------------------------------------------------------------- bot-matcher */
const N = parseInt(process.argv[2]) || 24, STATS = process.argv.includes('--stats');
const MAPARG = (process.argv.find(a => a.startsWith('--maps=')) || '').slice(7).split(',').filter(k => MAPS[k]), MAP_RUN = MAPARG.length ? MAPARG : MAP_ORDER;
section(`Bot-matcher (${N} st, 8 botar, 5 min, banorna växlar: ${MAP_RUN.join(', ')})`);
const perMap = {}; for (const k of MAP_ORDER) perMap[k] = { n: 0, kos: 0, score: 0, crashes: 0, noCheese: 0, carries: 0, drowned: 0 };
const agg = { carryCause: {}, carries: [], kos: 0, cause: {}, steals: 0, seaTime: 0, crashes: 0, ties: 0, matches: 0, scoreSum: [], noCheese: [], pickups: 0 };
const perW = {}; for (const w of WEAPON_ORDER) perW[w] = { n: 0, wins: 0, score: 0, hits: 0, kos: 0 };
const t0 = Date.now();
for (let m = 0; m < N; m++) {
  const rnd = (() => { let a = m * 7919 + 13; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
  const ws = WEAPON_ORDER.slice(); for (let i = ws.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [ws[i], ws[j]] = [ws[j], ws[i]]; }
  const players = []; for (let i = 0; i < 8; i++) players.push({ id: i, name: 'B' + i, skin: i, weapon: ws[i], bot: true });
  const kind = MAP_RUN[m % MAP_RUN.length], pm = perMap[kind];
  const s = new Sim({ seed: 1000 + m, players, matchSec: 300, map: kind });
  let lastDropper = -9, carryStart = -1, lastCarrier = -1, noCheeseT = 0, steps = 0, bad = null, carryDash = 0;
  while (!s.over && steps < 60 * 400) {
    s.step(DT); steps++;
    for (const e of s.drainEvents()) {
      if (e[0] === 'pick') { carryStart = s.time; if (lastCarrier !== -1 && lastCarrier !== e[1]) agg.steals++; lastCarrier = e[1]; agg.pickups++; }
      else if (e[0] === 'drop' && carryStart >= 0) { agg.carries.push(s.time - carryStart); carryStart = -1; lastDropper = e[1]; }
      else if (e[0] === 'ko') { agg.kos++; pm.kos++; if (e[3] === 'drown') pm.drowned++; agg.cause[e[3]] = (agg.cause[e[3]] || 0) + 1; if (e[1] === lastDropper) { agg.carryCause[e[3]] = (agg.carryCause[e[3]] || 0) + 1; lastDropper = -9; } }
      else if (e[0] === 'crash') { agg.crashes++; pm.crashes++; }
    }
    if (s.phase === 'play' && s.cheese.state !== 'carried') noCheeseT += DT;
    if (!CFG.carrierTackle) for (const p of s.players) if (p.carry && p.dashT > 0) carryDash++;
    if (steps % 120 === 0) {
      for (const p of s.players) if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.cvx) || !isFinite(p.evx)) bad = 'NaN i spelare ' + p.id;
      const c = s.cheese; if (!isFinite(c.x) || !isFinite(c.y)) bad = 'NaN i osten';
      if (bad) break;
    }
  }
  ok(!bad, `match ${m} (${kind}): ${bad || 'inga NaN'}`);
  ok(carryDash === 0, `match ${m}: ingen bärare tacklade (${carryDash} steg)`);
  ok(s.map.kind === kind, `match ${m}: rätt bana (${kind})`);
  ok(s.over && s.results, `match ${m}: avslutades`);
  const total = s.players.reduce((a, p) => a + p.score, 0);
  ok(total <= s.matchSec + 0.5, `match ${m}: summerad ostid (${total.toFixed(1)}) <= matchtid`);
  agg.noCheese.push(noCheeseT); agg.scoreSum.push(total); agg.matches++; pm.n++; pm.score += total; pm.noCheese += noCheeseT;
  ok(s.players.every(p => s.map.onLand(p.x, p.y) || p.st !== 'alive' || Math.hypot(p.x, p.y) < 1600), `match ${m}: spelarna ligger inom banans omgivning`);
  for (const r of s.results.rank) { const w = perW[r.weapon]; w.n++; w.score += r.score; w.hits += r.hits; w.kos += r.kos; }
  perW[s.results.rank[0].weapon].wins++;
  const top = s.results.rank[0].score, second = s.results.rank[1].score;
  if (STATS && m < 5) console.log(`  match ${m}: vinnare ${s.results.rank[0].name} (${s.results.rank[0].weapon}) ${top}s, tvåa ${second}s, KO totalt ${s.players.reduce((a, p) => a + p.kos, 0)}`);
}
const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; };
console.log(`  tid: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
for (const k of MAP_ORDER) { const q = perMap[k]; if (q.n) console.log(`  bana ${k.padEnd(5)}: ${q.n} matcher  KO/match ${(q.kos / q.n).toFixed(0)}  drunknade/match ${(q.drowned / q.n).toFixed(1)}  ostbärartid ${(100 * q.score / q.n / 300).toFixed(0)}%  hinder förstörda/match ${(q.crashes / q.n).toFixed(1)}`); }
console.log(`  ostbärningar: ${agg.carries.length} (snitt ${avg(agg.carries).toFixed(1)} s, median ${med(agg.carries).toFixed(1)} s, max ${Math.max(0, ...agg.carries).toFixed(1)} s)`);
console.log(`  ägarbyten/match: ${(agg.steals / N).toFixed(1)}   KO/match: ${(agg.kos / N).toFixed(0)}  (per spelare och minut: ${(agg.kos / N / 8 / 5).toFixed(1)})`);
console.log(`  andel av matchen någon bär osten: ${(100 * avg(agg.scoreSum) / 300).toFixed(0)}%   hinder förstörda/match: ${(agg.crashes / N).toFixed(1)}`);
const causes = Object.entries(agg.cause).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${(v / N).toFixed(1)}`).join('  ');
console.log('  KO-orsaker per match: ' + causes);
console.log('  ostbärare fälls av (per match): ' + Object.entries(agg.carryCause).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${(v / N).toFixed(1)}`).join('  '));
{ const h = [0, 0, 0, 0, 0, 0]; for (const c of agg.carries) h[c < 2 ? 0 : c < 5 ? 1 : c < 10 ? 2 : c < 20 ? 3 : c < 40 ? 4 : 5]++;
  console.log(`  bärlängd-fördelning: <2s ${h[0]}  2-5s ${h[1]}  5-10s ${h[2]}  10-20s ${h[3]}  20-40s ${h[4]}  >40s ${h[5]}`); }
if (STATS) {
  console.log('\n  vapen        spelade  segrar  vinst%  snittpoäng  träffar/match  KO/match');
  for (const w of WEAPON_ORDER) {
    const x = perW[w]; if (!x.n) continue;
    console.log('  ' + w.padEnd(12) + String(x.n).padStart(7) + String(x.wins).padStart(8) + (100 * x.wins / x.n).toFixed(0).padStart(7) + '%' +
      (x.score / x.n).toFixed(1).padStart(11) + (x.hits / x.n).toFixed(1).padStart(14) + (x.kos / x.n).toFixed(1).padStart(10));
  }
}
console.log(`\n${passes} lyckades, ${fails} misslyckades`);
process.exit(fails ? 1 : 0);
