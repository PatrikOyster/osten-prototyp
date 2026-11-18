'use strict';
/* =====================================================================
   UI – titel, lobby, HUD, avslöjande och resultat. Ren DOM.
   All speltext är på svenska med lite franskt kryddat.
   ===================================================================== */
const $ = id => document.getElementById(id);

/* Sparar namn/tröja lokalt – men aldrig i en inbäddad förhandsvisning (där lagring ofta saknas). */
const Store = {
  ok: (() => { try { return window.self === window.top && !!window.localStorage; } catch (e) { return false; } })(),
  get(k, d) { if (!this.ok) return d; try { const v = localStorage.getItem('osten.' + k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { if (!this.ok) return; try { localStorage.setItem('osten.' + k, v); } catch (e) { /* ok */ } }
};

const UI = {
  h: {}, sel: null, lobby: null, hud: null, linkBase: '',

  init(h) {
    this.h = h;
    this.linkBase = location.protocol === 'file:' ? location.href.split('#')[0].split('?')[0] : location.origin + location.pathname;
    $('ver').textContent = 'v' + GAME_VERSION;
    // telefon/platta utan mus: spelet kräver tangentbord och mus (mobil är uppskjutet)
    const coarse = !!window.matchMedia && matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
    $('touch-note').classList.toggle('hidden', !coarse);
    // titel: figurer
    const row = $('title-chars');
    for (let i = 0; i < SKINS.length; i++) { const cv = document.createElement('canvas'); cv.width = 116; cv.height = 156; drawPortrait(cv, i, { a: 0.4 }); row.appendChild(cv); }
    const nm = $('name');
    nm.value = Store.get('name', '') || '';
    $('btn-host').onclick = () => { SFX.unlock(); h.host(this.name(), this.skinPref()); };
    $('btn-solo').onclick = () => { SFX.unlock(); h.solo(this.name(), this.skinPref()); };
    $('btn-join').onclick = () => { SFX.unlock(); h.join(Net.cleanCode($('code').value), this.name(), this.skinPref()); };
    $('code').addEventListener('input', e => { e.target.value = Net.cleanCode(e.target.value); });
    $('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('btn-join').click(); });
    nm.addEventListener('keydown', e => { if (e.key === 'Enter') ($('invite').classList.contains('hidden') ? $('btn-host') : $('btn-join')).click(); });
    nm.addEventListener('input', () => Store.set('name', nm.value.trim()));
    // lobby
    this.buildWeapons();
    this.buildMaps();
    $('btn-lock').onclick = () => { if (this.sel) h.pick(this.sel); };
    $('btn-unlock').onclick = () => {   // lås upp och välj om (går bara före matchstart – värden avgör)
      const st = this.lobby; if (!st || !st.locked || st.spec) return;
      if (st.myWeapon) this.sel = st.myWeapon;   // det tidigare valet är förvalt
      h.unpick(); SFX.play('click');
    };
    $('btn-start').onclick = () => h.start();
    $('btn-leave').onclick = () => h.leave();
    $('btn-leave2').onclick = () => h.leave();
    $('btn-again').onclick = () => h.again();
    $('btn-resume').onclick = () => h.resume();
    $('btn-quit').onclick = () => h.leave();
    $('btn-copy').onclick = () => this.copyLink();
    $('room-link').addEventListener('focus', e => e.target.select());
    for (const b of $('seg-len').querySelectorAll('button')) b.onclick = () => { if (this.lobby && this.lobby.host) h.settings({ matchSec: +b.dataset.v }); };
    $('bots-minus').onclick = () => this.stepBots(-1);
    $('bots-plus').onclick = () => this.stepBots(1);
    const ln = $('lobby-name');
    ln.addEventListener('change', () => { Store.set('name', ln.value.trim()); nm.value = ln.value.trim(); h.profile(ln.value.trim(), this.mySkin()); });
    ln.addEventListener('keydown', e => { if (e.key === 'Enter') ln.blur(); });
  },

  /* Banväljare: ett kort per bana med förhandsbild. Värden väljer, övriga ser valet. */
  buildMaps() {
    const box = $('map-sel'); box.innerHTML = '';
    for (const id of MAP_ORDER) {
      const m = MAPS[id], b = document.createElement('button');
      b.type = 'button'; b.className = 'mapcard'; b.dataset.m = id; b.title = m.desc;
      const cv = document.createElement('canvas'); cv.width = 256; cv.height = 144; drawMapThumb(cv, id);
      const t = document.createElement('span'); t.className = 'mc-t'; t.textContent = m.name;
      const sm = document.createElement('small'); sm.textContent = m.fr; t.appendChild(sm);
      b.appendChild(cv); b.appendChild(t);
      b.onclick = () => { const st = this.lobby; if (st && st.host && st.settings.map !== id) { this.h.settings({ map: id }); SFX.play('click'); } };
      box.appendChild(b);
    }
  },

  /* Botantal: det som visas är det som blir (värdens önskan, begränsad av lediga platser). */
  botsInfo(st) {
    const humans = st.players.filter(p => !p.bot && !p.spec).length;
    return { humans, eff: botCount(humans, st.settings.bots), min: humans < 2 ? 1 : 0, max: Math.max(0, CFG.maxPlayers - humans) };
  },
  stepBots(d) {
    const st = this.lobby; if (!st || !st.host) return;
    const b = this.botsInfo(st), n = clamp(b.eff + d, b.min, b.max);
    if (n !== b.eff) { this.h.settings({ bots: n }); SFX.play('click'); }
  },

  name() {
    let n = $('name').value.trim();
    if (!n) { n = BOT_NAMES[(Math.random() * BOT_NAMES.length) | 0]; $('name').value = n; }
    Store.set('name', n);
    return n;
  },
  skinPref() { const s = parseInt(Store.get('skin', ''), 10); return Number.isInteger(s) && s >= 0 && s < SKINS.length ? s : (Math.random() * SKINS.length) | 0; },
  mySkin() { const st = this.lobby; const p = st && st.players.find(x => x.id === st.you); return p ? p.skin : 0; },

  screen(name) {
    for (const id of ['title', 'lobby', 'results']) $(id).classList.toggle('hidden', id !== name);
    $('hud').classList.toggle('hidden', name !== 'hud');
    if (name !== 'hud') { $('reveal').classList.add('hidden'); $('pause').classList.add('hidden'); }
    document.body.classList.toggle('playing', name === 'hud');
    if (name !== 'results') $('confetti').innerHTML = '';
  },

  titleMsg(m) { $('title-msg').textContent = m || ''; },
  setInvite(code) {
    const on = !!code;
    $('invite').classList.toggle('hidden', !on);
    $('main-btns').classList.toggle('hidden', on);
    $('btn-join').textContent = on ? 'Gå med i rummet' : 'Gå med i rum';
    $('btn-join').classList.toggle('primary', on);
    if (on) { $('invite-code').textContent = code; $('code').value = code; }
  },
  toast(msg) {
    const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; $('toast').appendChild(d);
    setTimeout(() => d.classList.add('fade'), 2600); setTimeout(() => d.remove(), 3200);
  },
  pause(on, warn, solo) {
    $('pause').classList.toggle('hidden', !on);
    $('pause-warn').textContent = on ? (warn || '') : '';
    $('pause-info').textContent = solo ? 'Matchen är pausad.' : 'Matchen fortsätter för de andra medan du är här.';
  },

  /* ------------------------------------------------------------------ Lobby */
  linkFor(code) { return this.linkBase + '#' + code; },
  copyLink() {
    const inp = $('room-link'), txt = inp.value;
    const done = () => { this.toast('Länken är kopierad – skicka den till kompisarna!'); };
    const fallback = () => { inp.focus(); inp.select(); try { document.execCommand('copy'); done(); } catch (e) { this.toast('Markera länken och tryck Ctrl+C'); } };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(done, fallback); else fallback();
  },

  buildWeapons() {
    const g = $('weapon-grid'); g.innerHTML = '';
    for (const id of WEAPON_ORDER) {
      const W = WEAPONS[id], d = document.createElement('div');
      d.className = 'wcard'; d.dataset.w = id;
      d.innerHTML = '<canvas width="240" height="100"></canvas><div class="wn"></div><div class="wt"></div>';
      d.querySelector('.wn').textContent = W.name; d.querySelector('.wt').textContent = W.tag;
      drawWeaponTo(d.querySelector('canvas'), id, {});
      d.onclick = () => { if (this.lobby && !this.lobby.locked && !this.lobby.spec) { this.sel = id; this.updateWeaponUI(); SFX.play('click'); } };
      g.appendChild(d);
    }
    const dc = document.createElement('canvas'); dc.width = 236; dc.height = 156; $('weapon-detail').innerHTML = '<canvas width="236" height="156"></canvas><div><div class="wd-fr"></div><div class="wd-n"></div><div class="wd-d"></div></div>';
  },

  setLobby(st) {
    this.lobby = st;
    const multi = st.role !== 'solo';
    $('room-box').classList.toggle('hidden', !multi);
    if (multi) { $('room-code').textContent = st.code || '----'; $('room-link').value = this.linkFor(st.code || ''); }
    // spelarlista
    const list = $('player-list'); list.innerHTML = '';
    for (const p of st.players) {
      const r = document.createElement('div'); r.className = 'prow' + (p.id === st.you ? ' me' : '');
      const cv = document.createElement('canvas'); cv.width = 88; cv.height = 88; drawPortrait(cv, p.skin);
      const nm = document.createElement('div'); nm.className = 'pn'; nm.textContent = p.name;
      if (p.id === st.you) { const s = document.createElement('small'); s.textContent = '(du)'; nm.appendChild(s); }
      r.appendChild(cv); r.appendChild(nm);
      const tag = (t, c) => { const s = document.createElement('span'); s.className = 'tag ' + c; s.textContent = t; r.appendChild(s); };
      if (p.id === 0 && multi) tag('Värd', 'host');
      if (p.spec) tag('Åskådare', 'spec'); else if (p.locked) tag('Klar', 'ok'); else tag('Väljer…', 'wait');
      list.appendChild(r);
    }
    // inställningar
    const host = st.host, set = st.settings;
    for (const b of $('map-sel').children) { b.classList.toggle('on', b.dataset.m === set.map); b.classList.toggle('dis', !host); }
    for (const b of $('seg-len').querySelectorAll('button')) b.classList.toggle('on', +b.dataset.v === set.matchSec);
    $('seg-len').classList.toggle('dis', !host);
    const bi = this.botsInfo(st);
    $('bots-n').textContent = bi.eff;
    $('bots-minus').disabled = !host || bi.eff <= bi.min;
    $('bots-plus').disabled = !host || bi.eff >= bi.max;
    $('step-bots').classList.toggle('dis', !host);
    $('bots-note').textContent = 'Matchen blir ' + (bi.humans + bi.eff) + ' spelare: ' + bi.humans + (bi.humans === 1 ? ' människa' : ' människor') + ' + ' + bi.eff + (bi.eff === 1 ? ' bot' : ' botar') + (bi.humans < 2 && bi.eff === 1 ? ' (en ensam spelare får alltid minst en motståndare)' : '') + '.';
    // start
    const humans = st.players.filter(p => !p.bot && !p.spec), done = humans.filter(p => p.locked).length;
    const bs = $('btn-start');
    bs.classList.toggle('hidden', !host);
    bs.disabled = !st.canStart;
    bs.textContent = st.canStart ? 'Starta matchen!' : (st.locked ? 'Väntar på de andra (' + done + '/' + humans.length + ')…' : 'Lås in ditt vapen för att kunna starta');
    const ro = $('row-ro');
    ro.classList.toggle('hidden', host);
    $('ro-text').textContent = host ? '' : (st.locked ? 'Väntar på att värden startar (' + done + '/' + humans.length + ' klara)…' : 'Värden bestämmer bana, matchlängd och botar.');
    $('btn-leave').textContent = host && multi ? 'Stäng rummet' : st.role === 'solo' ? 'Tillbaka' : 'Lämna rummet';
    this.updateWeaponUI();
    // tröjor
    const row = $('skin-row'); row.innerHTML = '';
    const mine = this.mySkin();
    for (let i = 0; i < SKINS.length; i++) {
      const taken = st.players.some(p => !p.bot && p.id !== st.you && p.skin === i);
      const b = document.createElement('button'); b.className = 'skin' + (i === mine ? ' on' : '') + (taken ? ' taken' : '') + (st.locked ? ' dis' : '');
      b.title = SKINS[i].name;
      const cv = document.createElement('canvas'); cv.width = 112; cv.height = 132; drawPortrait(cv, i, { a: 0.4 }); b.appendChild(cv);
      b.onclick = () => { if (taken || st.locked || i === mine) return; Store.set('skin', String(i)); this.h.profile($('lobby-name').value.trim() || this.name(), i); SFX.play('click'); };
      row.appendChild(b);
    }
    const ln = $('lobby-name'); if (document.activeElement !== ln) { const me = st.players.find(p => p.id === st.you); if (me) ln.value = me.name; }
    ln.disabled = !!st.locked;
  },

  updateWeaponUI() {
    const st = this.lobby; if (!st) return;
    const locked = !!st.locked, shown = locked ? st.myWeapon : this.sel;
    for (const c of $('weapon-grid').children) {
      c.classList.toggle('sel', !locked && c.dataset.w === this.sel);
      c.classList.toggle('locked', locked && c.dataset.w === st.myWeapon);
      c.classList.toggle('dim', locked && c.dataset.w !== st.myWeapon);
    }
    const det = $('weapon-detail');
    if (shown) {
      const W = WEAPONS[shown];
      drawWeaponTo(det.querySelector('canvas'), shown, {});
      det.querySelector('.wd-fr').textContent = W.fr + ' · ' + W.tag;
      det.querySelector('.wd-n').textContent = W.name;
      det.querySelector('.wd-d').textContent = W.desc + ' ' + this.controlsFor(W);
    } else {
      det.querySelector('canvas').getContext('2d').clearRect(0, 0, 240, 160);
      det.querySelector('.wd-fr').textContent = 'Inget valt än';
      det.querySelector('.wd-n').textContent = 'Klicka på ett vapen';
      det.querySelector('.wd-d').textContent = 'Du ser bara din egen sida – ingen vet vad du väljer förrän matchen börjar.';
    }
    const bl = $('btn-lock');
    bl.classList.toggle('hidden', locked);
    bl.disabled = !this.sel;
    bl.textContent = this.sel ? 'Lås in: ' + WEAPONS[this.sel].name : 'Välj ett vapen';
    $('btn-unlock').classList.toggle('hidden', !locked || !!st.spec);
    $('lock-msg').textContent = locked ? 'Låst! Du startar med ' + WEAPONS[st.myWeapon].name.toLowerCase() + ' varje gång du blir utslagen. Ångrar du dig kan du byta fram till matchstart.' : '';
  },
  controlsFor(W) {
    switch (W.kind) {
      case 'pan': return 'Håll in vapenknappen för att blocka, släpp för att slå.';
      case 'blow': return 'Håll in vapenknappen för att blåsa.';
      case 'rocket': case 'can': return 'Sikta med musen – avståndet till markören avgör hur långt det flyger.';
      case 'mine': return 'Klicka för att lägga ut en flaska där du står.';
      case 'pad': return 'Klicka för att lägga ut en studsmatta i siktets riktning.';
      default: return 'Klicka för att använda.';
    }
  },

  /* ------------------------------------------------------------------ HUD */
  hudStart(meta, me, spec) {
    const h = this.hud = {
      meta: new Map(meta.map(p => [p.id, p])), order: meta.map(p => p.id), me, spec, rows: new Map(), lastBoard: 0, count: -1, phase: null,
      ko: null, feed: [], startAt: performance.now(), wcd: -1, tk: -1, badge: '', wdis: false, tdis: false, galeTip: '', timerTxt: '', net: '', bannerT: 0, goT: 0
    };
    const board = $('board'); board.innerHTML = '';
    for (const p of meta) {
      const r = document.createElement('div'); r.className = 'brow' + (p.id === me ? ' me' : '');
      const cv = document.createElement('canvas'); cv.className = 'mini'; cv.width = 60; cv.height = 60; drawPortrait(cv, p.skin);
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = p.name;
      const sc = document.createElement('span'); sc.className = 'sc'; sc.textContent = '0.0';
      const ch = document.createElement('canvas'); ch.className = 'chz'; ch.width = 48; ch.height = 44; drawCheeseTo(ch, 1);
      r.append(cv, nm, sc, ch); board.appendChild(r); h.rows.set(p.id, { el: r, sc, last: -1, rank: -1, has: false });
    }
    $('feed').innerHTML = ''; $('banner').className = ''; $('bigcount').textContent = '';
    $('ko-box').classList.add('hidden'); $('gale-box').classList.add('hidden'); h.galeOn = false; h.galeV = -1; $('spec-tag').classList.toggle('hidden', !spec);
    $('ring-weapon').classList.toggle('hidden', spec); $('ring-tackle').classList.toggle('hidden', spec);
    const mine = h.meta.get(me);
    if (mine && !spec) {
      const W = WEAPONS[mine.weapon];
      drawWeaponTo($('hud-weapon'), mine.weapon, {});
      $('hud-wkey').textContent = W.kind === 'pan' || W.kind === 'blow' ? 'Håll klick' : 'Klick / E';
      drawTackleIcon($('hud-tackle'));
    }
    $('hud-help').style.opacity = 1;
    $('timer').classList.remove('low');
    $('net-info').textContent = '';
    this.screen('hud');
  },

  fmt(sec) { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'); },

  banner(txt, ms) {
    const b = $('banner'); b.textContent = txt; b.className = ''; void b.offsetWidth; b.className = 'show';
    clearTimeout(this._bt); this._bt = setTimeout(() => { b.className = ''; }, ms || 2200);
  },

  feedLine(parts, cls) {
    const h = this.hud; if (!h) return;
    const d = document.createElement('div'); d.className = 'fline' + (cls ? ' ' + cls : '');
    for (const p of parts) { if (typeof p === 'string') d.appendChild(document.createTextNode(p)); else { const b = document.createElement('b'); b.textContent = p.n; d.appendChild(b); } }
    const f = $('feed'); f.appendChild(d);
    while (f.children.length > 5) f.removeChild(f.firstChild);
    setTimeout(() => d.classList.add('fade'), 5200); setTimeout(() => d.remove(), 5900);
  },

  koParts(e) {
    const h = this.hud, N = id => { const m = h.meta.get(id); return { n: m ? m.name : '?' }; };
    const v = e[1], by = e[2], cause = e[3], W = WEAPONS[cause];
    if (cause === 'drown') return by >= 0 && by !== v ? [N(by), ' skickade ', N(v), ' på ett dopp'] : [N(v), ' tog ett dopp'];
    if (cause === 'tackle') return [N(by), ' tacklade ', N(v)];
    if (cause === 'pigeon') return by >= 0 && by !== v ? [N(by), ' duvattackerade ', N(v)] : ['Parisduvan tog ', N(v)];
    if (!W) return [N(v), ' blev utslagen'];
    if (by === v) return [N(v), ' drabbades av sin egen ' + W.name.toLowerCase()];
    if (by < 0) return [N(v), ' föll offer för ' + W.name.toLowerCase()];
    return [N(by), ' ' + W.verb + ' ', N(v)];
  },

  onEvents(evs) {
    const h = this.hud; if (!h) return;
    for (const e of evs) {
      switch (e[0]) {
        case 'ko': {
          this.feedLine(this.koParts(e));
          if (e[1] === h.me) h.ko = { parts: this.koParts(e), at: performance.now() };
          break;
        }
        case 'pick': {
          const m = h.meta.get(e[1]);
          this.feedLine([{ n: m ? m.name : '?' }, ' tog osten!'], 'cheese');
          if (e[1] === h.me) this.banner('Du har osten! Spring!', 1800);
          break;
        }
        case 'cheeseReset': {
          const kind = typeof App !== 'undefined' && App.renderer && App.renderer.map ? App.renderer.map.kind : '';
          this.feedLine([kind === 'canal' ? 'Osten flöt tillbaka till mitten-ön' : 'Osten flöt tillbaka till kullen'], 'cheese'); break;
        }
        case 'parisduva': this.feedLine(['Parisduvan jagar ostbäraren!']); break;
        case 'left': { const m = h.meta.get(e[1]); if (m) this.feedLine([{ n: m.name }, ' lämnade – en bot tar över']); break; }
      }
    }
  },

  /* Anropas varje bildruta med aktuell vy */
  hudUpdate(view, now, netInfo) {
    const h = this.hud; if (!h || !view) return;
    // fasbyten
    if (view.phase !== h.phase) {
      const prev = h.phase; h.phase = view.phase;
      if (view.phase === 'reveal') this.showReveal();
      else $('reveal').classList.add('hidden');
      if (view.phase === 'play' && prev && prev !== 'play') { const bc = $('bigcount'); bc.textContent = 'KÖR!'; bc.className = 'pop'; h.goT = now + 0.9; this.banner('Håll i osten längst!', 2600); SFX.play('go'); }
      if (view.phase === 'end') { this.banner('SLUT!', 3000); SFX.play('whistle'); }
    }
    const bc = $('bigcount');
    if (view.phase === 'count') {
      const n = Math.ceil(view.pt);
      if (n !== h.count && n > 0) { h.count = n; bc.textContent = n; bc.className = ''; void bc.offsetWidth; bc.className = 'pop'; SFX.play('count'); }
    } else if (h.goT && now > h.goT) { bc.textContent = ''; h.goT = 0; h.count = -1; }
    // timer
    const tm = $('timer'), t = view.phase === 'play' || view.phase === 'end' ? view.pt : view.mt;
    const txt = this.fmt(t);
    if (txt !== h.timerTxt) { h.timerTxt = txt; $('timer-t').textContent = txt; }
    tm.classList.toggle('low', view.phase === 'play' && view.pt <= 10);
    const sub = view.phase === 'reveal' ? 'Avslöjande' : view.phase === 'count' ? 'Gör er redo' : view.phase === 'end' ? 'Slut!' : '';
    if ($('timer-s').textContent !== sub) $('timer-s').textContent = sub;
    // poängtavla (glesare uppdatering)
    if (now - h.lastBoard > 0.2) {
      h.lastBoard = now;
      const ps = view.players.slice().sort((a, b) => (b.score - a.score) || (a.id - b.id));
      const holder = view.cheese.st === 'carried' ? view.cheese.by : -99;
      ps.forEach((p, i) => {
        const r = h.rows.get(p.id); if (!r) return;
        const s = p.score.toFixed(1);
        if (s !== r.last) { r.last = s; r.sc.textContent = s; }
        if (r.rank !== i) { r.rank = i; r.el.style.order = i; }
        const has = p.id === holder;
        if (has !== r.has) { r.has = has; r.el.classList.toggle('has', has); }
        r.el.classList.toggle('off', p.st === 1);
      });
    }
    // egen status
    const me = h.me >= 0 ? view.players.find(p => p.id === h.me) : null;
    if (me && !h.spec) {
      const meta = h.meta.get(me.id), W = WEAPONS[meta.weapon];
      const wdis = me.carry || me.st !== 0;
      const tdis = (me.carry && !CFG.carrierTackle) || me.st !== 0;   // bäraren kan varken slåss eller tackla
      const wcd = Math.round(clamp(wcdFor(me, W), 0, 1) * 100), tk = Math.round(clamp(me.tk, 0, 1) * 100);
      if (wcd !== h.wcd || wdis !== h.wdis) { h.wcd = wcd; $('ring-weapon').style.setProperty('--cd', wcd); $('ring-weapon').classList.toggle('ready', wcd === 0 && !wdis); }
      if (tk !== h.tk || tdis !== h.tdis) { h.tk = tk; $('ring-tackle').style.setProperty('--cd', tk); $('ring-tackle').classList.toggle('ready', tk === 0 && !tdis); }
      if (wdis !== h.wdis) { h.wdis = wdis; $('ring-weapon').style.opacity = wdis ? 0.45 : 1; $('hud-wkey').textContent = me.carry ? 'Bär osten' : W.kind === 'pan' || W.kind === 'blow' ? 'Håll klick' : 'Klick / E'; }
      if (tdis !== h.tdis) { h.tdis = tdis; $('ring-tackle').style.opacity = tdis ? 0.45 : 1; $('hud-tkey').textContent = me.carry && tdis ? 'Bär osten' : 'Mellanslag'; }
      $('ring-weapon').classList.toggle('over', !!me.over);
      let badge = '';
      if (W.ammo) badge = String(Math.round(me.m)); else if (W.kind === 'mine' || W.kind === 'pad') badge = Math.round(me.m) + '/' + W.max;
      if (badge !== h.badge) { h.badge = badge; const b = $('hud-badge'); b.textContent = badge; b.classList.toggle('hidden', !badge); }
      // vindmätare (lövblåsaren): varning när man håller på att blåsas bort
      const gv = Math.round(clamp(me.gale || 0, 0, 1) * 100), gon = me.st === 0 && gv >= 12;
      if (gon !== h.galeOn) { h.galeOn = gon; $('gale-box').classList.toggle('hidden', !gon); }
      const gtip = me.carry && !CFG.carrierTackle ? 'Spring åt sidan – med osten kan du inte tackla dig loss' : 'Spring åt sidan eller tackla dig loss';
      if (gtip !== h.galeTip) { h.galeTip = gtip; $('gale-s').textContent = gtip; }
      if (gon && gv !== h.galeV) { h.galeV = gv; $('gale-fill').style.width = gv + '%'; $('gale-box').classList.toggle('hot', gv >= 70); }
      // utslagen-ruta
      const kb = $('ko-box');
      if (me.st === 1 && h.ko) {
        if (kb.classList.contains('hidden')) {
          const t1 = $('ko-t'); t1.innerHTML = '';
          for (const p of h.ko.parts) { if (typeof p === 'string') t1.appendChild(document.createTextNode(p)); else { const b = document.createElement('b'); b.textContent = p.n; t1.appendChild(b); } }
          kb.classList.remove('hidden');
        }
        $('ko-s').textContent = 'Tillbaka om ' + Math.max(0, me.e1).toFixed(1) + ' s – du startar om från kusten';
      } else if (!kb.classList.contains('hidden')) kb.classList.add('hidden');
    } else if (h.spec) {
      $('spec-tag').textContent = 'Åskådare – du tittar på osten';
    }
    if (now - h.startAt / 1000 > 22 && $('hud-help').style.opacity !== '0') $('hud-help').style.opacity = 0;
    if (netInfo !== h.net) { h.net = netInfo; $('net-info').textContent = netInfo || ''; }
  },

  /* ------------------------------------------------------------------ Avslöjandet */
  showReveal() {
    const h = this.hud, box = $('reveal-cards'); box.innerHTML = '';
    let i = 0;
    for (const id of h.order) {
      const p = h.meta.get(id), W = WEAPONS[p.weapon], d = document.createElement('div');
      d.className = 'rcard' + (id === h.me ? ' me' : ''); d.style.animationDelay = (0.15 + i * 0.12) + 's';
      d.innerHTML = '<canvas class="pcv" width="140" height="152"></canvas><div class="rn"></div><canvas class="wcv" width="236" height="104"></canvas><div class="rw"></div><div class="rt"></div>';
      d.querySelector('.rn').textContent = p.name + (id === h.me ? ' (du)' : '');
      d.querySelector('.rw').textContent = W.name; d.querySelector('.rt').textContent = W.tag;
      drawPortrait(d.querySelector('.pcv'), p.skin, { a: 0.4 }); drawWeaponTo(d.querySelector('.wcv'), p.weapon, {});
      box.appendChild(d); i++;
    }
    $('reveal').classList.remove('hidden');
    SFX.play('whistle');
  },

  /* ------------------------------------------------------------------ Resultat */
  showResults(res, meta, me, canRestart) {
    const rank = res.rank, n = rank.length, w = rank[0], fmt = v => v.toFixed(1);
    const won = w.id === me, nobody = !(w.score > 0), myIdx = rank.findIndex(r => r.id === me);
    const title = $('res-title');
    title.textContent = nobody ? 'Ingen fick tag i osten' : won ? 'DU VANN!' : w.name.toUpperCase() + ' VINNER!';
    title.classList.toggle('long', title.textContent.length > 14);
    $('res-kicker').textContent = nobody ? 'Oavgjort' : won ? 'Grattis, mästare!' : 'Vinnare';
    $('res-sub').textContent = nobody ? 'Ingen hann hålla i osten den här gången.'
      : fmt(w.score) + ' sekunder med osten, längsta svit ' + fmt(w.best) + ' s.' + (!won && myIdx > 0 ? ' Du kom på plats ' + (myIdx + 1) + ' av ' + n + '.' : '');
    $('res-stage').classList.toggle('nowin', nobody);
    this.buildPodium(rank, me, nobody);
    const tb = $('res-table');
    tb.innerHTML = '<tr><th>#</th><th>Spelare</th><th>Vapen</th><th>Tid med osten</th><th>Längsta svit</th><th>Utslagen</th><th>Träffar</th></tr>';
    rank.forEach((r, i) => {
      const tr = document.createElement('tr'); tr.className = (i === 0 && !nobody ? 'win ' : '') + (r.id === me ? 'me' : '');
      tr.innerHTML = '<td></td><td class="nm"><div><canvas width="68" height="68"></canvas><span></span></div></td><td class="wp"><canvas width="108" height="60"></canvas></td><td></td><td></td><td></td><td></td>';
      const c = tr.children;
      c[0].textContent = i + 1;
      drawPortrait(c[1].querySelector('canvas'), r.skin);
      c[1].querySelector('span').textContent = r.name + (r.bot ? ' (bot)' : '') + (r.id === me ? ' (du)' : '');
      if (i === 0 && !nobody) { const cr = document.createElement('canvas'); cr.className = 'crown-s'; cr.width = 52; cr.height = 36; drawCrown(cr); c[1].firstChild.appendChild(cr); }
      drawWeaponTo(c[2].querySelector('canvas'), r.weapon, {});
      c[3].textContent = fmt(r.score) + ' s'; c[4].textContent = fmt(r.best) + ' s'; c[5].textContent = r.kos; c[6].textContent = r.hits;
      tb.appendChild(tr);
    });
    $('btn-again').classList.toggle('hidden', !canRestart);
    $('res-wait').textContent = canRestart ? '' : 'Väntar på att värden startar en ny omgång…';
    const cf = $('confetti'); cf.innerHTML = '';
    const COL = ['#2442a8', '#ffffff', '#d62839', '#ffd23f', '#5f7ff0', '#ff8fa3'];
    for (let i = 0; i < (nobody ? 24 : 70); i++) {
      const e = document.createElement('i'); if (i % 4 === 1) e.className = 'c'; else if (i % 7 === 3) e.className = 's';
      e.style.left = (Math.random() * 100) + '%'; e.style.background = COL[i % COL.length];
      e.style.animationDuration = (3 + Math.random() * 3.5) + 's'; e.style.animationDelay = (-Math.random() * 6) + 's'; e.style.width = (6 + Math.random() * 7) + 'px';
      if (e.className === 'c') e.style.height = e.style.width;
      cf.appendChild(e);
    }
    this.screen('results');
    $('hud').classList.add('hidden');
    clearTimeout(this._resFx);
    if (!nobody) this._resFx = setTimeout(() => { if ($('results').classList.contains('hidden')) return; SFX.play('fanfare'); this.burst(); }, 1500);
  },

  /* Prispallen: andraplatsen till vänster, vinnaren i mitten och högst, trean till höger. */
  buildPodium(rank, me, nobody) {
    const box = $('podium'); box.innerHTML = '';
    const delay = [0.8, 0.4, 0.1];
    for (const i of [1, 0, 2].filter(k => k < rank.length)) {
      const r = rank[i], champ = i === 0 && !nobody;
      const d = document.createElement('div');
      d.className = 'pod p' + (i + 1) + (champ ? ' champ' : '') + (r.id === me ? ' me' : '');
      d.style.setProperty('--d', delay[i] + 's');
      d.innerHTML = '<div class="fig"><canvas class="pcv"></canvas></div><div class="step"><b class="rk"></b><span class="pn"></span><span class="pt"></span></div>';
      const pc = d.querySelector('.pcv'); pc.width = champ ? 204 : 130; pc.height = champ ? 233 : 148;
      drawPortrait(pc, r.skin, { carry: champ, a: 0.4 });
      d.querySelector('.rk').textContent = i + 1;
      const pn = d.querySelector('.pn'); pn.textContent = r.name + (r.id === me ? ' (du)' : ''); pn.title = r.name;
      d.querySelector('.pt').textContent = r.score.toFixed(1) + ' s';
      if (champ) {
        const cr = document.createElement('canvas'); cr.className = 'crown'; cr.width = 172; cr.height = 114; drawCrown(cr);
        d.querySelector('.fig').appendChild(cr);
        for (let k = 0; k < 8; k++) {
          const sp = document.createElement('i'); sp.className = 'sp';
          const a = k / 8 * Math.PI * 2 + 0.3, rx = 46 + (k % 3) * 9, ry = 46 + (k % 2) * 14;
          sp.style.left = (50 + Math.cos(a) * rx) + '%'; sp.style.top = (38 + Math.sin(a) * ry) + '%';
          sp.style.setProperty('--sd', (2.1 + k * 0.23) + 's'); sp.style.width = sp.style.height = (11 + (k % 3) * 5) + 'px';
          d.appendChild(sp);
        }
      }
      box.appendChild(d);
    }
  },

  /* Konfettiskur som skjuts upp från vinnaren */
  burst() {
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cf = $('confetti'), el = document.querySelector('#podium .champ .pcv'); if (!cf || !el || !el.animate) return;
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.28;
    const COL = ['#2442a8', '#ffffff', '#d62839', '#ffd23f', '#5f7ff0', '#ff8fa3'];
    for (let i = 0; i < 46; i++) {
      const e = document.createElement('i'); e.className = 'b' + (i % 3 === 0 ? ' c' : i % 5 === 0 ? ' s' : '');
      e.style.background = COL[i % COL.length]; e.style.left = cx + 'px'; e.style.top = cy + 'px';
      cf.appendChild(e);
      const ang = -Math.PI / 2 + (Math.random() - 0.5) * 2.7, sp = 170 + Math.random() * 430, dx = Math.cos(ang) * sp, dy = Math.sin(ang) * sp, rot = (Math.random() - 0.5) * 900;
      const a = e.animate([
        { transform: 'translate(0px, 0px) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + dx + 'px, ' + dy + 'px) rotate(' + rot * 0.6 + 'deg)', opacity: 1, offset: 0.45 },
        { transform: 'translate(' + dx * 1.15 + 'px, ' + (dy + 440) + 'px) rotate(' + rot + 'deg)', opacity: 0 }
      ], { duration: 1500 + Math.random() * 1300, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' });
      a.onfinish = () => e.remove();
    }
  }
};

function wcdFor(me, W) { return me.wcd; }

function drawTackleIcon(cv) {
  const c = cv.getContext('2d'), w = cv.width, h = cv.height;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
  c.translate(w / 2, h / 2 + 6); c.scale(1.5, 1.5);
  // fartränder + pil
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = '#9aa7c0'; c.lineWidth = 4; for (const y of [-12, 0, 12]) { c.beginPath(); c.moveTo(-34, y); c.lineTo(-14, y); c.stroke(); }
  c.beginPath(); c.moveTo(-8, -16); c.lineTo(22, 0); c.lineTo(-8, 16); c.closePath(); c.fillStyle = '#d62839'; c.fill(); c.lineWidth = 4; c.strokeStyle = OUT; c.stroke();
}
