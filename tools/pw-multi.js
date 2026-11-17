'use strict';
/* Flerspelartest i två flikar via lokal transport (?net=local, BroadcastChannel) – värd + klient.
   Verifierar: rum, lobby, vapenval, matchstart, att klientens förutsägelse håller sig nära värdens sanning,
   att båda ser samma ost/händelser, samt resultatskärmen. Kör:  node tools/pw-multi.js [utmapp] [lagMs] */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const { start } = require('./serve.js');
const out = path.resolve(process.argv[2] || '/tmp/shots'); fs.mkdirSync(out, { recursive: true });
const LAG = +process.argv[3] || 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log('  FAIL', msg); } else console.log('  ok  ', msg); };

(async () => {
  const srv = await new Promise(r => start(0, (s, p) => r({ s, p })));
  const base = 'http://localhost:' + srv.p + '/?net=local' + (LAG ? '&lag=' + LAG : '');
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 780 } });
  const A = await ctx.newPage(), B = await ctx.newPage();
  const errors = [];
  for (const [n, p] of [['A', A], ['B', B]]) {
    p.on('pageerror', e => errors.push(n + ' pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push(n + ' console: ' + m.text()); });
  }
  const shot = async (p, n) => { await p.screenshot({ path: path.join(out, n + '.png') }); };

  await A.goto(base); await A.fill('#name', 'Värden'); await A.click('#btn-host');
  await A.waitForSelector('#lobby:not(.hidden)', { timeout: 5000 });
  const code = (await A.textContent('#room-code')).trim();
  console.log('rumskod', code);
  await B.goto(base + '#' + code); await sleep(500);
  console.log('invite synlig', await B.isVisible('#invite'));
  await B.fill('#name', 'Gästen'); await B.click('#btn-join');
  await B.waitForSelector('#lobby:not(.hidden)', { timeout: 5000 });
  await sleep(500);
  console.log('spelare i lobby (A):', await A.evaluate(() => UI.lobby.players.map(p => p.name + (p.locked ? '*' : '')).join(', ')));
  await B.click('.wcard[data-w="poele"]'); await B.click('#btn-lock'); await sleep(300);
  console.log('start knapp före A låst:', await A.evaluate(() => !document.getElementById('btn-start').disabled));
  await A.click('.wcard[data-w="feu"]'); await A.click('#btn-lock'); await sleep(400);
  console.log('start knapp efter båda låsta:', await A.evaluate(() => !document.getElementById('btn-start').disabled));
  await shot(A, 'm1-lobby-host'); await shot(B, 'm2-lobby-client');
  // bana och botantal: värden bestämmer, gästen ser valet och bakgrunden byter bana
  check(await B.evaluate(() => UI.lobby.settings.map) === 'ile' && await B.evaluate(() => App.renderer.map.kind) === 'ile', 'gästen börjar på ön');
  await B.click('.mapcard[data-m="place"]', { force: true }); await sleep(400);
  check(await A.evaluate(() => UI.lobby.settings.map) === 'ile', 'gästen kan inte byta bana');
  await A.click('.mapcard[data-m="place"]'); await sleep(900);
  check(await A.evaluate(() => UI.lobby.settings.map) === 'place' && await A.evaluate(() => App.renderer.map.kind) === 'place', 'värden valde torget (inställning + bakgrund)');
  check(await B.evaluate(() => UI.lobby.settings.map) === 'place' && await B.evaluate(() => App.renderer.map.kind) === 'place', 'gästens lobby följer med: torget valt, bakgrunden bytt');
  check(await B.evaluate(() => document.querySelector('.mapcard.on').dataset.m) === 'place' && await B.evaluate(() => document.querySelector('.mapcard').classList.contains('dis')), 'gästens bankort visar valet men är låsta');
  await A.click('#bots-minus'); await A.click('#bots-minus'); await sleep(400);
  check(await B.evaluate(() => document.getElementById('bots-n').textContent) === '4' && await B.evaluate(() => document.getElementById('bots-minus').disabled), 'botantalet (7 önskade, 6 lediga platser, minus två klick = 4) syns för gästen men kan inte ändras där');
  await shot(A, 'm1b-lobby-host-place'); await shot(B, 'm2b-lobby-client-place');
  await A.evaluate(() => UI.h.settings({ matchSec: 60 }));
  await A.click('#btn-start');
  await sleep(1500);
  console.log('states', await A.evaluate(() => App.state), await B.evaluate(() => App.state));
  check(await A.evaluate(() => App.session.sim.map.kind) === 'place' && await B.evaluate(() => App.session.map.kind) === 'place' && await B.evaluate(() => App.renderer.map.kind) === 'place', 'båda spelar på torget');
  check(await A.evaluate(() => App.session.sim.players.length) === 6, 'sex spelare: två människor + fyra botar');
  check(await B.evaluate(() => JSON.stringify(App.session.map.obstacles) === JSON.stringify(App.session.map.obstacles) && App.session.map.obstacles.length) === await A.evaluate(() => App.session.sim.map.obstacles.length), 'klienten har samma hinder som värden');
  await shot(B, 'm3-reveal-client');
  await sleep(8000);   // reveal 5 s + count 3 s
  await shot(A, 'm4-play-host'); await shot(B, 'm5-play-client');

  // klienten rör sig åt höger och vi jämför prediktion mot värdens sanning
  await B.mouse.move(900, 300);
  await B.keyboard.down('KeyD');
  const samples = [];
  for (let i = 0; i < 10; i++) {
    await sleep(300);
    const a = await A.evaluate(() => { const v = App.session.sim.makeView(); const p = v.players.find(q => q.id === 1); return { x: p.x, y: p.y, st: p.st }; });
    const b = await B.evaluate(() => { const v = App.lastView; const p = v.players.find(q => q.id === App.me); return { x: p.x, y: p.y, rtt: App.session.rtt, buf: App.session.buf.length }; });
    samples.push({ err: Math.hypot(a.x - b.x, a.y - b.y), rtt: b.rtt, buf: b.buf, hx: Math.round(a.x), cx: Math.round(b.x) });
  }
  await B.keyboard.up('KeyD');
  console.log('prediktionsfel (enheter):', samples.map(s => Math.round(s.err)).join(' '), ' (host x vs klient x:', samples[9].hx, samples[9].cx + ')');
  await B.mouse.click(900, 300); await B.keyboard.press('Space'); await sleep(400);
  await shot(B, 'm6-client-action');
  const hv = await A.evaluate(() => { const v = App.session.sim.makeView(); return { phase: v.phase, cheese: v.cheese.st, players: v.players.length }; });
  const cv = await B.evaluate(() => { const v = App.lastView; return { phase: v.phase, cheese: v.cheese.st, players: v.players.length, rtt: Math.round(App.session.rtt * 1000) }; });
  console.log('host vy', JSON.stringify(hv), 'klient vy', JSON.stringify(cv));
  // vänta tills matchen är slut (60 s) – hoppa över genom att köra snabbt via sim-tid
  await A.evaluate(() => { const s = App.session.sim; s.timeLeft = 1.5; });
  await sleep(6500);
  console.log('states efter slut', await A.evaluate(() => App.state), await B.evaluate(() => App.state));
  await shot(A, 'm7-results-host'); await shot(B, 'm8-results-client');
  console.log('knapp "Spela igen" host:', await A.isVisible('#btn-again'), ' klient:', await B.isVisible('#btn-again'));
  await A.click('#btn-again'); await sleep(700);
  console.log('tillbaka i lobby:', await A.evaluate(() => App.state), await B.evaluate(() => App.state));
  check(await A.evaluate(() => UI.lobby.settings.map) === 'place' && await B.evaluate(() => UI.lobby.settings.map) === 'place', 'banvalet finns kvar efter Spela igen');
  console.log('ERRORS', errors.length); for (const e of errors.slice(0, 20)) console.log('  ', e);
  console.log(fails || errors.length ? 'RESULT: FAIL' : 'RESULT: OK');
  await browser.close(); srv.s.close();
  process.exit(fails || errors.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
