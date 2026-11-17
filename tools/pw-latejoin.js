'use strict';
/* Sen anslutning: en gäst går med i ett rum medan matchen redan pågår (på torget) och ska hamna som åskådare
   i matchen, inte i lobbyn.   Kör:  node tools/pw-latejoin.js [utmapp]      (kräver "playwright")  */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const { start } = require('./serve.js');
const out = path.resolve(process.argv[2] || '/tmp/shots-latejoin'); fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log('  FAIL', msg); } else console.log('  ok  ', msg); };

(async () => {
  const srv = await new Promise(r => start(0, (s, p) => r({ s, p })));
  const base = 'http://localhost:' + srv.p + '/?net=local';
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 780 } });
  const A = await ctx.newPage(), B = await ctx.newPage();
  const errors = [];
  for (const [n, p] of [['A', A], ['B', B]]) { p.on('pageerror', e => errors.push(n + ' ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(n + ' ' + m.text()); }); }
  await A.goto(base); await A.fill('#name', 'Värd'); await A.click('#btn-host');
  await A.waitForSelector('#lobby:not(.hidden)');
  const code = (await A.textContent('#room-code')).trim();
  await A.click('.mapcard[data-m="place"]'); await sleep(700);
  await A.click('.wcard[data-w="baguette"]'); await A.click('#btn-lock'); await sleep(200);
  await A.click('#btn-start'); await sleep(9500);
  check(await A.evaluate(() => App.state) === 'match', 'matchen pågår hos värden');
  await B.goto(base + '#' + code); await sleep(400);
  await B.fill('#name', 'Sent'); await B.click('#btn-join'); await sleep(2500);
  check(await B.evaluate(() => App.state) === 'match', 'gästen hamnar i matchen (inte lobbyn)');
  check(await B.evaluate(() => App.spec) === true, 'gästen är åskådare');
  check(await B.evaluate(() => App.renderer.map.kind) === 'place', 'gästen ser torget');
  await B.screenshot({ path: path.join(out, 'latejoin.png') });
  console.log('ERRORS', errors.length); for (const e of errors.slice(0, 10)) console.log('  ', e);
  console.log(fails || errors.length ? 'RESULT: FAIL' : 'RESULT: OK');
  await browser.close(); srv.s.close();
  process.exit(fails || errors.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
