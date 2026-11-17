'use strict';
/* Banor i riktig webbläsare (Playwright/Chromium): banväljaren i lobbyn, byte av bana, start av match på torget,
   skärmdumpar av torgets olika delar samt en kontroll av att ingen sida ger fel.
   Kör:  node tools/pw-maps.js [utmapp]      (kräver att "playwright" finns installerat)  */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const { start } = require('./serve.js');
const out = path.resolve(process.argv[2] || '/tmp/shots-maps');
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log('  FAIL', msg); } else console.log('  ok  ', msg); };

(async () => {
  const srv = await new Promise(r => start(0, (s, p) => r({ s, p })));
  const url = 'http://localhost:' + srv.p + '/';
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  const shot = async (n, clip) => { await page.screenshot(clip ? { path: path.join(out, n + '.png'), clip } : { path: path.join(out, n + '.png') }); console.log('shot', n); };

  await page.goto(url); await sleep(900);
  await page.fill('#name', 'Patrik');
  await page.click('#btn-solo'); await sleep(600);
  console.log('Lobby');
  check(await page.evaluate(() => document.querySelectorAll('#map-sel .mapcard').length) === 2, 'två bankort i lobbyn');
  check(await page.evaluate(() => App.renderer.map.kind) === 'ile', 'ön är förvald');
  await shot('m01-lobby-ile');

  const t0 = Date.now();
  await page.click('.mapcard[data-m="place"]'); await sleep(900);
  console.log('   byte av bana tog ca', Date.now() - t0 - 900, 'ms (inkl. bygge av markbilden)');
  check(await page.evaluate(() => UI.lobby.settings.map) === 'place', 'inställningen map = place');
  check(await page.evaluate(() => App.renderer.map.kind) === 'place', 'lobbybakgrunden följer vald bana');
  check(await page.evaluate(() => document.querySelector('.mapcard.on').dataset.m) === 'place', 'torgkortet markeras som valt');
  await shot('m02-lobby-place');

  await page.click('.wcard[data-w="baguette"]'); await sleep(150);
  await page.click('#btn-lock'); await sleep(200);
  await page.click('#btn-start'); await sleep(1500);
  console.log('Match på torget');
  check(await page.evaluate(() => App.state) === 'match', 'matchen startade');
  check(await page.evaluate(() => App.session.sim.map.kind) === 'place', 'simen kör torget');
  await shot('m03-reveal');
  await page.evaluate(() => { const sim = App.session.sim; sim.botThink = () => { }; for (let i = 0; i < 60 * 9; i++) sim.step(1 / 60); });
  await sleep(400);
  await shot('m04-play-start');

  // Fokusera på olika delar av torget: teleportera spelaren, frys övriga, ta bild
  const focus = async (name, x, y, o) => {
    o = o || {};
    await page.evaluate(([x, y, o]) => {
      const sim = App.session.sim;
      for (const p of sim.players) { p.inp.mx = p.inp.my = 0; p.inp.wd = false; p.cvx = p.cvy = 0; p.inv = 5; p.carry = false; }
      const me = sim.pmap.get(0); me.x = x; me.y = y; me.a = o.a || 0;
      // övriga botar parkeras långt bort på kajen så att de inte stör bilden
      sim.players.filter(p => p.id !== 0).forEach((p, i) => { const sp = sim.map.spawns[(i + 3) % sim.map.spawns.length]; p.x = sp.x; p.y = sp.y; });
      if (o.cheese) { const c = sim.cheese; c.state = 'ground'; c.carrier = -1; c.x = o.cheese[0]; c.y = o.cheese[1]; c.vx = c.vy = 0; c.air = 0; }
      App.renderer.snap = true;
    }, [x, y, o]);
    await sleep(450);
    await shot(name);
  };
  await focus('m05-hill', 0, 160, { cheese: [0, 0] });
  await focus('m06-carousel', 0, -420, { a: -1.57, cheese: [300, -300] });
  await focus('m07-stalls', 360, 20, { cheese: [300, 300] });
  await focus('m08-tower-south', 0, 450, { a: 1.57, cheese: [300, 300] });
  await focus('m09-cafes', -330, 250, { cheese: [300, -300] });
  const mapInfo = await page.evaluate(() => { const m = App.session.sim.map; return { pond: m.pond, court: m.court, coast: Math.round(m.coastR(Math.PI / 2)), coastE: Math.round(m.coastR(0)) }; });
  console.log('   banans mått', JSON.stringify(mapInfo));
  await focus('m10-pond', mapInfo.pond.x + 40, mapInfo.pond.y + mapInfo.pond.ry + 70, { cheese: [300, -300] });
  await focus('m11-court', mapInfo.court.x, mapInfo.court.y + 90, { cheese: [300, -300] });
  await focus('m12-quay-south', 0, mapInfo.coast - 110, { a: 1.57, cheese: [300, -300] });
  await focus('m13-quay-east', mapInfo.coastE - 110, 60, { a: 0, cheese: [300, -300] });

  // Faller i Seine: bilden strax efter plasket
  await page.evaluate(([cy]) => { const sim = App.session.sim; for (const p of sim.players) p.inv = 0; const me = sim.pmap.get(0); me.x = 40; me.y = cy + 12; me.cvy = 900; me.inp.mx = 0; me.inp.my = 1; }, [mapInfo.coast]);
  await sleep(450);
  await shot('m14-seine');

  // Minikartan och HUD: helbild med mitten av banan
  await focus('m15-full-view', 120, 120, { cheese: [0, 0] });

  // Rubble: spräng alla stånd, kolonner och karusellen och titta på resterna
  await page.evaluate(() => { const sim = App.session.sim; for (const o of sim.map.obstacles.filter(o => o.t === 'stall' || o.t === 'column' || o.t === 'carousel' || o.t === 'kiosk')) { sim.obHp.set(o.id, 0); sim.damageOb(o, 1); } });
  await sleep(200);
  await focus('m16-rubble-stalls', 360, 20, { cheese: [300, 300] });
  await focus('m17-rubble-carousel', 0, -420, { a: -1.57, cheese: [300, 300] });

  // Tillbaka till lobbyn och byt tillbaka till ön
  console.log('Tillbaka');
  await page.evaluate(() => App.leave()); await sleep(500);
  check(await page.evaluate(() => App.renderer.map.kind) === 'ile', 'titelbakgrunden är ön igen');
  await page.fill('#name', 'Patrik'); await page.click('#btn-solo'); await sleep(500);
  check(await page.evaluate(() => UI.lobby.settings.map) === 'ile', 'ny lobby börjar på ön');
  await page.click('.mapcard[data-m="place"]'); await sleep(500);
  await page.click('.mapcard[data-m="ile"]'); await sleep(700);
  check(await page.evaluate(() => App.renderer.map.kind) === 'ile', 'bakgrunden växlar tillbaka till ön');
  check(await page.evaluate(() => App.renderer.groundKind) === 'ile', 'markbilden byggdes om för ön');
  await shot('m18-lobby-back-to-ile');

  console.log('ERRORS', errors.length); for (const e of errors.slice(0, 20)) console.log('  ', e);
  console.log(fails || errors.length ? 'RESULT: FAIL' : 'RESULT: OK');
  await browser.close(); srv.s.close();
  process.exit(fails || errors.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
