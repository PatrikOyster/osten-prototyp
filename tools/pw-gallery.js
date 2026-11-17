'use strict';
/* Konstgalleri: ritar alla vapen, karaktärer, hinder och effekter på en bild så att man kan granska stilen.
   Kör:  node tools/pw-gallery.js [utfil.png] */
const { chromium } = require('playwright');
const path = require('path');
const { start } = require('./serve.js');
const outFile = path.resolve(process.argv[2] || '/tmp/shots/gallery.png');

(async () => {
  const srv = await new Promise(r => start(0, (s, p) => r({ s, p })));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1700, height: 1100 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://localhost:' + srv.p + '/'); await new Promise(r => setTimeout(r, 600));
  await page.evaluate(() => {
    document.body.innerHTML = '<canvas id="g" width="1700" height="1100" style="display:block;background:#8fd16f"></canvas>';
    const c = document.getElementById('g').getContext('2d');
    c.fillStyle = '#8fd16f'; c.fillRect(0, 0, 1700, 1100);
    // rad 1: vapenikoner
    WEAPON_ORDER.forEach((id, i) => { drawWeaponIcon(c, id, 40 + i * 138, 50, 1.0, 0, 0.3); });
    // rad 2: karaktärer med vapen i olika lägen
    SKINS.forEach((s, i) => {
      const w = WEAPON_ORDER[i];
      drawCharacter(c, { x: 80 + i * 200, y: 230, skin: i, a: 0.4, vx: 0, vy: 0, phase: 0, t: 1, id: i, weapon: w, sw: -1 });
    });
    // rad 3: lägen (springer, bär ost, KO, i luften, tacklar, svingar, vaktar)
    const modes = [
      { vx: 300, a: 0, phase: 1.2, weapon: 'baguette' }, { carry: true, vx: 280, a: 0.3, phase: 0.7, weapon: 'coq' }, { ko: true, spin: 1.3, weapon: 'poele' },
      { lift: 90, spin: 2.4, weapon: 'patate' }, { dash: true, vx: 800, a: 0, weapon: 'poireau' }, { sw: 0.12, a: -0.3, weapon: 'baguette' },
      { guard: true, a: 0, weapon: 'poele' }, { daze: true, weapon: 'coq' }, { stink: 0.8, weapon: 'epoisses' }, { blow: true, a: 0.2, weapon: 'souffleur' }
    ];
    modes.forEach((m, i) => drawCharacter(c, Object.assign({ x: 80 + i * 165, y: 440, skin: (i * 3) % 8, a: 0, vx: 0, vy: 0, phase: 0, t: 1.1, id: i, weapon: 'baguette', sw: -1 }, m)));
    // rad 4: hinder
    const obs = [{ t: 'house', v: 'boulangerie' }, { t: 'house', v: 'cafe' }, { t: 'house', v: 'fromagerie' }, { t: 'house', v: 'maison' }, { t: 'tower' }, { t: 'tree' }, { t: 'barrel' }, { t: 'cafe' }];
    obs.forEach((o, i) => { const ob = Object.assign({ id: i + 1, x: 110 + i * 200, y: 700 }, o); drawObstacle(c, ob, 0.5); });
    // rubble
    [{ t: 'house' }, { t: 'tower' }, { t: 'tree' }, { t: 'barrel' }, { t: 'cafe' }].forEach((o, i) => drawRubble(c, Object.assign({ id: 30 + i, x: 1450 + (i % 2) * 90, y: 560 + Math.floor(i / 2) * 100 }, o)));
    // rad 5: projektiler, områden, ost
    ['potato', 'boule', 'pigeon', 'rocket', 'can'].forEach((k, i) => drawProjectile(c, { k, x: 60 + i * 80, y: 900, vx: 1, vy: 0, o: 0, id: i }, 0.3, 0));
    drawProjectile(c, { k: 'pigeon', x: 480, y: 900, vx: -1, vy: 0, o: -1, id: 9 }, 0.3, 0);
    drawArea(c, { k: 'can', x: 620, y: 900, r: 20, f: 0.6, a: 0 }, 0.4);
    drawArea(c, { k: 'cloud', x: 800, y: 900, r: 150, f: 0.8, a: 0 }, 0.4);
    drawArea(c, { k: 'mine', x: 1000, y: 900, r: 54, f: 1, a: 0 }, 0.4);
    drawArea(c, { k: 'mine', x: 1080, y: 900, r: 54, f: 0.4, a: 0 }, 0.4);
    drawArea(c, { k: 'pad', x: 1220, y: 900, r: 56, f: 1, a: 0.4 }, 0.4);
    drawCheese(c, 1380, 900, 0.4, 0, 1); drawCheese(c, 1450, 900, 1.2, 30, 1.3);
    drawFlagPole(c, 1560, 930, 0.5);
    c.fillStyle = '#143'; c.font = '13px sans-serif';
    c.fillText('vapen (rad 1) · skins + vapen (rad 2) · lägen: spring, bär ost, KO, luft, tackling, sving, vakt, yr, stank, blås (rad 3) · hinder + spillror (rad 4) · projektiler, områden, ost (rad 5)', 20, 1085);
  });
  await page.screenshot({ path: outFile });
  console.log('saved', outFile, 'errors', errors);
  await browser.close(); srv.s.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
