'use strict';
/* Visuell kontroll av varje vapen och effekt i riktig webbläsare: sätter upp små scener i en solomatch
   (bottarna fryses som måltavlor), avfyrar vapnet och sparar beskurna skärmdumpar.
   Kör:  node tools/pw-weapons.js [utmapp]       -> utmapp/qa-*.png + qa-index.json  */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const { start } = require('./serve.js');
const out = path.resolve(process.argv[2] || '/tmp/shots/qa'); fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const srv = await new Promise(r => start(0, (s, p) => r({ s, p })));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 700 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://localhost:' + srv.p + '/'); await sleep(600);
  const index = [];
  const shot = async (name, label) => {
    const file = path.join(out, 'qa-' + name + '.png');
    await page.screenshot({ path: file, clip: { x: 150, y: 100, width: 800, height: 500 } });
    index.push({ file, label });
  };

  /* Startar en solomatch med givet vapen, fryser bottar, hoppar förbi avslöjande/nedräkning och ställer upp en scen */
  async function setup(weapon, opts) {
    await page.evaluate(({ weapon, opts }) => {
      Input.tk = Input.wp = Input.wr = 0; Input.wdM = Input.wdK = false; Input.keys.clear();
      App.leave(); App.startSolo('QA', 0);
      const s = App.session; s.pick(weapon); s.start();
      const sim = s.sim;
      sim.botThink = () => { };
      for (let i = 0; i < 60 * 9; i++) sim.step(1 / 60);
      for (const p of sim.players) { p.inp.mx = p.inp.my = 0; p.inp.wd = false; p.inv = 0; p.cvx = p.cvy = 0; }
      const me = sim.pmap.get(0);
      me.x = opts.mx; me.y = opts.my; me.a = 0; me.inv = 0;
      const others = sim.players.filter(p => p.id !== 0);
      opts.dummies.forEach((d, i) => { const p = others[i]; p.x = d[0]; p.y = d[1]; p.inv = 0; });
      // övriga bottar parkeras på land långt från scenen (annars drunknar de under testet)
      others.slice(opts.dummies.length).forEach((p, i) => {
        const ang = 3.9 + i * 0.2; let r = 820;
        while (r > 300 && !sim.map.onLand(Math.cos(ang) * r, Math.sin(ang) * r)) r -= 40;
        p.x = Math.cos(ang) * r; p.y = Math.sin(ang) * r; p.inv = 0;
      });
      const c = sim.cheese; c.state = 'ground'; c.carrier = -1; c.x = opts.cx === undefined ? 560 : opts.cx; c.y = opts.cy === undefined ? -420 : opts.cy; c.vx = c.vy = 0; c.air = 0;
      App.renderer.snap = true;
    }, { weapon, opts });
    await sleep(250);
  }
  /* Kameran glider mot musen (framåtblick) – sikta flera gånger så världspunkten hinner stabiliseras */
  const aim = async (wx, wy) => {
    for (let i = 0; i < 3; i++) {
      await page.evaluate(([x, y]) => { const q = App.renderer.toScreen(x, y); Input.mouse.x = q.x; Input.mouse.y = q.y; Input.mouse.in = true; Input.mouse.has = true; }, [wx, wy]);
      await sleep(200);
    }
  };
  const press = () => page.evaluate(() => { Input.wp++; Input.wdM = true; });
  const release = () => page.evaluate(() => { Input.wdM = false; Input.wr++; });
  const tap = async () => { await press(); await sleep(90); await release(); };
  const kos = () => page.evaluate(() => App.session.sim.players.filter(p => p.st !== 'alive').map(p => p.id));

  // --- närstrid ---
  for (const [w, d, delay] of [['baguette', 80, 220], ['coq', 62, 150], ['poireau', 105, 300]]) {
    await setup(w, { mx: -100, my: 60, dummies: [[-100 + d, 60]] }); await aim(300, 60);
    await tap(); await sleep(delay); await shot(w, w + ' – träff'); console.log(w, 'KO:', await kos());
  }
  // stekpannan: vakt, sedan slag, samt reflekterad potatis
  await setup('poele', { mx: -100, my: 60, dummies: [[-100 + 70, 60]] }); await aim(300, 60);
  await press(); await sleep(450); await shot('poele-vakt', 'stekpannan – håller vakt'); await release(); await sleep(260); await shot('poele-slag', 'stekpannan – slag'); console.log('poele KO:', await kos());
  // --- skjutande ---
  for (const [w, d, t1, t2] of [['patate', 320, 220, 450], ['petanque', 320, 260, 520], ['pigeon', 380, 450, 1000]]) {
    await setup(w, { mx: -150, my: 60, dummies: [[-150 + d, 60]] }); await aim(400, 60);
    await tap(); await sleep(t1); await shot(w + '-flyg', w + ' – i luften'); await sleep(t2 - t1); await shot(w + '-traff', w + ' – efter träff'); console.log(w, 'KO:', await kos());
  }
  // --- raket ---
  await setup('feu', { mx: -150, my: 60, dummies: [[150, 60], [200, 110], [120, 130]] }); await aim(150, 60);
  await tap(); await sleep(700); await shot('feu-flyg', 'raket – i luften'); await sleep(1000); await shot('feu-boom', 'raket – explosion'); await sleep(500); await shot('feu-efter', 'raket – efterspel'); console.log('feu KO:', await kos());
  // --- stinkost ---
  await setup('epoisses', { mx: -150, my: 60, dummies: [[150, 60], [190, 100]] }); await aim(150, 60);
  await tap(); await sleep(450); await shot('epoisses-flyg', 'stinkost – kast'); await sleep(1700); await shot('epoisses-oppnas', 'stinkost – öppnas'); await sleep(1700); await shot('epoisses-moln', 'stinkost – moln'); await sleep(1500); console.log('epoisses KO:', await kos());
  await shot('epoisses-svimmat', 'stinkost – efter svimning');
  // --- mina ---
  await setup('champagne', { mx: -100, my: 60, dummies: [[300, 60]] }); await aim(300, 60);
  await tap(); await sleep(150); await page.evaluate(() => { const p = App.session.sim.pmap.get(0); p.x = -300; p.y = 60; }); await sleep(1100);
  await shot('champagne-lagd', 'champagne – lagd mina (laddad)');
  await page.evaluate(() => { const sim = App.session.sim, m = sim.areas.find(a => a.k === 'mine'), d = sim.players.find(p => p.id !== 0); d.x = m.x + 20; d.y = m.y; });
  await sleep(220); await shot('champagne-pop', 'champagne – POP'); await sleep(300); console.log('champagne KO:', await kos());
  // --- lövblåsare ---
  await setup('souffleur', { mx: -100, my: 60, dummies: [[60, 60], [100, 100]] }); await aim(300, 60);
  await press(); await sleep(700); await shot('souffleur', 'lövblåsare – blåser'); await sleep(700); await shot('souffleur2', 'lövblåsare – längre'); await release();
  // --- studsmatta ---
  await setup('trampoline', { mx: -100, my: 60, dummies: [[300, 60]] }); await aim(300, 60);
  await tap(); await sleep(200);
  await page.evaluate(() => { const sim = App.session.sim, a = sim.areas.find(a => a.k === 'pad'), d = sim.players.find(p => p.id !== 0); d.x = a.x; d.y = a.y; });
  await sleep(380); await shot('trampoline', 'studsmatta – lyft'); await sleep(900); console.log('trampoline ok');
  // --- tackling ---
  await setup('baguette', { mx: -150, my: 60, dummies: [[0, 60]] }); await aim(300, 60);
  await page.evaluate(() => { Input.keys.add('KeyD'); Input.tk++; }); await sleep(260); await page.evaluate(() => Input.keys.delete('KeyD')); await shot('tackle', 'tackling – träff'); console.log('tackle KO:', await kos());
  // --- drunkning ---
  await setup('baguette', { mx: 900, my: 0, dummies: [] });
  await page.evaluate(() => { const me = App.session.sim.pmap.get(0); me.x = 1110; me.y = 0; });
  await sleep(1300); await shot('drown1', 'drunkning – sjunker'); await sleep(900); await shot('drown2', 'drunkning – efter');
  // --- osten i havet + bär osten ---
  await setup('baguette', { mx: 0, my: 700, dummies: [], cx: 1100, cy: 40 });
  await page.evaluate(() => { const c = App.session.sim.cheese; c.state = 'sea'; c.x = 1060; c.y = 30; c.seaT = 0; });
  await sleep(500); await shot('cheese-sea', 'osten i havet + pil');
  await setup('baguette', { mx: 0, my: 700, dummies: [], cx: 0, cy: 640 });
  await sleep(1200); await shot('carry', 'bär osten');
  // --- hus förstörs ---
  await setup('feu', { mx: -150, my: 60, dummies: [] });
  const crash = await page.evaluate(() => { const sim = App.session.sim, h = sim.map.obstacles.find(o => o.t === 'house'); const me = sim.pmap.get(0); me.x = h.x - 260; me.y = h.y + 40; return { x: h.x, y: h.y }; });
  await sleep(300); await aim(crash.x, crash.y); await tap(); await sleep(400);
  await page.evaluate(() => { const sim = App.session.sim; for (const o of sim.map.obstacles.filter(o => o.t === 'house' || o.t === 'tower')) { sim.obHp.set(o.id, 0); sim.damageOb(o, 1); } });
  await sleep(350); await shot('crash', 'hus och torn rasar');
  await sleep(900); await shot('crash2', 'spillror kvar');

  fs.writeFileSync(path.join(out, 'qa-index.json'), JSON.stringify(index, null, 1));
  console.log('skärmdumpar', index.length, 'fel', errors.length); for (const e of errors.slice(0, 10)) console.log('  ', e);
  await browser.close(); srv.s.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
