'use strict';
/* Fyra öar i riktig webbläsare (Playwright/Chromium): bankortet i lobbyn, start av match, att man inte kan gå ut i kanalen
   men över broarna (riktiga tangenttryck), att osten flyter tillbaka till mitten-ön, skärmdumpar av banans olika delar
   och en kontroll av att ingen sida ger fel.
   Kör:  node tools/pw-canal.js [utmapp]      (kräver att "playwright" finns installerat)  */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const { start } = require('./serve.js');
const out = path.resolve(process.argv[2] || '/tmp/shots-canal');
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
  const shot = async n => { await page.screenshot({ path: path.join(out, n + '.png') }); console.log('shot', n); };

  await page.goto(url); await sleep(900);
  await page.fill('#name', 'Patrik');
  await page.click('#btn-solo'); await sleep(600);
  console.log('Lobby');
  check(await page.evaluate(() => document.querySelectorAll('#map-sel .mapcard').length) === 3, 'tre bankort i lobbyn');
  check(await page.evaluate(() => [...document.querySelectorAll('#map-sel .mapcard')].map(b => b.dataset.m).join()) === 'ile,place,canal', 'korten kommer i ordningen ön, torget, fyra öar');
  check(await page.evaluate(() => document.querySelector('.mapcard[data-m="canal"]').textContent.includes('Fyra öar')), 'kortet heter Fyra öar');
  // Förhandsbilderna ska vara ritade (inte tomma) på alla tre korten
  const thumbs = await page.evaluate(() => [...document.querySelectorAll('#map-sel .mapcard canvas')].map(cv => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n / (d.length / 4);
  }));
  check(thumbs.length === 3 && thumbs.every(f => f > 0.9), 'förhandsbilderna är ritade på alla tre korten (' + thumbs.map(f => f.toFixed(2)).join('/') + ')');
  await page.click('.mapcard[data-m="canal"]'); await sleep(1200);
  check(await page.evaluate(() => UI.lobby.settings.map) === 'canal', 'inställningen map = canal');
  check(await page.evaluate(() => App.renderer.map.kind) === 'canal', 'lobbybakgrunden följer vald bana');
  check(await page.evaluate(() => App.renderer.groundKind) === 'canal', 'markbilden byggdes för Fyra öar');
  check(await page.evaluate(() => document.querySelector('.mapcard.on').dataset.m) === 'canal', 'kortet markeras som valt');
  await shot('c01-lobby');

  await page.click('.wcard[data-w="baguette"]'); await sleep(150);
  await page.click('#btn-lock'); await sleep(200);
  await page.click('#btn-start'); await sleep(1800);
  console.log('Match på Fyra öar');
  check(await page.evaluate(() => App.state) === 'match', 'matchen startade');
  check(await page.evaluate(() => App.session.sim.map.kind) === 'canal', 'simen kör Fyra öar');
  check(await page.evaluate(() => App.session.sim.players.length) === 8, 'åtta spelare (en människa och sju botar)');
  await shot('c02-reveal');
  // Spelarna börjar på fyra olika öar, två per ö
  const quads = await page.evaluate(() => { const c = [0, 0, 0, 0]; for (const p of App.session.sim.players) c[(p.x < 0 ? 0 : 1) + (p.y < 0 ? 0 : 2)]++; return c; });
  check(quads.every(n => n === 2), 'två spelare på varje ö vid start (' + quads.join('/') + ')');
  // Spela fram till matchstart och frys botarna så att resten av testet blir förutsägbart
  await page.evaluate(() => { const sim = App.session.sim; sim.botThink = () => { }; for (let i = 0; i < 60 * 9; i++) sim.step(1 / 60); });
  await sleep(400);
  check(await page.evaluate(() => App.session.sim.phase) === 'play', 'matchen är igång');
  const cheese0 = await page.evaluate(() => { const c = App.session.sim.cheese; return Math.hypot(c.x, c.y); });
  check(cheese0 < 120, 'osten ligger nära mitten av mitten-ön (' + cheese0.toFixed(0) + ' px)');
  await shot('c03-play-start');

  const setup = async (x, y, a) => {
    await page.evaluate(([x, y, a]) => {
      const sim = App.session.sim;
      for (const p of sim.players) { p.inp.mx = p.inp.my = 0; p.inp.wd = false; p.cvx = p.cvy = 0; p.evx = p.evy = 0; p.inv = 5; p.carry = false; }
      sim.players.filter(p => p.id !== 0).forEach((p, i) => { const sp = sim.map.spawns[(i + 1) % sim.map.spawns.length]; p.x = sp.x; p.y = sp.y; });
      const c = sim.cheese; c.state = 'ground'; c.carrier = -1; c.x = 0; c.y = 0; c.vx = c.vy = 0; c.air = 0;
      const me = sim.pmap.get(0); me.x = x; me.y = y; me.a = a || 0; me.st = 'alive';
      App.renderer.snap = true;
    }, [x, y, a]);
    await sleep(300);
  };
  const me = () => page.evaluate(() => { const sim = App.session.sim, p = sim.pmap.get(0); return { x: p.x, y: p.y, land: sim.map.onLand(p.x, p.y), st: p.st }; });

  // Riktiga tangenttryck: gå rakt mot kanalen och stanna vid kanten
  console.log('Gå med tangenterna');
  await setup(300, -100, Math.PI / 2);
  await page.keyboard.down('s'); await sleep(1400); await page.keyboard.up('s'); await sleep(100);
  let s1 = await me();
  check(s1.land && s1.st === 'alive' && s1.y > -70 && s1.y < -49, 'man stannar vid kanalkanten och faller inte i (y ' + s1.y.toFixed(1) + ')');
  await shot('c04-quay-stop');
  // ...och glider längs kanten när man går snett
  await page.keyboard.down('s'); await page.keyboard.down('d'); await sleep(900); await page.keyboard.up('s'); await page.keyboard.up('d'); await sleep(100);
  s1 = await me();
  check(s1.land && s1.st === 'alive' && s1.x > 400, 'man glider längs kanalkanten (x ' + s1.x.toFixed(0) + ')');
  // Över ringbron (norr -> söder)
  await setup(500, -140, Math.PI / 2);
  await shot('c05-ring-bridge-before');
  await page.keyboard.down('s'); await sleep(1300); await page.keyboard.up('s'); await sleep(100);
  s1 = await me();
  check(s1.land && s1.st === 'alive' && s1.y > 90, 'man går över ringbron till grannön (y ' + s1.y.toFixed(0) + ')');
  // Från en ö in till mitten över ekerbron, och ostplockning
  await setup(330, 330, Math.PI * 1.25);
  await page.keyboard.down('w'); await page.keyboard.down('a'); await sleep(1700); await page.keyboard.up('w'); await page.keyboard.up('a'); await sleep(150);
  s1 = await me();
  check(s1.land && s1.st === 'alive' && Math.hypot(s1.x, s1.y) < 80, 'man tar sig över ekerbron till mitten (' + Math.round(s1.x) + ',' + Math.round(s1.y) + ')');
  check(await page.evaluate(() => App.session.sim.cheese.carrier) === 0, 'och plockar upp osten');
  await shot('c06-center-with-cheese');

  // Ostbäraren går ut mot en kanal och blir kvar på land
  await page.keyboard.down('d'); await sleep(900); await page.keyboard.up('d'); await sleep(100);
  s1 = await me();
  check(s1.land && s1.st === 'alive', 'ostbäraren stannar vid ringkanalens kant (' + Math.round(s1.x) + ',' + Math.round(s1.y) + ')');

  // Osten i vattnet flyter tillbaka till mitten-ön efter fem sekunder
  console.log('Osten i kanalen');
  await setup(-420, -380, 0);
  await page.evaluate(() => { const c = App.session.sim.cheese; c.state = 'sea'; c.x = 400; c.y = 0; c.seaT = 0; c.carrier = -1; });
  await sleep(2200);
  check(await page.evaluate(() => { const c = App.session.sim.cheese; return c.state === 'sea' && Math.abs(c.x - 400) < 1; }), 'osten ligger kvar där den föll i kanalen (driver inte)');
  await shot('c07-cheese-in-canal');
  await sleep(3600);
  const ch = await page.evaluate(() => { const c = App.session.sim.cheese; return { st: c.state, r: Math.hypot(c.x, c.y) }; });
  check(ch.st === 'ground' && ch.r < 150, 'osten flöt tillbaka till mitten-ön (' + ch.r.toFixed(0) + ' px från mitten)');
  check(await page.evaluate(() => /mitten-ön/.test(document.getElementById('feed').textContent)), 'händelselistan säger att osten flöt tillbaka till mitten-ön');

  // Den som hamnar i kanalen drunknar och återuppstår på land
  console.log('Drunkning');
  await setup(300, 0, 0);
  await page.evaluate(() => { const p = App.session.sim.pmap.get(0); p.inv = 0; });
  await sleep(1500);
  check(await page.evaluate(() => { const p = App.session.sim.pmap.get(0); return p.st === 'ko' && p.koCause === 'drown'; }), 'den som hamnar i kanalen drunknar');
  await sleep(3200);
  s1 = await me();
  check(s1.st === 'alive' && s1.land && Math.hypot(s1.x, s1.y) > 600, 'och återuppstår på land långt från mitten');

  // Skärmdumpar av banans delar
  console.log('Skärmdumpar');
  const focus = async (name, x, y, a) => { await setup(x, y, a); await shot(name); };
  await focus('c08-center', 0, 120, 0);
  await focus('c09-spoke-bridge', 190, 190, 0.78);
  await focus('c10-ring-north', 0, -440, 0);
  await focus('c11-island-ne-park', 420, -380, 0);
  await focus('c12-island-nw-cobble', -420, -380, 0);
  await focus('c13-spawn-corner', 650, 520, 3.9);
  await focus('c14-ring-east', 500, 0, 1.57);

  // Hela matchen med botar utan frysta tänkare: ingen krasch eller fel under en halv minut i realtid
  console.log('Botar på banan');
  await page.evaluate(() => App.leave()); await sleep(500);
  await page.fill('#name', 'Patrik'); await page.click('#btn-solo'); await sleep(500);
  await page.click('.mapcard[data-m="canal"]'); await sleep(900);
  await page.click('.wcard[data-w="poireau"]'); await sleep(100);
  await page.click('#btn-lock'); await sleep(200);
  await page.click('#btn-start'); await sleep(1200);
  await page.evaluate(() => { const sim = App.session.sim; for (let i = 0; i < 60 * 9; i++) sim.step(1 / 60); });
  await sleep(300);
  await page.evaluate(() => { const sim = App.session.sim; for (let i = 0; i < 60 * 40; i++) sim.step(1 / 60); });
  await sleep(500);
  const botInfo = await page.evaluate(() => { const sim = App.session.sim; return { ok: sim.players.every(p => isFinite(p.x) && isFinite(p.y)), carried: sim.players.reduce((a, p) => a + p.score, 0) }; });
  check(botInfo.ok && botInfo.carried > 3, 'botarna spelar utan fel och osten byter ägare (summerad ostid ' + botInfo.carried.toFixed(1) + ' s på 40 s)');
  await shot('c15-bots-playing');

  console.log('ERRORS', errors.length); for (const e of errors.slice(0, 20)) console.log('  ', e);
  console.log(fails || errors.length ? 'RESULT: FAIL' : 'RESULT: OK');
  await browser.close(); srv.s.close();
  process.exit(fails || errors.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
