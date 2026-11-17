#!/usr/bin/env node
'use strict';
/* Tester för spelkärnan (js/cfg.js, js/sim.js, js/bots.js) – körs i Node utan webbläsare.
   Användning:  node tools/test-core.js [antal_matcher]      (standard 24)
                node tools/test-core.js 60 --stats           (visar balansstatistik per vapen)  */
const fs = require('fs'), vm = require('vm'), path = require('path');
const ctx = vm.createContext({ console, Math, Set, Map, Object, Array, JSON, Number, String, isFinite, Date });
for (const f of ['cfg', 'sim', 'bots']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f + '.js' });
}
const G = vm.runInContext('({CFG, WEAPONS, WEAPON_ORDER, SKINS, Sim, makeMap, coastR, placeR, MAPS, MAP_ORDER, encodeView, decodeView, lerpView, motionStep, botCount, TAU})', ctx);
const { CFG, WEAPONS, WEAPON_ORDER, Sim, makeMap, placeR, MAPS, MAP_ORDER, encodeView, decodeView, lerpView, botCount } = G;

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
  ok(MAP_ORDER.length === 2 && MAP_ORDER.every(k => MAPS[k] && MAPS[k].name && MAPS[k].desc), 'banlistan har två banor med namn och beskrivning');
  ok(makeMap(5, 'ile').kind === 'ile' && makeMap(5, 'place').kind === 'place' && makeMap(5).kind === 'ile' && makeMap(5, 'finns-inte').kind === 'ile', 'makeMap väljer bana (okänd bana ger ön)');
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
section('Bäraren kan inte använda vapen men kan tackla');
{
  const s = mk(['baguette', 'baguette'], { keepCheese: true });
  put(s.players[0], 300, 300, 0); put(s.players[1], 380, 300, Math.PI);
  s.cheese.state = 'carried'; s.cheese.carrier = 0; s.cheese.x = 300; s.cheese.y = 300;
  press(s.players[0]); run(s, 0.4);
  ok(s.players[1].st === 'alive', 'bäraren kan inte slå med vapnet');
  s.players[0].inp.mx = 1; s.players[0].inp.tk++; run(s, 0.4);
  ok(s.players[1].st === 'ko', 'bäraren kan tackla');
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
section(`Bot-matcher (${N} st, 8 botar, 5 min, banorna växlar)`);
const perMap = {}; for (const k of MAP_ORDER) perMap[k] = { n: 0, kos: 0, score: 0, crashes: 0, noCheese: 0, carries: 0, drowned: 0 };
const agg = { carryCause: {}, carries: [], kos: 0, cause: {}, steals: 0, seaTime: 0, crashes: 0, ties: 0, matches: 0, scoreSum: [], noCheese: [], pickups: 0 };
const perW = {}; for (const w of WEAPON_ORDER) perW[w] = { n: 0, wins: 0, score: 0, hits: 0, kos: 0 };
const t0 = Date.now();
for (let m = 0; m < N; m++) {
  const rnd = (() => { let a = m * 7919 + 13; return () => { a = (a * 1103515245 + 12345) & 0x7fffffff; return a / 0x7fffffff; }; })();
  const ws = WEAPON_ORDER.slice(); for (let i = ws.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [ws[i], ws[j]] = [ws[j], ws[i]]; }
  const players = []; for (let i = 0; i < 8; i++) players.push({ id: i, name: 'B' + i, skin: i, weapon: ws[i], bot: true });
  const kind = MAP_ORDER[m % MAP_ORDER.length], pm = perMap[kind];
  const s = new Sim({ seed: 1000 + m, players, matchSec: 300, map: kind });
  let lastDropper = -9, carryStart = -1, lastCarrier = -1, noCheeseT = 0, steps = 0, bad = null;
  while (!s.over && steps < 60 * 400) {
    s.step(DT); steps++;
    for (const e of s.drainEvents()) {
      if (e[0] === 'pick') { carryStart = s.time; if (lastCarrier !== -1 && lastCarrier !== e[1]) agg.steals++; lastCarrier = e[1]; agg.pickups++; }
      else if (e[0] === 'drop' && carryStart >= 0) { agg.carries.push(s.time - carryStart); carryStart = -1; lastDropper = e[1]; }
      else if (e[0] === 'ko') { agg.kos++; pm.kos++; if (e[3] === 'drown') pm.drowned++; agg.cause[e[3]] = (agg.cause[e[3]] || 0) + 1; if (e[1] === lastDropper) { agg.carryCause[e[3]] = (agg.carryCause[e[3]] || 0) + 1; lastDropper = -9; } }
      else if (e[0] === 'crash') { agg.crashes++; pm.crashes++; }
    }
    if (s.phase === 'play' && s.cheese.state !== 'carried') noCheeseT += DT;
    if (steps % 120 === 0) {
      for (const p of s.players) if (!isFinite(p.x) || !isFinite(p.y) || !isFinite(p.cvx) || !isFinite(p.evx)) bad = 'NaN i spelare ' + p.id;
      const c = s.cheese; if (!isFinite(c.x) || !isFinite(c.y)) bad = 'NaN i osten';
      if (bad) break;
    }
  }
  ok(!bad, `match ${m} (${kind}): ${bad || 'inga NaN'}`);
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
