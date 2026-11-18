'use strict';
/* Test av den RIKTIGA WebRTC-vägen (PeerJS) mot en lokal signalserver – inga externa tjänster behövs.
   Kräver:  npm i playwright peer     Kör:  node tools/pw-peer.js
   (Den riktiga PeerJS-molnservern går inte att nå från alla miljöer; den här testar samma kod med egen server.) */
const { chromium } = require('playwright');
const { start } = require('./serve.js');
let PeerServer;
try { PeerServer = require('peer').PeerServer; } catch (e) { PeerServer = require(process.env.PEER_PATH || 'peer').PeerServer; }
const sleep = ms => new Promise(r => setTimeout(r, ms));
let bad = 0;
const check = (ok, msg) => { if (!ok) { bad++; console.log('  FAIL', msg); } else console.log('  ok  ', msg); };

(async () => {
  const sig = PeerServer({ port: 9000, path: '/', host: '127.0.0.1' });
  const srv = await new Promise(r => start(0, (s, p) => r({ s, p })));
  const q = '?peerhost=127.0.0.1&peerport=9000&peerpath=/&peersecure=0';
  const base = 'http://localhost:' + srv.p + '/' + q;
  const browser = await chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const A = await ctx.newPage(), B = await ctx.newPage();
  const errors = [];
  for (const [n, p] of [['A', A], ['B', B]]) { p.on('pageerror', e => errors.push(n + ' pageerror: ' + e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(n + ' console: ' + m.text()); }); }

  await A.goto(base); await A.fill('#name', 'Värd'); await A.click('#btn-host');
  await A.waitForSelector('#lobby:not(.hidden)', { timeout: 10000 });
  const code = (await A.textContent('#room-code')).trim(); console.log('rumskod', code);
  await B.goto(base + '#' + code); await B.fill('#name', 'Gäst'); await B.click('#btn-join');
  try { await B.waitForSelector('#lobby:not(.hidden)', { timeout: 15000 }); console.log('klient i lobby via WebRTC: OK'); }
  catch (e) { console.log('klient kom inte in:', await B.textContent('#title-msg')); throw e; }
  await sleep(500);
  console.log('spelare:', await A.evaluate(() => UI.lobby.players.map(p => p.name).join(', ')));
  await B.click('.wcard[data-w="petanque"]'); await B.click('#btn-lock');
  await A.click('.wcard[data-w="baguette"]'); await A.click('#btn-lock'); await sleep(400);
  // byta vapen över WebRTC: gästen låser upp -> värden kan inte starta -> gästen väljer om -> värden kan starta
  const startOn = () => A.evaluate(() => !document.getElementById('btn-start').disabled);
  check(await startOn(), 'båda låsta: värden kan starta');
  await B.click('#btn-unlock'); await sleep(600);
  check(!(await startOn()), 'gästen låste upp över WebRTC: värdens startknapp är inaktiv');
  await B.click('.wcard[data-w="patate"]'); await B.click('#btn-lock'); await sleep(600);
  check(await startOn(), 'gästen valde om: värden kan starta igen');
  await A.click('#btn-start'); await sleep(9500);
  check(await A.evaluate(() => App.session.sim.players.find(p => p.id === 1).weapon) === 'patate', 'matchen startade med gästens omvalda vapen (potatiskanonen)');
  await B.mouse.move(700, 300); await B.keyboard.down('KeyD'); await sleep(1500); await B.keyboard.up('KeyD');
  await sleep(300);
  const a = await A.evaluate(() => { const p = App.session.sim.makeView().players.find(q => q.id === 1); return [Math.round(p.x), Math.round(p.y)]; });
  const b = await B.evaluate(() => { const p = App.lastView.players.find(q => q.id === App.me); return { pos: [Math.round(p.x), Math.round(p.y)], rtt: Math.round(App.session.rtt * 1000), phase: App.lastView.phase }; });
  console.log('värdens syn på gästen', a, ' gästens egen syn', JSON.stringify(b));
  await B.screenshot({ path: '/tmp/shots/p1-peer-client.png' });
  console.log('ERRORS', errors.length); for (const e of errors.slice(0, 10)) console.log('  ', e);
  await browser.close(); srv.s.close(); sig.close && sig.close(); process.exit(bad || errors.length ? 1 : 0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
