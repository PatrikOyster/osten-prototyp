'use strict';
/* =====================================================================
   MAIN – appens tillstånd, indata, spelloop och koppling mellan
   nät/sim, renderare, UI och ljud.
   Tillstånd: title -> lobby -> match -> results -> lobby ...
   ===================================================================== */

/* ---------- Indata: tangentbord + mus (dator) ---------- */
const Input = {
  keys: new Set(), tk: 0, wp: 0, wr: 0, wdM: false, wdK: false,
  mouse: { x: 0, y: 0, in: false, has: false }, lastA: 0, lastAd: 300,
  get wd() { return this.wdM || this.wdK; },

  init(canvas) {
    window.addEventListener('keydown', e => this.kd(e));
    window.addEventListener('keyup', e => this.ku(e));
    canvas.addEventListener('mousemove', e => this.mm(e));
    canvas.addEventListener('mouseenter', e => this.mm(e));
    canvas.addEventListener('mousedown', e => this.md(e));
    window.addEventListener('mouseup', e => this.mu(e));
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('mouseleave', () => { this.mouse.in = false; });
    window.addEventListener('blur', () => this.releaseAll());
  },
  active() { return App.state === 'match' && !App.paused && !App.spec; },
  typing(e) { const t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'); },

  kd(e) {
    if (e.code === 'KeyM' && !this.typing(e)) { const m = SFX.toggleMute(); UI.toast(m ? 'Ljud av' : 'Ljud på'); return; }
    if (e.code === 'Escape') { if (App.state === 'match') App.togglePause(); return; }
    if (this.typing(e) || !this.active()) return;
    switch (e.code) {
      case 'KeyW': case 'KeyA': case 'KeyS': case 'KeyD': case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight':
        this.keys.add(e.code); e.preventDefault(); break;
      case 'Space': case 'ShiftLeft': case 'ShiftRight':
        if (!e.repeat) this.tk++; e.preventDefault(); break;
      case 'KeyE': case 'KeyJ':
        if (!e.repeat) { this.wp++; this.wdK = true; } e.preventDefault(); break;
    }
  },
  ku(e) {
    this.keys.delete(e.code);
    if ((e.code === 'KeyE' || e.code === 'KeyJ') && this.wdK) { this.wdK = false; if (!this.wdM) this.wr++; }
  },
  mm(e) {
    const r = e.target.getBoundingClientRect ? e.target.getBoundingClientRect() : { left: 0, top: 0 };
    this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top; this.mouse.in = true; this.mouse.has = true;
  },
  md(e) {
    this.mm(e);
    SFX.unlock();
    if (!this.active()) return;
    if (e.button === 0) { this.wp++; this.wdM = true; }
    else if (e.button === 2) this.tk++;
    e.preventDefault();
  },
  mu(e) {
    if (e.button === 0 && this.wdM) { this.wdM = false; if (!this.wdK) this.wr++; }
  },
  releaseAll() {
    this.keys.clear();
    if (this.wd) this.wr++;
    this.wdM = this.wdK = false;
  },

  /* me = spelarens aktuella position (för sikte), R = renderare */
  get(me, R) {
    const K = c => this.keys.has(c);
    let mx = 0, my = 0;
    if (K('KeyA') || K('ArrowLeft')) mx -= 1;
    if (K('KeyD') || K('ArrowRight')) mx += 1;
    if (K('KeyW') || K('ArrowUp')) my -= 1;
    if (K('KeyS') || K('ArrowDown')) my += 1;
    const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
    let a = this.lastA, ad = this.lastAd;
    if (me && this.mouse.has) {
      const w = R.toWorld(this.mouse.x, this.mouse.y), dx = w.x - me.x, dy = w.y - me.y;
      a = Math.atan2(dy, dx); ad = Math.hypot(dx, dy);
    } else if (mx || my) { a = Math.atan2(my, mx); ad = 300; }
    this.lastA = a; this.lastAd = ad;
    return { mx, my, a, ad, tk: this.tk, wp: this.wp, wr: this.wr, wd: this.wd };
  },
  idle() { return { mx: 0, my: 0, a: this.lastA, ad: this.lastAd, tk: this.tk, wp: this.wp, wr: this.wr, wd: false }; }
};

/* ---------- Appen ---------- */
const App = {
  session: null, state: 'title', renderer: null, meta: [], me: -1, spec: false, paused: false,
  lastView: null, bgLast: 0, stats: { frames: 0, maxDt: 0, sumDt: 0 }, joinCode: null, resTimer: 0,

  boot() {
    const cv = $('game');
    this.renderer = new Renderer(cv);
    this.renderer.setMatch(this.bgMap('ile'), [], -1);
    Input.init(cv);
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('pointerdown', () => { SFX.unlock(); this.musicOn(); }, { once: false });
    window.addEventListener('keydown', () => { SFX.unlock(); this.musicOn(); });
    document.addEventListener('visibilitychange', () => { this.bgLast = performance.now(); });
    UI.init({
      host: (n, s) => this.startHost(n, s), solo: (n, s) => this.startSolo(n, s), join: (c, n, s) => this.startJoin(c, n, s),
      start: () => { const s = this.session; if (s && s.role !== 'client') s.start(); },
      pick: w => { const s = this.session; if (s) s.pick(w); },
      unpick: () => { const s = this.session; if (s && s.unpick) s.unpick(); },
      profile: (n, k) => { const s = this.session; if (s) s.setProfile(n, k); },
      settings: o => { const s = this.session; if (s && s.setSettings) s.setSettings(o); },
      leave: () => this.leave(), again: () => { const s = this.session; if (s && s.backToLobby) s.backToLobby(); },
      resume: () => this.togglePause(false)
    });
    this.readHash();
    window.addEventListener('hashchange', () => this.readHash());
    this.startTicker();
    this.bgLast = performance.now();
    let last = performance.now();
    const loop = ts => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (ts - last) / 1000); last = ts;
      this.frame(dt, ts / 1000);
    };
    requestAnimationFrame(loop);
  },

  readHash() {
    const m = /^#([A-Za-z]{4})$/.exec(location.hash) || /[?&]room=([A-Za-z]{4})\b/.exec(location.search);
    this.joinCode = m ? m[1].toUpperCase() : null;
    if (this.state === 'title') UI.setInvite(this.joinCode);
  },

  /* Lobbybakgrunden visar den valda banan. Banorna byggs bara en gång per sort. */
  bgMap(kind) {
    const k = MAPS[kind] ? kind : 'ile';
    this.bgMaps = this.bgMaps || {};
    return this.bgMaps[k] || (this.bgMaps[k] = makeMap(20261117, k));
  },
  lobbyBg(st) {
    if (this.state !== 'lobby' || !st || !st.settings) return;
    const k = MAPS[st.settings.map] ? st.settings.map : 'ile';
    if (!this.renderer.map || this.renderer.map.kind !== k) this.renderer.setMatch(this.bgMap(k), [], -1);
  },

  musicOn() { if (!this.musicStarted) { this.musicStarted = true; SFX.music(true); } SFX.musicLevel(this.state === 'match' ? 0.5 : 0.85); },

  /* ----- Sessioner ----- */
  attach(s) {
    s.cb = {
      lobby: st => { UI.setLobby(st); this.lobbyBg(st); },
      start: info => this.startMatch(info),
      events: evs => this.onEvents(evs),
      end: res => this.onEnd(res),
      toLobby: () => this.enterLobby(),
      toast: m => UI.toast(m),
      closed: msg => this.leave(msg || 'Anslutningen bröts.')
    };
    this.session = s;
  },
  startSolo(name, skin) {
    this.dispose();
    const s = new HostSession({ solo: true, name, skin }); this.attach(s);
    s.open(() => this.enterLobby());
  },
  startHost(name, skin) {
    this.dispose();
    UI.titleMsg('Skapar rum…');
    const s = new HostSession({ name, skin }); this.attach(s);
    s.open(err => {
      if (err) { UI.titleMsg(err); this.dispose(); return; }
      UI.titleMsg(''); this.enterLobby();
    });
  },
  startJoin(code, name, skin) {
    this.dispose();
    if (code.length !== 4) { UI.titleMsg('Skriv in den fyra bokstäver långa koden som värden skickat.'); return; }
    UI.titleMsg('Ansluter till ' + code + '…');
    const s = new ClientSession({ code, name, skin }); this.attach(s);
    s.connect(err => {
      if (err) { UI.titleMsg(err); this.dispose(); return; }
      UI.titleMsg('');
      if (s.phase === 'match' && s.startInfo) this.startMatch(s.startInfo); else this.enterLobby();
    });
  },
  dispose() { const s = this.session; this.session = null; if (s) { try { s.leave(); } catch (e) { /* ok */ } } },

  leave(msg) {
    this.dispose();
    this.state = 'title'; this.paused = false; this.lastView = null; clearTimeout(this.resTimer);
    Input.releaseAll();
    this.renderer.setMatch(this.bgMap('ile'), [], -1);
    if (location.hash) { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* ok */ } }
    this.joinCode = null; UI.setInvite(null);
    UI.screen('title'); UI.titleMsg(msg || '');
    this.musicOn();
  },

  enterLobby() {
    const s = this.session; if (!s) return;
    this.state = 'lobby'; this.paused = false; this.lastView = null; clearTimeout(this.resTimer);
    Input.releaseAll();
    UI.sel = null;
    UI.screen('lobby');
    const st = s.lobbyState();
    UI.setLobby(st);
    this.renderer.setMatch(this.bgMap(st.settings && st.settings.map), [], -1);
    this.musicOn();
  },

  startMatch(info) {
    const s = this.session; if (!s) return;
    const client = s.role === 'client';
    this.meta = info.players;
    this.spec = client ? s.me < 0 : false;
    this.me = client ? s.me : 0;
    this.renderer.setMatch(client ? s.map : s.sim.map, info.players, this.me);
    this.state = 'match'; this.paused = false; this.lastView = null; clearTimeout(this.resTimer);
    Input.releaseAll();
    UI.hudStart(info.players, this.me, this.spec);
    this.musicOn();
  },

  onEnd(res) {
    if (this.state !== 'match') return;
    this.state = 'results'; this.paused = false; UI.pause(false);
    Input.releaseAll();
    SFX.play(res.winner === this.me ? 'win' : 'whistle');
    const s = this.session;
    clearTimeout(this.resTimer);
    this.resTimer = setTimeout(() => {
      if (this.state !== 'results' || !this.session) return;
      UI.showResults(res, this.meta, this.me, s.role !== 'client');
      this.musicOn();
    }, 2600);
  },

  /* Solomatch (värd utan anslutna spelare) kan pausas på riktigt – annars går matchen vidare för de andra */
  isSolo() { const s = this.session; return !!s && s.role !== 'client' && !(s.hasRemote && s.hasRemote()); },
  togglePause(force) {
    if (this.state !== 'match') return;
    this.paused = force === undefined ? !this.paused : force;
    const s = this.session, host = s && s.role === 'host' && s.hasRemote && s.hasRemote();
    UI.pause(this.paused, host ? 'Du är värd – lämnar du matchen avslutas rummet för alla.' : '', this.isSolo());
    document.body.classList.toggle('playing', !this.paused);
    if (this.paused) Input.releaseAll();
  },

  /* ----- Händelser (kommer från sim/nät) ----- */
  onEvents(evs) {
    if (this.state !== 'match' && this.state !== 'results') return;
    this.renderer.onEvents(evs);
    UI.onEvents(evs);
    this.sound(evs);
  },

  sound(evs) {
    const me = this.me, cam = this.renderer.cam;
    const near = (x, y, r) => Math.hypot(x - cam.x, y - cam.y) < (r || 1250);
    for (const e of evs) {
      switch (e[0]) {
        case 'swing': if (near(e[3], e[4])) SFX.play('swing'); break;
        case 'squeak': if (near(e[2], e[3])) SFX.play('squeak'); break;
        case 'shoot': if (near(e[3], e[4])) SFX.play(e[2] === 'pigeon' ? 'pigeon' : 'shoot'); break;
        case 'tackle': if (near(e[2], e[3])) SFX.play('tackle'); break;
        case 'ko': {
          const cause = e[3];
          if (cause === 'drown' || cause === 'feu' || cause === 'champagne') break;
          if (e[1] === me) SFX.play('oof'); else if (near(e[4], e[5])) SFX.play(cause === 'poele' ? 'clang' : 'bonk');
          break;
        }
        case 'pick': SFX.play('pick'); break;
        case 'drop': SFX.play('drop'); break;
        case 'boom': if (near(e[2], e[3], 1600)) SFX.play(e[1] === 'feu' ? 'boom' : 'pop'); break;
        case 'splash': if (near(e[1], e[2])) SFX.play('splash'); break;
        case 'respawn': if (e[1] === me) SFX.play('respawn'); break;
        case 'clang': if (near(e[1], e[2])) SFX.play('clang'); break;
        case 'boing': if (near(e[1], e[2])) SFX.play('boing'); break;
        case 'stink': if (near(e[1], e[2])) SFX.play('stink'); break;
        case 'crash': if (near(e[2], e[3])) SFX.play('crash'); break;
        case 'overheat': SFX.play('overheat'); break;
        case 'parisduva': SFX.play('pigeon'); SFX.play('alert'); break;
      }
    }
  },

  /* ----- Värden fortsätter simulera även om fliken är i bakgrunden ----- */
  startTicker() {
    try {
      const src = 'let id=null;onmessage=e=>{if(e.data==="start"){if(!id)id=setInterval(()=>postMessage(1),33);}else{clearInterval(id);id=null;}}';
      const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onmessage = () => this.bgTick();
      w.postMessage('start');
      this.ticker = w;
    } catch (e) { this.ticker = null; }
  },
  bgTick() {
    const s = this.session;
    if (!document.hidden || !s || s.role !== 'host' || s.phase !== 'match') return;
    const now = performance.now(), dt = Math.min(0.1, (now - this.bgLast) / 1000); this.bgLast = now;
    s.update(dt);
  },

  /* ----- Huvudloop ----- */
  frame(dt, now) {
    const st = this.stats; st.frames++; st.sumDt += dt; if (dt > st.maxDt) st.maxDt = dt;
    const s = this.session, R = this.renderer;
    if (document.hidden) { this.bgLast = performance.now(); }
    if (!s || (this.state !== 'match' && this.state !== 'results')) { R.frame(null, dt, { hideHud: true }); return; }
    const meP = this.lastView && this.me >= 0 ? this.lastView.players.find(p => p.id === this.me) : null;
    const playing = this.state === 'match', canAct = playing && !this.paused && !this.spec;
    const inp = canAct ? Input.get(meP, R) : Input.idle();
    let view = null;
    if (s.role === 'client') {
      if (playing && this.me >= 0) s.tick(inp, dt);
      view = s.getView(now);
    } else {
      if (playing && !document.hidden && !(this.paused && this.isSolo())) { s.setLocalInput(inp); s.update(dt); }
      view = s.getView();
    }
    if (view) this.lastView = view;
    R.mouse = Input.mouse;
    R.frame(view, dt, { aim: { a: inp.a, ad: inp.ad }, reticle: canAct && Input.mouse.in, hideHud: this.state === 'results' });
    if (playing && view) {
      let info = '';
      if (s.role === 'client') info = Math.round(s.rtt * 1000) + ' ms';
      else if (s.role === 'host') info = 'Värd · ' + s.roster.filter(r => r.conn).length + ' anslutna';
      UI.hudUpdate(view, now, info);
    }
  }
};

window.addEventListener('DOMContentLoaded', () => App.boot());
