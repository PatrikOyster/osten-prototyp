'use strict';
/* =====================================================================
   NÄTVERK – peer-to-peer via WebRTC (PeerJS) utan egen server.
   Värden kör simuleringen och är auktoritativ. Klienter skickar input
   (~30 Hz) och tar emot snapshots (~30 Hz) som interpoleras. Den egna
   spelaren förutsägs lokalt så att styrningen känns direkt.

   Transporter:   ?net=peer  (standard, WebRTC via PeerJS-molnet)
                  ?net=local (BroadcastChannel – två flikar i samma webbläsare, för test)
   Extra:         ?lag=80    (simulerad fördröjning i ms, båda håll)
                  ?peerhost=localhost&peerport=9000&peerpath=/&peersecure=0  (egen signalserver)
   ===================================================================== */

const Net = (() => {
  const params = new URLSearchParams(location.search);
  const conf = {
    mode: params.get('net') || 'peer',
    lag: Math.max(0, +params.get('lag') || 0),
    debug: params.get('debug') ? 2 : 0,
    peerHost: params.get('peerhost'), peerPort: params.get('peerport'), peerPath: params.get('peerpath'),
    peerSecure: params.get('peersecure'),
    // STUN räcker för de flesta hemmanät. Bakom strikta företagsnät/symmetrisk NAT behövs en TURN-server:
    // lägg till { urls: 'turn:...', username: '...', credential: '...' } nedan.
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  };
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ';
  const newCode = () => { let s = ''; for (let i = 0; i < 4; i++) s += ALPHA[(Math.random() * ALPHA.length) | 0]; return s; };
  const cleanCode = c => String(c || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
  const hasPeer = () => typeof Peer !== 'undefined';

  function peerOpts() {
    const o = { debug: conf.debug, config: { iceServers: conf.iceServers } };
    if (conf.peerHost) {
      o.host = conf.peerHost; o.port = +conf.peerPort || 9000; o.path = conf.peerPath || '/';
      o.secure = conf.peerSecure === '1' || conf.peerSecure === 'true';
    }
    return o;
  }

  /* ---------- Anslutningsobjekt: { id, send(obj, droppable), close(), onmessage, onclose } ---------- */
  function delayed(fn) { if (conf.lag > 0) setTimeout(fn, conf.lag + Math.random() * conf.lag * 0.25); else fn(); }

  function wrapPeerConn(dc) {
    const c = { id: dc.peer, onmessage: null, onclose: null, closed: false };
    c.send = (o, droppable) => {
      if (!dc.open) return;
      if (droppable && dc.dataChannel && dc.dataChannel.bufferedAmount > 120000) return;
      delayed(() => { try { dc.send(o); } catch (e) { /* stängd */ } });
    };
    c.close = () => { try { dc.close(); } catch (e) { /* ok */ } };
    const fin = () => { if (!c.closed) { c.closed = true; c.onclose && c.onclose(); } };
    dc.on('data', d => delayed(() => c.onmessage && c.onmessage(d)));
    dc.on('close', fin);
    dc.on('error', fin);
    return c;
  }

  /* ---------- PeerJS ---------- */
  function peerHostOpen(code, onConn, cb) {
    if (!hasPeer()) { cb({ error: 'PeerJS saknas (vendor/peerjs.min.js kunde inte laddas).' }); return null; }
    const peer = new Peer('osten-' + code, peerOpts());
    const h = { peer, code, close() { try { peer.destroy(); } catch (e) { /* ok */ } } };
    peer.on('open', () => cb({ ok: true }));
    peer.on('connection', dc => { dc.on('open', () => onConn(wrapPeerConn(dc))); });
    peer.on('error', e => cb({ error: e.type || String(e), type: e.type }));
    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ok */ } });
    return h;
  }

  function peerClientOpen(code, cb) {
    if (!hasPeer()) { cb({ error: 'PeerJS saknas (vendor/peerjs.min.js kunde inte laddas).' }); return null; }
    const peer = new Peer(undefined, peerOpts());
    const h = { peer, close() { try { peer.destroy(); } catch (e) { /* ok */ } } };
    peer.on('open', () => {
      const dc = peer.connect('osten-' + code, { reliable: true, serialization: 'json' });
      dc.on('open', () => cb({ ok: true, conn: wrapPeerConn(dc) }));
      dc.on('error', e => cb({ error: String(e) }));
    });
    peer.on('error', e => cb({ error: e.type || String(e), type: e.type }));
    return h;
  }

  /* ---------- Lokal transport (BroadcastChannel) för test ---------- */
  function localHostOpen(code, onConn, cb) {
    const ch = new BroadcastChannel('osten-local-' + code), conns = new Map();
    ch.onmessage = e => {
      const m = e.data;
      if (!m || m.to !== 'host') return;
      if (m.k === 'open') {
        const c = { id: m.from, onmessage: null, onclose: null };
        c.send = o => delayed(() => ch.postMessage({ to: m.from, from: 'host', k: 'data', d: JSON.parse(JSON.stringify(o)) }));
        c.close = () => ch.postMessage({ to: m.from, from: 'host', k: 'close' });
        conns.set(m.from, c);
        ch.postMessage({ to: m.from, from: 'host', k: 'accept' });
        onConn(c);
      } else if (m.k === 'data') { const c = conns.get(m.from); if (c) delayed(() => c.onmessage && c.onmessage(m.d)); }
      else if (m.k === 'close') { const c = conns.get(m.from); if (c) { conns.delete(m.from); c.onclose && c.onclose(); } }
    };
    setTimeout(() => cb({ ok: true }), 0);
    return { code, close() { ch.close(); } };
  }

  function localClientOpen(code, cb) {
    const ch = new BroadcastChannel('osten-local-' + code), id = 'c' + Math.random().toString(36).slice(2, 8);
    const c = { id: 'host', onmessage: null, onclose: null };
    let accepted = false;
    c.send = o => delayed(() => ch.postMessage({ to: 'host', from: id, k: 'data', d: JSON.parse(JSON.stringify(o)) }));
    c.close = () => { ch.postMessage({ to: 'host', from: id, k: 'close' }); ch.close(); };
    ch.onmessage = e => {
      const m = e.data;
      if (!m || m.to !== id) return;
      if (m.k === 'accept') { accepted = true; cb({ ok: true, conn: c }); }
      else if (m.k === 'data') delayed(() => c.onmessage && c.onmessage(m.d));
      else if (m.k === 'close') c.onclose && c.onclose();
    };
    ch.postMessage({ to: 'host', from: id, k: 'open' });
    setTimeout(() => { if (!accepted) cb({ error: 'peer-unavailable', type: 'peer-unavailable' }); }, 1500);
    return { close() { ch.close(); } };
  }

  const hostOpen = (code, onConn, cb) => conf.mode === 'local' ? localHostOpen(code, onConn, cb) : peerHostOpen(code, onConn, cb);
  const clientOpen = (code, cb) => conf.mode === 'local' ? localClientOpen(code, cb) : peerClientOpen(code, cb);

  return { conf, newCode, cleanCode, hostOpen, clientOpen, hasPeer };
})();

/* =====================================================================
   HOST-SESSION (används även för solo: en värd utan anslutningar)
   ===================================================================== */
class HostSession {
  constructor(o) {
    this.role = o.solo ? 'solo' : 'host';
    this.solo = !!o.solo;
    this.code = null;
    this.phase = 'lobby';        // lobby | match | results
    this.me = 0;
    this.nextPid = 1;
    this.roster = [{ id: 0, name: o.name, skin: o.skin | 0, weapon: null, locked: false, bot: false, spec: false, conn: null }];
    this.settings = { matchSec: 300, fill: true };
    this.sim = null; this.acc = 0; this.snapAcc = 0; this.pend = [];
    this.startInfo = null; this.results = null;
    this.cb = {};
    this.link = null;
  }

  /* ---- Rum ---- */
  open(done) {
    if (this.solo) { done && done(null); return; }
    let tries = 0;
    const attempt = () => {
      this.code = Net.newCode();
      this.link = Net.hostOpen(this.code, c => this.addConn(c), r => {
        if (r.ok) { done && done(null); return; }
        if (r.type === 'unavailable-id' && tries++ < 6) { try { this.link && this.link.close(); } catch (e) { /* ok */ } attempt(); return; }
        done && done(r.type === 'network' || r.type === 'server-error' || r.type === 'socket-error' || r.type === 'socket-closed' ?
          'Kunde inte nå signalservern. Kolla internetanslutningen (eller prova ?net=local för lokalt test).' : (r.error || 'Okänt fel'));
      });
    };
    attempt();
  }

  pub() {
    return this.roster.map(r => ({ id: r.id, name: r.name, skin: r.skin, locked: r.locked, bot: r.bot, spec: r.spec }));
  }
  lobbyState() {
    const me = this.roster[0];
    return {
      role: this.role, code: this.code, phase: this.phase, you: 0, host: true, players: this.pub(), settings: this.settings,
      canStart: this.canStart(), myWeapon: me.weapon, locked: me.locked
    };
  }
  broadcastLobby() {
    const m = { t: 'lobby', roster: this.pub(), settings: this.settings, phase: this.phase };
    for (const r of this.roster) if (r.conn) r.conn.send(m);
    this.cb.lobby && this.cb.lobby(this.lobbyState());
  }
  humans() { return this.roster.filter(r => !r.bot && !r.spec); }
  canStart() { const h = this.humans(); return this.phase === 'lobby' && h.length > 0 && h.every(r => r.locked); }

  /* ---- Anslutningar ---- */
  addConn(conn) {
    conn.onmessage = m => this.onMsg(conn, m);
    conn.onclose = () => this.onClose(conn);
  }
  onMsg(conn, m) {
    if (!m || typeof m !== 'object') return;
    const r = this.roster.find(x => x.conn === conn);
    switch (m.t) {
      case 'hello': {
        if (r) return;
        if (m.v !== PROTO_VERSION) { conn.send({ t: 'bad', msg: 'Olika spelversioner – ladda om sidan.' }); setTimeout(() => conn.close(), 300); return; }
        if (this.roster.filter(x => !x.bot).length >= CFG.maxPlayers) { conn.send({ t: 'bad', msg: 'Rummet är fullt.' }); setTimeout(() => conn.close(), 300); return; }
        const spec = this.phase !== 'lobby';
        const entry = { id: this.nextPid++, name: this.cleanName(m.name), skin: this.freeSkin(m.skin), weapon: null, locked: false, bot: false, spec, conn };
        this.roster.push(entry);
        conn.send({ t: 'welcome', pid: entry.id, spec, code: this.code, roster: this.pub(), settings: this.settings, phase: this.phase, start: spec ? this.startInfo : null });
        this.broadcastLobby();
        this.cb.toast && this.cb.toast(entry.name + ' gick med');
        break;
      }
      case 'prof':
        if (r && !r.locked && this.phase === 'lobby') {
          r.name = this.cleanName(m.name);
          if (Number.isInteger(m.skin) && m.skin >= 0 && m.skin < SKINS.length && !this.roster.some(x => x !== r && !x.bot && x.skin === m.skin)) r.skin = m.skin;
          this.broadcastLobby();
        }
        break;
      case 'pick':
        if (r && !r.locked && !r.spec && this.phase === 'lobby' && WEAPONS[m.w]) {
          r.weapon = m.w; r.locked = true;
          conn.send({ t: 'picked', w: m.w });
          this.broadcastLobby();
        }
        break;
      case 'inp':
        if (r && this.sim && !r.spec) this.sim.setInput(r.id, m);
        break;
      case 'ping': conn.send({ t: 'pong', ts: m.ts }); break;
      case 'leave': this.onClose(conn); break;
    }
  }
  onClose(conn) {
    const i = this.roster.findIndex(x => x.conn === conn);
    if (i < 0) return;
    const r = this.roster[i];
    r.conn = null;
    if (this.phase === 'match' && this.sim && !r.spec) {
      this.sim.toBot(r.id); r.bot = true;
      this.pend.push(['left', r.id]);
      this.cb.events && this.cb.events([['left', r.id]]);
    } else this.roster.splice(i, 1);
    this.cb.toast && this.cb.toast(r.name + ' lämnade');
    this.broadcastLobby();
  }
  cleanName(n) { n = String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 14); return n || 'Spelare'; }
  freeSkin(want) {
    const used = new Set(this.roster.filter(x => !x.bot).map(x => x.skin));
    if (Number.isInteger(want) && want >= 0 && want < SKINS.length && !used.has(want)) return want;
    for (let i = 0; i < SKINS.length; i++) if (!used.has(i)) return i;
    return 0;
  }

  /* ---- Lobbyval (värdens egna) ---- */
  setProfile(name, skin) {
    const r = this.roster[0];
    if (r.locked || this.phase !== 'lobby') return;
    r.name = this.cleanName(name);
    if (Number.isInteger(skin) && !this.roster.some(x => x !== r && !x.bot && x.skin === skin)) r.skin = skin;
    this.broadcastLobby();
  }
  pick(w) {
    const r = this.roster[0];
    if (r.locked || !WEAPONS[w] || this.phase !== 'lobby') return;
    r.weapon = w; r.locked = true;
    this.broadcastLobby();
  }
  setSettings(s) {
    if (this.phase !== 'lobby') return;
    if (s.matchSec && [60, 120, 300].includes(s.matchSec)) this.settings.matchSec = s.matchSec;
    if (typeof s.fill === 'boolean') this.settings.fill = s.fill;
    this.broadcastLobby();
  }

  /* ---- Start / match ---- */
  start() {
    if (!this.canStart()) return false;
    const hum = this.humans(), players = [];
    for (const r of hum) players.push({ id: r.id, name: r.name, skin: r.skin, weapon: r.weapon, bot: false });
    const usedSkins = new Set(players.map(p => p.skin)), usedNames = new Set(players.map(p => p.name));
    const spare = [];
    for (let i = 0; i < SKINS.length; i++) if (!usedSkins.has(i)) spare.push(i);
    const names = BOT_NAMES.slice().sort(() => Math.random() - 0.5).filter(n => !usedNames.has(n));
    let nb = this.settings.fill ? Math.max(0, CFG.maxPlayers - players.length) : (players.length < 2 ? 1 : 0);
    nb = Math.min(nb, spare.length);
    for (let i = 0; i < nb; i++) {
      players.push({ id: 100 + i, name: names[i] || 'Bot ' + (i + 1), skin: spare[i], weapon: WEAPON_ORDER[(Math.random() * WEAPON_ORDER.length) | 0], bot: true });
    }
    const seed = (Math.random() * 0xFFFFFFFF) >>> 0;
    this.sim = new Sim({ seed, players, matchSec: this.settings.matchSec });
    this.startInfo = { seed, matchSec: this.settings.matchSec, players: players.map(p => ({ id: p.id, name: p.name, skin: p.skin, weapon: p.weapon, bot: p.bot })) };
    this.phase = 'match'; this.acc = 0; this.snapAcc = 0; this.pend = []; this.results = null;
    for (const r of this.roster) if (r.conn) r.conn.send({ t: 'start', info: this.startInfo });
    this.cb.start && this.cb.start(this.startInfo);
    this.broadcastLobby();
    return true;
  }

  setLocalInput(inp) { if (this.sim && this.phase === 'match') this.sim.setInput(0, inp); }

  update(dt) {
    if (this.phase !== 'match' || !this.sim) return;
    this.acc += Math.min(dt, 0.1);
    this.snapAcc += Math.min(dt, 0.1);
    let steps = 0;
    while (this.acc >= CFG.dt && steps < 8) { this.sim.step(CFG.dt); this.acc -= CFG.dt; steps++; }
    const ev = this.sim.drainEvents();
    if (ev.length) { this.pend.push(...ev); this.cb.events && this.cb.events(ev); }
    const over = this.sim.over;
    if (this.snapAcc >= 1 / CFG.snapHz || over) {
      this.snapAcc = 0;
      if (this.hasRemote()) {
        const m = { t: 'snap', s: encodeView(this.sim.makeView()), e: this.pend };
        for (const r of this.roster) if (r.conn) r.conn.send(m, true);
      }
      this.pend = [];
    }
    if (over) {
      this.phase = 'results'; this.results = this.sim.results;
      const end = { t: 'end', results: this.results };
      for (const r of this.roster) if (r.conn) r.conn.send(end);
      this.cb.end && this.cb.end(this.results);
    }
  }
  hasRemote() { return this.roster.some(r => r.conn); }
  getView() { return this.sim ? this.sim.makeView() : null; }
  myPlayerMeta() { return this.startInfo ? this.startInfo.players.find(p => p.id === 0) : null; }

  backToLobby() {
    if (this.phase === 'lobby') return;
    this.phase = 'lobby'; this.sim = null; this.startInfo = null;
    this.roster = this.roster.filter(r => !r.bot);
    for (const r of this.roster) { r.locked = false; r.weapon = null; r.spec = false; }
    for (const r of this.roster) if (r.conn) r.conn.send({ t: 'toLobby' });
    this.broadcastLobby();
    this.cb.toLobby && this.cb.toLobby();
  }

  leave() {
    for (const r of this.roster) if (r.conn) { try { r.conn.send({ t: 'bad', msg: 'Värden avslutade rummet.' }); r.conn.close(); } catch (e) { /* ok */ } }
    if (this.link) this.link.close();
    this.sim = null;
  }
}

/* =====================================================================
   KLIENT-SESSION
   ===================================================================== */
class ClientSession {
  constructor(o) {
    this.role = 'client';
    this.code = o.code;
    this.phase = 'connecting';
    this.me = -1; this.spec = false;
    this.roster = []; this.settings = { matchSec: 300, fill: true };
    this.myWeapon = null; this.locked = false;
    this.cb = {};
    this.conn = null; this.link = null;
    this.startInfo = null; this.map = null; this.metaById = new Map();
    this.buf = []; this.offset = null; this.rtt = 0.06; this.lastRecv = 0;
    this.dead = new Set(); this.pred = null; this.world = null; this.curInp = null; this.inSeq = 0; this.sendAcc = 0;
    this.results = null;
    this.profile = { name: o.name, skin: o.skin };
  }

  connect(done) {
    let finished = false;
    const fin = e => { if (!finished) { finished = true; done && done(e); } };
    this.link = Net.clientOpen(this.code, r => {
      if (r.error) {
        fin(r.type === 'peer-unavailable' ? 'Hittar inget rum med koden ' + this.code + '.' :
          r.type === 'network' || r.type === 'server-error' || r.type === 'socket-error' ? 'Kunde inte nå signalservern.' : 'Anslutningen misslyckades (' + r.error + ').');
        return;
      }
      this.conn = r.conn;
      this.conn.onmessage = m => this.onMsg(m, fin);
      this.conn.onclose = () => { if (this.phase !== 'closed') { this.phase = 'closed'; this.cb.closed && this.cb.closed('Anslutningen till värden bröts.'); } };
      this.conn.send({ t: 'hello', v: PROTO_VERSION, name: this.profile.name, skin: this.profile.skin });
      setTimeout(() => fin('Värden svarade inte.'), 8000);
    });
  }

  send(o, droppable) { if (this.conn) this.conn.send(o, droppable); }

  lobbyState() {
    return {
      role: 'client', code: this.code, phase: this.phase, you: this.me, host: false, players: this.roster, settings: this.settings,
      canStart: false, myWeapon: this.myWeapon, locked: this.locked, spec: this.spec
    };
  }

  onMsg(m, fin) {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'welcome':
        this.me = m.spec ? -1 : m.pid; this.mePid = m.pid; this.spec = m.spec;
        this.roster = m.roster; this.settings = m.settings; this.code = m.code || this.code;
        this.phase = m.phase === 'lobby' ? 'lobby' : 'match';
        fin(null);
        if (m.start) this.beginMatch(m.start);
        this.cb.lobby && this.cb.lobby(this.lobbyState());
        this.pingT = setInterval(() => this.send({ t: 'ping', ts: performance.now() }), 2000);
        this.send({ t: 'ping', ts: performance.now() });
        break;
      case 'bad':
        fin(m.msg);
        if (this.phase !== 'closed') { this.phase = 'closed'; this.cb.closed && this.cb.closed(m.msg); }
        break;
      case 'lobby':
        this.roster = m.roster; this.settings = m.settings;
        if (m.phase === 'lobby' && this.phase !== 'lobby') this.phase = 'lobby';
        this.cb.lobby && this.cb.lobby(this.lobbyState());
        break;
      case 'picked': this.myWeapon = m.w; this.locked = true; this.cb.lobby && this.cb.lobby(this.lobbyState()); break;
      case 'start':
        this.spec = this.me < 0 ? true : false;
        this.beginMatch(m.info);
        this.cb.start && this.cb.start(m.info);
        break;
      case 'snap': this.onSnap(m); break;
      case 'end':
        this.phase = 'results'; this.results = m.results;
        this.cb.end && this.cb.end(m.results);
        break;
      case 'toLobby':
        this.phase = 'lobby'; this.locked = false; this.myWeapon = null; this.spec = false;
        this.me = this.mePid; this.buf = []; this.pred = null;
        this.cb.toLobby && this.cb.toLobby();
        this.cb.lobby && this.cb.lobby(this.lobbyState());
        break;
      case 'pong': {
        const rtt = (performance.now() - m.ts) / 1000;
        this.rtt = this.rtt * 0.7 + rtt * 0.3;
        break;
      }
    }
  }

  beginMatch(info) {
    this.phase = 'match'; this.startInfo = info;
    this.map = makeMap(info.seed);
    this.metaById = new Map(info.players.map(p => [p.id, p]));
    this.buf = []; this.offset = null; this.dead = new Set(); this.pred = null;
    this.world = { map: this.map, dead: this.dead };
    this.results = null;
  }

  /* ---- Snapshots ---- */
  onSnap(m) {
    const now = performance.now() / 1000, v = decodeView(m.s);
    this.dead = v.dead; if (this.world) this.world.dead = this.dead;
    if (this.offset === null) this.offset = now - v.t; else {
      const s = now - v.t;
      this.offset = s < this.offset ? s : this.offset + (s - this.offset) * 0.02;
    }
    this.buf.push({ t: v.t, v, recv: now });
    if (this.buf.length > 14) this.buf.shift();
    this.lastRecv = now;
    if (m.e && m.e.length && this.cb.events) this.cb.events(m.e);
    if (this.me >= 0) this.reconcile(v, now);
  }

  /* ---- Förutsägelse av den egna spelaren ---- */
  reconcile(v, now) {
    const a = v.players.find(p => p.id === this.me);
    if (!a) return;
    if (!this.pred) {
      this.pred = { id: this.me, x: a.x, y: a.y, cvx: a.vx, cvy: a.vy, evx: 0, evy: 0, dashT: 0, dashDx: 0, dashDy: 0, recT: 0, tkCd: 0, r: CFG.pr, st: a.st, carry: false, swinging: false, guard: false, daze: false, slowStink: false };
    }
    const P = this.pred;
    P.carry = a.carry; P.swinging = a.sw >= 0; P.guard = a.guard; P.daze = a.daze; P.slowStink = a.slow;
    P.tkCdAuth = a.tk * CFG.tkCd;
    if (a.st !== 0 || (a.dash && P.dashT <= 0)) {
      P.x = a.x; P.y = a.y; P.cvx = a.vx; P.cvy = a.vy; P.evx = P.evy = 0; P.st = a.st; P.dashT = a.dash ? 0.1 : 0;
      P.tkCd = P.tkCdAuth; this.authMe = a;
      return;
    }
    P.st = 0;
    this.authMe = a;
    const age = this.rtt / 2;
    const ex = a.x + a.vx * age - P.x, ey = a.y + a.vy * age - P.y, err = Math.hypot(ex, ey);
    if (err > 180) { P.x += ex; P.y += ey; P.cvx = a.vx; P.cvy = a.vy; }
    else { P.x += ex * 0.2; P.y += ey * 0.2; }
    if (Math.abs(P.tkCd - P.tkCdAuth) > 0.35) P.tkCd = P.tkCdAuth;
  }

  /* Anropas varje bildruta med aktuell input. Skickar input (~30 Hz) och förutsäger rörelsen. */
  tick(inp, dt) {
    this.curInp = inp;
    if (this.phase !== 'match' || this.me < 0) return;
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / 30 || inp.tk !== this.lastSentTk || inp.wp !== this.lastSentWp || inp.wr !== this.lastSentWr) {
      this.sendAcc = 0;
      this.lastSentTk = inp.tk; this.lastSentWp = inp.wp; this.lastSentWr = inp.wr;
      this.send({ t: 'inp', n: ++this.inSeq, mx: +inp.mx.toFixed(3), my: +inp.my.toFixed(3), a: +inp.a.toFixed(3), ad: Math.round(inp.ad), tk: inp.tk, wp: inp.wp, wr: inp.wr, wd: inp.wd }, true);
    }
    const P = this.pred;
    if (!P || P.st !== 0) return;
    if (this.predTk === undefined) this.predTk = inp.tk;
    P.tkCd = Math.max(0, P.tkCd - dt);
    if (inp.tk !== this.predTk) {
      this.predTk = inp.tk;
      if (P.tkCd <= 0 && P.dashT <= 0 && P.recT <= 0) {
        let dx = inp.mx, dy = inp.my; const l = Math.hypot(dx, dy);
        if (l < 0.2) { dx = Math.cos(inp.a); dy = Math.sin(inp.a); } else { dx /= l; dy /= l; }
        P.dashT = CFG.tkDur; P.dashDx = dx; P.dashDy = dy; P.tkCd = CFG.tkCd;
      }
    }
    motionStep(P, inp.mx, inp.my, dt, this.world);
    collideObstacles(P, this.world);
  }

  /* Vy att rita: interpolerad bas + egen förutsagd spelare */
  getView(now) {
    if (!this.buf.length) return null;
    const rt = now - this.offset - 0.1, buf = this.buf;
    let view;
    if (rt >= buf[buf.length - 1].t) {
      const last = buf[buf.length - 1], d = Math.min(rt - last.t, 0.15), v = last.v;
      view = Object.assign({}, v, {
        players: v.players.map(p => p.st === 0 ? Object.assign({}, p, { x: p.x + p.vx * d, y: p.y + p.vy * d }) : p),
        cheese: Object.assign({}, v.cheese, v.cheese.st === 'carried' ? {} : { x: v.cheese.x + v.cheese.vx * d, y: v.cheese.y + v.cheese.vy * d }),
        proj: v.proj.map(b => Object.assign({}, b, { x: b.x + b.vx * d, y: b.y + b.vy * d }))
      });
    } else if (rt <= buf[0].t) view = buf[0].v;
    else {
      let i = 0;
      while (i < buf.length - 2 && buf[i + 1].t < rt) i++;
      const A = buf[i], B = buf[i + 1];
      view = lerpView(A.v, B.v, clamp((rt - A.t) / Math.max(1e-4, B.t - A.t), 0, 1));
    }
    const P = this.pred;
    if (P && this.me >= 0 && P.st === 0) {
      const i = view.players.findIndex(p => p.id === this.me);
      if (i >= 0 && view.players[i].st === 0) {
        const me = Object.assign({}, view.players[i], { x: P.x, y: P.y, vx: P.cvx + P.evx, vy: P.cvy + P.evy });
        if (this.curInp && me.sw < 0) me.a = this.curInp.a;
        if (this.authMe) { me.score = this.authMe.score; me.wcd = this.authMe.wcd; me.m = this.authMe.m; me.tk = P.tkCd / CFG.tkCd; }
        view = Object.assign({}, view, { players: view.players.map((p, j) => j === i ? me : p) });
        if (view.cheese.st === 'carried' && view.cheese.by === this.me) view.cheese = Object.assign({}, view.cheese, { x: P.x, y: P.y });
      }
    }
    return view;
  }

  /* ---- Lobbyval ---- */
  setProfile(name, skin) { this.profile = { name, skin }; this.send({ t: 'prof', name, skin }); }
  pick(w) { if (!this.locked) this.send({ t: 'pick', w }); }

  leave() {
    this.phase = 'closed';
    clearInterval(this.pingT);
    try { if (this.conn) { this.conn.send({ t: 'leave' }); setTimeout(() => this.conn && this.conn.close(), 100); } } catch (e) { /* ok */ }
    setTimeout(() => this.link && this.link.close(), 200);
  }
}
