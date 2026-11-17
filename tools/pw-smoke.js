'use strict';
/* Röktest i riktig webbläsare (Playwright/Chromium): titel -> lobby -> solo-match -> skärmdumpar.
   Kör:  node tools/pw-smoke.js [utmapp]      (kräver att "playwright" finns installerat)  */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const { start } = require('./serve.js');
const out = path.resolve(process.argv[2] || '/tmp/shots');
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  await shot('01-title');
  await page.fill('#name', 'Patrik');
  await page.click('#btn-solo'); await sleep(500);
  await shot('02-lobby');
  await page.click('.wcard[data-w="baguette"]'); await sleep(200);
  await shot('03-lobby-selected');
  await page.click('#btn-lock'); await sleep(300);
  await shot('04-lobby-locked');
  await page.click('#btn-start'); await sleep(1500);
  console.log('state', await page.evaluate(() => App.state));
  await shot('05-reveal');
  await sleep(4200); await shot('06-count');
  await sleep(3000);
  await shot('07-play');
  // rör sig mot osten och använder vapnet
  await page.mouse.move(900, 400);
  await page.keyboard.down('KeyD'); await sleep(1200); await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
  await shot('08-play-moved');
  for (let i = 0; i < 6; i++) { await page.mouse.click(900 + i * 10, 420); await sleep(250); }
  await page.keyboard.press('Space'); await sleep(250);
  await shot('09-play-action');
  await sleep(6000); await shot('10-play-later');
  const info = await page.evaluate(() => {
    const v = App.lastView, me = v.players.find(p => p.id === App.me);
    return { state: App.state, phase: v.phase, pt: v.pt, me: { x: Math.round(me.x), y: Math.round(me.y), st: me.st, score: me.score }, cheese: v.cheese.st, frames: App.stats.frames, maxDt: App.stats.maxDt, avgDt: App.stats.sumDt / App.stats.frames };
  });
  console.log(JSON.stringify(info));
  console.log('ERRORS', errors.length); for (const e of errors.slice(0, 20)) console.log('  ', e);
  await browser.close(); srv.s.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
