'use strict';
/* =====================================================================
   LJUD – allt syntetiseras med WebAudio (inga ljudfiler). M = ljud av/på.
   Musiken är en liten musette-vals i a-moll som loopar (dragspelsklang).
   ===================================================================== */
const SFX = (() => {
  let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  let muted = false, musicTimer = null, musicWanted = false, nextBar = 0, bar = 0, musicVol = 0.5;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.55; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.1 * musicVol; musicBus.connect(master);
    const n = ctx.sampleRate * 1.5; noiseBuf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
  }
  function unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); if (musicWanted) startMusic(); }

  function tone(o) {
    if (!ensure()) return;
    const t = ctx.currentTime + (o.delay || 0), osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + o.dur);
    const v = o.vol === undefined ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + (o.attack || 0.006));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    osc.connect(g); g.connect(o.bus || sfxBus);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }
  function noise(o) {
    if (!ensure()) return;
    const t = ctx.currentTime + (o.delay || 0), src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; f.type = o.type || 'lowpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f || 1000, t);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + o.dur);
    const v = o.vol === undefined ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + (o.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.05);
  }

  const S = {
    tick() { tone({ type: 'triangle', f: 880, dur: 0.06, vol: 0.12 }); },
    click() { tone({ type: 'triangle', f: 520, f2: 700, dur: 0.07, vol: 0.15 }); },
    count() { tone({ type: 'square', f: 440, dur: 0.18, vol: 0.14 }); },
    go() { tone({ type: 'square', f: 660, dur: 0.1, vol: 0.14 }); tone({ type: 'square', f: 990, dur: 0.3, vol: 0.16, delay: 0.1 }); },
    swing() { noise({ type: 'bandpass', f: 500, f2: 2500, q: 1.5, dur: 0.16, vol: 0.16 }); },
    shoot() { noise({ type: 'bandpass', f: 1800, f2: 400, q: 1, dur: 0.12, vol: 0.18 }); tone({ type: 'square', f: 200, f2: 90, dur: 0.1, vol: 0.12 }); },
    tackle() { noise({ type: 'lowpass', f: 900, f2: 200, dur: 0.18, vol: 0.2 }); },
    oof() { tone({ type: 'sine', f: 180, f2: 55, dur: 0.22, vol: 0.32 }); noise({ type: 'lowpass', f: 700, dur: 0.1, vol: 0.2 }); },
    bonk() { tone({ type: 'square', f: 300, f2: 90, dur: 0.14, vol: 0.2 }); tone({ type: 'sine', f: 160, f2: 60, dur: 0.2, vol: 0.28 }); noise({ type: 'lowpass', f: 1500, dur: 0.07, vol: 0.18 }); },
    crunch() { noise({ type: 'bandpass', f: 1400, q: 0.8, dur: 0.12, vol: 0.25 }); tone({ type: 'sine', f: 200, f2: 70, dur: 0.16, vol: 0.25 }); },
    squeak() { tone({ type: 'sawtooth', f: 900, f2: 1500, dur: 0.16, vol: 0.1 }); tone({ type: 'sawtooth', f: 1300, f2: 800, dur: 0.14, vol: 0.09, delay: 0.14 }); },
    clang() { tone({ type: 'triangle', f: 1180, dur: 0.35, vol: 0.2 }); tone({ type: 'sine', f: 1770, dur: 0.3, vol: 0.12 }); tone({ type: 'sine', f: 620, dur: 0.4, vol: 0.12 }); },
    boom() { noise({ type: 'lowpass', f: 1200, f2: 80, dur: 0.7, vol: 0.5, attack: 0.01 }); tone({ type: 'sine', f: 110, f2: 30, dur: 0.5, vol: 0.45 }); },
    pop() { tone({ type: 'sine', f: 600, f2: 120, dur: 0.12, vol: 0.3 }); noise({ type: 'highpass', f: 2500, dur: 0.25, vol: 0.18, delay: 0.02 }); },
    splash() { noise({ type: 'bandpass', f: 900, f2: 2800, q: 0.7, dur: 0.4, vol: 0.28 }); },
    pick() { [0, 4, 7, 12].forEach((s, i) => tone({ type: 'triangle', f: mtof(72 + s), dur: 0.14, vol: 0.17, delay: i * 0.055 })); },
    drop() { [0, -3, -6].forEach((s, i) => tone({ type: 'triangle', f: mtof(67 + s), dur: 0.16, vol: 0.16, delay: i * 0.09 })); },
    boing() { tone({ type: 'sine', f: 200, f2: 900, dur: 0.3, vol: 0.28 }); tone({ type: 'sine', f: 900, f2: 300, dur: 0.25, vol: 0.2, delay: 0.3 }); },
    stink() { tone({ type: 'sawtooth', f: 70, f2: 55, dur: 0.5, vol: 0.15 }); noise({ type: 'lowpass', f: 300, dur: 0.5, vol: 0.15 }); },
    respawn() { tone({ type: 'triangle', f: 400, f2: 800, dur: 0.14, vol: 0.12 }); },
    pigeon() { tone({ type: 'triangle', f: 420, f2: 300, dur: 0.14, vol: 0.14 }); tone({ type: 'triangle', f: 430, f2: 290, dur: 0.16, vol: 0.14, delay: 0.17 }); },
    overheat() { noise({ type: 'highpass', f: 3000, dur: 0.5, vol: 0.16 }); },
    crash() { noise({ type: 'bandpass', f: 800, f2: 200, q: 0.6, dur: 0.45, vol: 0.32 }); tone({ type: 'sine', f: 90, f2: 40, dur: 0.3, vol: 0.2 }); },
    whistle() { tone({ type: 'sine', f: 2400, f2: 2000, dur: 0.5, vol: 0.12 }); },
    win() { [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => tone({ type: 'square', f: mtof(60 + s), dur: 0.18, vol: 0.1, delay: i * 0.12 })); },
    alert() { tone({ type: 'square', f: 700, dur: 0.1, vol: 0.12 }); tone({ type: 'square', f: 700, dur: 0.1, vol: 0.12, delay: 0.16 }); }
  };

  /* ---- Musik: musette-vals ---- */
  const CH = { Am: [57, 60, 64], Dm: [53, 57, 62], E7: [52, 56, 59, 62] };
  const BASS = { Am: 45, Dm: 50, E7: 40 };
  const PROG = ['Am', 'Am', 'Dm', 'Am', 'E7', 'E7', 'Am', 'Am'];
  const MEL = [
    [[76, 1], [72, 1], [69, 1]], [[71, 1], [72, .5], [74, .5], [76, 1]], [[77, 1], [74, 1], [69, 1]], [[72, 1], [71, .5], [69, .5], [71, 1]],
    [[68, 1], [71, 1], [74, 1]], [[76, 1.5], [74, .5], [71, 1]], [[72, 1], [69, 1], [64, 1]], [[69, 3]]
  ];
  const BEAT = 60 / 172;

  function accordion(m, t, dur, vol) {
    for (const det of [-7, 7]) {
      const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
      lfo.frequency.value = 5.3; lg.gain.value = 5; lfo.connect(lg); lg.connect(o.detune);
      f.type = 'lowpass'; f.frequency.value = 2300;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.03);
      g.gain.setValueAtTime(vol, t + Math.max(0.03, dur - 0.06)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(musicBus);
      o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
    }
  }
  function bassNote(m, t) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = mtof(m);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.5, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + BEAT * 0.9);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + BEAT);
  }
  function scheduleBar(t, b) {
    const ch = PROG[b % 8];
    bassNote(BASS[ch], t);
    for (const beat of [1, 2]) for (const m of CH[ch]) accordion(m, t + beat * BEAT, BEAT * 0.45, 0.07);
    let pos = 0;
    for (const [m, len] of MEL[b % 8]) { accordion(m, t + pos * BEAT, len * BEAT * 0.92, 0.16); pos += len; }
  }
  function pump() {
    if (!ctx || !musicWanted) return;
    while (nextBar < ctx.currentTime + 1.2) { scheduleBar(nextBar, bar); bar++; nextBar += BEAT * 3; }
  }
  function startMusic() {
    musicWanted = true;
    if (!ensure() || musicTimer) return;
    nextBar = ctx.currentTime + 0.1; bar = 0;
    musicTimer = setInterval(pump, 250); pump();
  }
  function stopMusic() { musicWanted = false; if (musicTimer) { clearInterval(musicTimer); musicTimer = null; } }

  return {
    unlock,
    play(name, vol) { if (muted || !S[name]) return; try { ensure(); if (ctx && ctx.state === 'suspended') return; S[name](vol); } catch (e) { /* ljud är aldrig kritiskt */ } },
    music(on) { if (on) startMusic(); else stopMusic(); },
    musicLevel(v) { musicVol = v; if (musicBus) musicBus.gain.setTargetAtTime(0.1 * v, ctx.currentTime, 0.3); },
    toggleMute() { muted = !muted; if (master) master.gain.value = muted ? 0 : 0.8; return muted; },
    isMuted() { return muted; }
  };
})();
