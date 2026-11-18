'use strict';
/* Byta vapen i lobbyn + bärarens regler i HUD:en.
   1. Värd + gäst (?net=local, två flikar): lås in -> lås upp -> välj ett annat vapen -> starta; matchen ska
      börja med de omvalda vapnen, och efter matchstart ska en upplåsning ignoreras.
   2. Solo: samma flöde i en ensam spelares lobby.
   3. HUD som ostbärare: tacklingsrundeln blir nedtonad ("Bär osten") och Mellanslag ger ingen tackling –
      men så fort osten är borta fungerar tacklingen igen.
   Kör:  node tools/pw-relock.js [utmapp]      (kräver "playwright")  */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const { start } = require('./serve.js');
const out = path.resolve(process.argv[2] || '/tmp/shots-relock'); fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log('  FAIL', msg); } else console.log('  ok  ', msg); };

(async () => {
  const srv = await new Promise(r => start(0, (s, p) => r({ s, p })));
  const base = 'http://localhost:' + srv.p + '/?net=local';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const A = await ctx.newPage(), B = await ctx.newPage();
  const errors = [];
  for (const [n, p] of [['A', A], ['B', B]]) { p.on('pageerror', e => errors.push(n + ' ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(n + ' ' + m.text()); }); }
  const shot = (p, n) => p.screenshot({ path: path.join(out, n + '.png') });
  const vis = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); return !!e && !e.classList.contains('hidden') && e.offsetParent !== null; }, sel);
  const startOn = p => p.evaluate(() => !document.getElementById('btn-start').disabled);
  const cls = (p, sel, c) => p.evaluate(([s, k]) => document.querySelector(s).classList.contains(k), [sel, c]);

  console.log('--- värd + gäst');
  await A.goto(base); await A.fill('#name', 'Värden'); await A.click('#btn-host');
  await A.waitForSelector('#lobby:not(.hidden)', { timeout: 5000 });
  const code = (await A.textContent('#room-code')).trim();
  await B.goto(base + '#' + code); await sleep(400);
  await B.fill('#name', 'Gästen'); await B.click('#btn-join');
  await B.waitForSelector('#lobby:not(.hidden)', { timeout: 5000 }); await sleep(400);
  check(!(await vis(B, '#btn-unlock')), 'ingen upplåsningsknapp innan man låst något');

  await B.click('.wcard[data-w="poele"]'); await B.click('#btn-lock'); await sleep(350);
  check(await vis(B, '#btn-unlock') && !(await vis(B, '#btn-lock')), 'efter låsning syns "Lås upp och byt vapen" och "Lås in" är borta');
  check(await cls(B, '.wcard[data-w="poele"]', 'locked') && await cls(B, '.wcard[data-w="baguette"]', 'dim'), 'valt vapen markeras som låst, övriga nedtonade');
  await B.click('.wcard[data-w="patate"]', { force: true }); await sleep(150);
  check(await B.evaluate(() => UI.lobby.myWeapon) === 'poele' && !(await cls(B, '.wcard[data-w="patate"]', 'sel')), 'medan det är låst går det inte att klicka på ett annat vapen');
  await A.click('.wcard[data-w="feu"]'); await A.click('#btn-lock'); await sleep(350);
  check(await startOn(A), 'värden kan starta när båda är låsta');
  await shot(B, 'r1-gast-last');

  await B.click('#btn-unlock'); await sleep(450);
  check(await vis(B, '#btn-lock') && !(await vis(B, '#btn-unlock')), 'efter upplåsning syns "Lås in" igen och upplåsningsknappen försvinner');
  check(await cls(B, '.wcard[data-w="poele"]', 'sel') && !(await cls(B, '.wcard[data-w="poele"]', 'locked')), 'det tidigare valet (stekpannan) är förvalt');
  check(!(await startOn(A)), 'värdens startknapp blir inaktiv när gästen låst upp');
  check(await A.evaluate(() => { const p = UI.lobby.players.find(q => q.name === 'Gästen'); return p && !p.locked && /Väljer/.test(document.querySelector('#player-list').textContent); }), 'värden ser att gästen väljer igen');
  check(await B.evaluate(() => !document.getElementById('lobby-name').disabled), 'namn och tröja går att ändra igen när man är upplåst');
  await shot(B, 'r2-gast-upplast'); await shot(A, 'r3-host-ser-gasten-valja');

  await B.click('.wcard[data-w="patate"]'); await B.click('#btn-lock'); await sleep(350);
  check(await startOn(A) && await B.evaluate(() => UI.lobby.myWeapon) === 'patate', 'gästen låser om med potatiskanonen och värden kan starta igen');

  // Dubbelklick/ångra-snabbt: lås upp och lås direkt igen (meddelandena ska hamna i rätt ordning)
  await B.click('#btn-unlock'); await B.click('.wcard[data-w="coq"]'); await B.click('#btn-lock'); await sleep(450);
  check(await B.evaluate(() => UI.lobby.locked && UI.lobby.myWeapon) === 'coq' && await startOn(A), 'snabb upplåsning + omval hamnar rätt (gummituppen)');
  await B.click('#btn-unlock'); await B.click('.wcard[data-w="patate"]'); await B.click('#btn-lock'); await sleep(450);

  await A.evaluate(() => { UI.h.settings({ matchSec: 120, bots: 0 }); }); await sleep(300);
  await A.click('#btn-start'); await sleep(1200);
  const hw = await A.evaluate(() => App.session.sim.players.map(p => [p.id, p.weapon]));
  check(JSON.stringify(hw) === JSON.stringify([[0, 'feu'], [1, 'patate']]), 'matchen startar med de omvalda vapnen (' + JSON.stringify(hw) + ')');
  check(await B.evaluate(() => App.session.startInfo.players.find(p => p.id === App.session.me).weapon) === 'patate', 'gästens klient har samma vapen');
  await B.evaluate(() => App.session.unpick()); await A.evaluate(() => App.session.unpick()); await sleep(300);
  check(await A.evaluate(() => App.session.roster.every(r => r.locked)), 'efter matchstart ignoreras upplåsning (värd och gäst)');

  console.log('--- HUD som ostbärare');
  await A.waitForFunction(() => App.session.sim.phase === 'play', null, { timeout: 15000 });
  await A.mouse.move(900, 300);
  await A.evaluate(() => { const s = App.session.sim; Object.assign(s.cheese, { state: 'carried', carrier: 0 }); });
  await sleep(400);
  const hud = () => A.evaluate(() => ({ op: document.getElementById('ring-tackle').style.opacity, key: document.getElementById('hud-tkey').textContent, ready: document.getElementById('ring-tackle').classList.contains('ready'), wkey: document.getElementById('hud-wkey').textContent, wop: document.getElementById('ring-weapon').style.opacity }));
  let h = await hud();
  check(h.op === '0.45' && h.key === 'Bär osten' && !h.ready, 'tacklingsrundeln är nedtonad och märkt "Bär osten" när man bär osten (' + JSON.stringify(h) + ')');
  check(h.wop === '0.45' && h.wkey === 'Bär osten', 'vapenrundeln likaså');
  await A.keyboard.press('Space'); await sleep(150);
  check(await A.evaluate(() => { const p = App.session.sim.players[0]; return p.dashT === 0 && p.tkCd === 0 && p.carry; }), 'Mellanslag med osten ger ingen tackling och laddar inte ur rundeln');
  await shot(A, 'r4-hud-barare');
  await A.evaluate(() => { const s = App.session.sim; Object.assign(s.cheese, { state: 'ground', carrier: -1, x: -600, y: -500, vx: 0, vy: 0, air: 100 }); });
  await sleep(400);
  h = await hud();
  check(h.op === '1' && h.key === 'Mellanslag' && h.ready, 'utan osten är rundeln normal och laddad igen (' + JSON.stringify(h) + ')');
  await A.keyboard.press('Space'); await sleep(120);
  check(await A.evaluate(() => App.session.sim.players[0].tkCd > 0), 'utan osten fungerar tacklingen igen');
  await shot(A, 'r5-hud-utan-ost');

  console.log('--- solo');
  const C = await ctx.newPage();
  C.on('pageerror', e => errors.push('C ' + e.message)); C.on('console', m => { if (m.type() === 'error') errors.push('C ' + m.text()); });
  await C.goto(base); await C.fill('#name', 'Ensam'); await C.click('#btn-solo');
  await C.waitForSelector('#lobby:not(.hidden)', { timeout: 5000 });
  await C.click('.wcard[data-w="baguette"]'); await C.click('#btn-lock'); await sleep(250);
  check(await startOn(C) && await vis(C, '#btn-unlock'), 'solo: låst vapen -> kan starta, upplåsningsknappen syns');
  await C.click('#btn-unlock'); await sleep(250);
  check(!(await startOn(C)) && await vis(C, '#btn-lock'), 'solo: upplåst -> kan inte starta förrän man låser igen');
  await C.click('.wcard[data-w="souffleur"]'); await C.click('#btn-lock'); await sleep(250);
  await shot(C, 'r6-solo-last');
  await C.click('#btn-start'); await sleep(900);
  check(await C.evaluate(() => App.session.sim.players[0].weapon) === 'souffleur', 'solo: matchen startar med det omvalda vapnet (lövblåsaren)');

  console.log('ERRORS', errors.length); for (const e of errors.slice(0, 10)) console.log('  ', e);
  console.log(fails || errors.length ? 'RESULT: FAIL' : 'RESULT: OK');
  await browser.close(); srv.s.close();
  process.exit(fails || errors.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
