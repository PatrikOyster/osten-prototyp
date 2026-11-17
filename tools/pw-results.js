'use strict';
/* Slutskärmen i riktig webbläsare (Playwright/Chromium): prispall, vinnarens rubrik, tabellen med alla tider
   i olika fönsterstorlekar, samt ett helt riktigt flöde (match -> slut -> resultat).
   Kör:  node tools/pw-results.js [utmapp]      (kräver att "playwright" finns installerat)  */
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const { start } = require('./serve.js');
const out = path.resolve(process.argv[2] || '/tmp/shots-results');
fs.mkdirSync(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let fails = 0;
const check = (ok, msg) => { if (!ok) { fails++; console.log('  FAIL', msg); } else console.log('  ok  ', msg); };

(async () => {
  const srv = await new Promise(r => start(0, (s, p) => r({ s, p })));
  const url = 'http://localhost:' + srv.p + '/';
  const browser = await chromium.launch();
  const errors = [];
  const open = async (w, h) => {
    const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
    await page.goto(url); await sleep(700);
    return page;
  };
  const fake = (n, me, winnerId, o) => `(() => {
    const names = ['Jean-Baptiste', 'Yvette', 'Amélie', 'Fabien', 'Pascal', 'Jacques', 'Noémie', 'Théo'];
    const W = WEAPON_ORDER;
    const scores = [71.4, 63.2, 48.9, 35.0, 22.6, 14.1, 6.3, 0.0];
    const rank = [];
    for (let i = 0; i < ${n}; i++) rank.push({ id: i === 0 ? ${winnerId} : (i === ${winnerId} ? 0 : i), name: names[i], skin: (i * 3) % 8, weapon: W[(i * 5) % W.length], bot: i !== 0, score: scores[i], best: scores[i] * 0.4, kos: 9 - i, hits: 20 - i * 2 });
    const meta = rank.map(r => ({ id: r.id, name: r.name, skin: r.skin, weapon: r.weapon, bot: r.bot }));
    App.state = 'results';
    UI.showResults({ rank }, meta, ${me}, true);
  })()`;

  // 1) Du vinner, stor skärm
  console.log('Du vinner (1440x860)');
  let page = await open(1440, 860);
  await page.evaluate(fake(8, 0, 0));
  await sleep(600); await page.screenshot({ path: path.join(out, 'r01-early.png') });
  await sleep(3600);
  await page.screenshot({ path: path.join(out, 'r02-i-win.png') });
  check((await page.textContent('#res-title')) === 'DU VANN!', 'rubriken säger DU VANN!');
  check(await page.evaluate(() => document.querySelectorAll('#podium .pod').length) === 3, 'tre platser på prispallen');
  check(await page.evaluate(() => { const o = [...document.querySelectorAll('#podium .pod')].map(e => e.className.match(/p(\d)/)[1]); return o.join('') === '213'; }), 'ordningen är 2-1-3');
  check(await page.evaluate(() => { const h = n => document.querySelector('#podium .p' + n + ' .step').getBoundingClientRect().height; return h(1) > h(2) && h(2) > h(3); }), 'vinnarens steg är högst');
  check(await page.evaluate(() => { const r = document.querySelector('#podium .champ .pcv').getBoundingClientRect(), q = document.querySelector('#podium .p2 .pcv').getBoundingClientRect(); return r.height > q.height * 1.4; }), 'vinnaren är betydligt större än tvåan');
  check(await page.evaluate(() => !!document.querySelector('#podium .champ canvas.crown') && document.querySelectorAll('#podium .sp').length === 8), 'krona och gnistor finns');
  check(await page.evaluate(() => document.querySelectorAll('#res-table tr').length) === 9, 'tabellen visar alla åtta plus rubrik');
  check(await page.evaluate(() => { const r = document.querySelector('.results-panel').getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight; }), 'allt får plats utan att skrolla (1440x860)');
  check(await page.evaluate(() => !!document.querySelector('#res-table tr.win canvas.crown-s')), 'kronan sitter även på vinnarens rad i tabellen');
  await page.close();

  // 2) Någon annan vinner (jag är id 3, sist i mitten)
  console.log('Någon annan vinner (1440x860)');
  page = await open(1440, 860);
  await page.evaluate(fake(8, 3, 0));
  await sleep(4200);
  await page.screenshot({ path: path.join(out, 'r03-other-wins.png') });
  check((await page.textContent('#res-title')) === 'JEAN-BAPTISTE VINNER!', 'rubriken nämner vinnaren');
  check((await page.textContent('#res-sub')).includes('Du kom på plats'), 'placering visas för den som inte vann');
  await page.close();

  // 3) Två spelare (en människa + en bot)
  console.log('Två spelare');
  page = await open(1440, 860);
  await page.evaluate(fake(2, 0, 0));
  await sleep(4000);
  await page.screenshot({ path: path.join(out, 'r04-two-players.png') });
  check(await page.evaluate(() => document.querySelectorAll('#podium .pod').length) === 2, 'prispall med två platser');
  await page.close();

  // 4) Ingen fick osten
  console.log('Ingen fick osten');
  page = await open(1440, 860);
  await page.evaluate(`(() => { const rank = []; for (let i = 0; i < 4; i++) rank.push({ id: i, name: 'P' + i, skin: i, weapon: 'baguette', bot: i > 0, score: 0, best: 0, kos: 0, hits: 0 }); App.state = 'results'; UI.showResults({ rank }, rank, 0, true); })()`);
  await sleep(3000);
  await page.screenshot({ path: path.join(out, 'r05-nobody.png') });
  check((await page.textContent('#res-title')).includes('Ingen'), 'rubriken säger att ingen fick tag i osten');
  check(await page.evaluate(() => !document.querySelector('#podium .champ')), 'ingen kröns när ingen hade osten');
  await page.close();

  // 5) Mindre skärmar
  for (const [w, h] of [[1280, 720], [1366, 768], [1024, 768], [1920, 1080]]) {
    console.log('Storlek ' + w + 'x' + h);
    page = await open(w, h);
    await page.evaluate(fake(8, 0, 0));
    await sleep(4000);
    await page.screenshot({ path: path.join(out, 'r06-' + w + 'x' + h + '.png') });
    const fit = await page.evaluate(() => { const r = document.querySelector('.results-panel').getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: window.innerHeight, w: Math.round(r.width), vw: window.innerWidth, scrolls: document.getElementById('results').scrollHeight > document.getElementById('results').clientHeight }; });
    console.log('   panel', JSON.stringify(fit));
    if (w >= 1280) check(fit.top >= 0 && fit.bottom <= fit.h, 'helt synlig utan skroll');
    else check(fit.w <= fit.vw, 'ryms i bredd (staplad layout, skroll i höjd tillåten)');
    await page.close();
  }

  // 6) Riktigt flöde: solomatch på en minut körs till slut -> onEnd -> resultat
  console.log('Riktigt flöde');
  page = await open(1440, 860);
  await page.fill('#name', 'Patrik');
  await page.click('#btn-solo'); await sleep(500);
  await page.click('.seg button[data-v="60"]'); await sleep(150);
  await page.click('.wcard[data-w="baguette"]'); await sleep(100);
  await page.click('#btn-lock'); await sleep(150);
  await page.click('#btn-start'); await sleep(800);
  await page.evaluate(() => { const sim = App.session.sim; for (let i = 0; i < 60 * 75 && !sim.over; i++) sim.step(1 / 60); });
  await sleep(4800);
  console.log('   state', await page.evaluate(() => App.state));
  check(await page.evaluate(() => App.state) === 'results', 'matchen slutade och resultatskärmen visas');
  await sleep(2200);
  await page.screenshot({ path: path.join(out, 'r07-real-flow.png') });
  check(await page.evaluate(() => document.querySelectorAll('#res-table tr').length) >= 3, 'riktig tabell med rader');
  await page.click('#btn-again'); await sleep(600);
  check(await page.evaluate(() => App.state) === 'lobby', 'Spela igen tar tillbaka till lobbyn');
  await page.close();

  console.log('ERRORS', errors.length); for (const e of errors.slice(0, 20)) console.log('  ', e);
  console.log(fails || errors.length ? 'RESULT: FAIL' : 'RESULT: OK');
  await browser.close(); srv.s.close();
  process.exit(fails || errors.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
