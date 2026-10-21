/*
 * Web Audio engine. Three separate layers, each with its own volume + mute:
 *   music  - the backing song (assets/audio, one per tempo); a built-in synth backing is the fallback
 *   melody - the single note a correct answer plays, and the flat note of a wrong answer
 *   sfx    - menu click and the end-of-level jingles
 * Data (songs, notes, fallback chords) lives in js/music.js.
 *
 * The audio clock (ctx.currentTime) drives game timing. If the browser leaves the AudioContext
 * suspended/blocked the game falls back to the system clock instead of freezing (and is silent).
 */
(function () {
  const NA = window.NA, M = NA.MUSIC;
  const A = (NA.Audio = {});

  let ctx = null, master, noiseBuf, duck;
  const bus = {};                                   // music / melody / sfx
  const BASE = { music: 0.55, melody: 0.9, sfx: 0.9 };
  const vol = Object.assign({ music: 0.8, melody: 1, sfx: 0.9 }, M.volumeDefaults);
  const mute = { music: false, melody: false, sfx: false };

  let spb = 1, startAt = 0, nextStep = 0, timer = null;
  let T = null;                                     // the current track, parsed
  let lastVoice = null, fileSrc = null;
  let fallback = false, perfStart = 0, ctxStart = 0, pausedMs = 0, pauseAt = 0;
  const cache = {};                                 // audio-file url -> AudioBuffer
  A.debug = { log: [] };                            // last note events (used by tests)

  // ---------------------------------------------------------------- context & buses
  function build() {
    const comp = ctx.createDynamicsCompressor();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp);
    comp.connect(ctx.destination);
    ['music', 'melody', 'sfx'].forEach((ch) => {
      bus[ch] = ctx.createGain();
      bus[ch].connect(master);
      applyBus(ch, true);
    });
    duck = ctx.createGain();                        // sits in front of the note bus: used to silence the ringing note briefly
    duck.connect(bus.melody);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  A.init = function () {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = null; return null; }
      build();
    }
    if (ctx.state !== 'running' && !pauseAt) ctx.resume();     // 'suspended', or 'interrupted' on iOS (but never while paused)
    return ctx;
  };
  // Call from any user input: browsers only allow audio to start from a gesture.
  A.wake = function () { if (ctx && ctx.state !== 'running' && !pauseAt) ctx.resume(); };
  A.usingFallback = () => fallback;
  A.isRunning = () => !!ctx && ctx.state === 'running';
  A.state = () => (ctx ? ctx.state : 'tidak ada');

  // Resolves true once the AudioContext is really running (false after `ms`). Firefox, and some devices, start the
  // audio hardware lazily: resume() can take a few hundred ms (or needs a click/keypress to count as a user gesture),
  // so the game waits for this before it starts its clock instead of assuming audio is instantly there.
  A.ready = function (ms) {
    return new Promise((resolve) => {
      if (!ctx) return resolve(false);
      if (ctx.state === 'running') return resolve(true);
      let done = false, timer = 0;
      const finish = (v) => {
        if (done) return;
        done = true;
        ctx.removeEventListener('statechange', onChange);
        clearTimeout(timer);
        resolve(v);
      };
      const onChange = () => { if (ctx.state === 'running') finish(true); };
      ctx.addEventListener('statechange', onChange);
      timer = setTimeout(() => finish(ctx.state === 'running'), ms);
      try { const p = ctx.resume(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
    });
  };

  function applyBus(ch, immediate) {
    if (!bus[ch]) return;
    const v = (mute[ch] ? 0 : vol[ch]) * BASE[ch];
    if (immediate) bus[ch].gain.value = v;
    else bus[ch].gain.setTargetAtTime(v, ctx.currentTime, 0.02);
  }
  A.setVolume = function (ch, v) { vol[ch] = Math.max(0, Math.min(1, v)); applyBus(ch); };
  A.setMute = function (ch, m) { mute[ch] = !!m; applyBus(ch); };

  // ---------------------------------------------------------------- building blocks
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function env(g, t, attack, peak, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  function tone(freq, t, o) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + o.dur);
    env(g, t, o.attack || 0.004, o.gain, o.dur);
    let node = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(o.lp, t);
      if (o.lpTo) f.frequency.exponentialRampToValueAtTime(o.lpTo, t + o.dur);
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(o.bus || bus.sfx);
    osc.start(t);
    osc.stop(t + (o.attack || 0.004) + o.dur + 0.05);
  }
  function noise(t, o) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = o.type;
    f.frequency.value = o.freq;
    const g = ctx.createGain();
    env(g, t, 0.002, o.gain, o.dur);
    src.connect(f); f.connect(g); g.connect(o.bus || bus.music);
    src.start(t, Math.random() * 0.5);
    src.stop(t + o.dur + 0.05);
  }

  // ---------------------------------------------------------------- music theory helpers
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const acc = (s) => (s === '#' ? 1 : s === 'b' ? -1 : 0);
  const pcOf = (s) => {
    const m = /^([A-G])([#b]?)$/.exec(s);
    if (!m) throw new Error(`NA.MUSIC: bad key "${s}"`);
    return (PC[m[1]] + acc(m[2]) + 12) % 12;
  };
  const QUAL = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6] };
  function parseChord(name) {
    const m = /^([A-G][#b]?)(m|7|maj7|dim)?$/.exec(name);
    if (!m) throw new Error(`NA.MUSIC: bad chord "${name}"`);
    const pc = pcOf(m[1]);
    return { pc, tones: QUAL[m[2] || ''], bass: 40 + ((pc - 4 + 12) % 12), voice: 60 + (((pc + 6) % 12) - 6) };
  }

  // Backing patterns: 8 steps per bar (eighth notes). bass: step -> [semitones above root, beats]. stabs: step -> beats.
  const STYLES = {
    pop:   { kick: [1,0,0,0,1,0,0,0], snare: [0,0,1,0,0,0,1,0], clap: true,  hat: [.1,.2,.1,.2,.1,.2,.1,.2],
             bass: { 0: [0, .9], 3: [0, .4], 4: [7, .8], 6: [12, .4] }, stabs: { 0: 1.4, 5: .4 } },
    funk:  { kick: [1,0,0,1,0,0,1,0], snare: [0,0,1,0,0,0,1,0], clap: true,  hat: [.12,.22,.12,.22,.12,.22,.12,.22],
             bass: { 0: [0, .4], 2: [12, .3], 3: [0, .4], 5: [7, .4], 6: [0, .4] }, stabs: { 1: .3, 4: .3, 7: .3 } },
    chill: { kick: [1,0,0,0,0,0,1,0], snare: [0,0,0,0,1,0,0,0], clap: false, hat: [0,.14,0,.14,0,.14,0,.14],
             bass: { 0: [0, 1.8], 4: [7, 1.8] }, stabs: {}, pad: true, bassType: 'triangle' },
    disco: { kick: [1,0,1,0,1,0,1,0], snare: [0,0,1,0,0,0,1,0], clap: true,  hat: [0,.28,0,.28,0,.28,0,.28],
             bass: { 0: [0, .4], 1: [12, .4], 2: [0, .4], 3: [12, .4], 4: [0, .4], 5: [12, .4], 6: [0, .4], 7: [12, .4] }, stabs: { 1: .3, 3: .3, 5: .3, 7: .3 } },
    rock:  { kick: [1,0,0,1,1,0,0,0], snare: [0,0,1,0,0,0,1,0], clap: false, hat: [.18,.12,.18,.12,.18,.12,.18,.12],
             bass: { 0: [0, .45], 1: [0, .4], 2: [0, .45], 3: [0, .4], 4: [0, .45], 5: [0, .4], 6: [7, .45], 7: [0, .4] }, stabs: { 0: 1.8 } },
  };

  // Note instruments: layered partials. ratio = frequency multiple, dec = ring time in seconds.
  const INST = {
    bell:    [{ type: 'sine', ratio: 1, gain: .5, atk: .003, dec: 1.4 }, { type: 'sine', ratio: 2.76, gain: .14, atk: .002, dec: .5 }, { type: 'sine', ratio: 5.4, gain: .05, atk: .002, dec: .25 }],
    marimba: [{ type: 'sine', ratio: 1, gain: .55, atk: .002, dec: .7 }, { type: 'sine', ratio: 4, gain: .18, atk: .001, dec: .12 }, { type: 'triangle', ratio: .5, gain: .12, atk: .002, dec: .4 }],
    glass:   [{ type: 'triangle', ratio: 1, gain: .4, atk: .02, dec: 1.6 }, { type: 'sine', ratio: 2, gain: .2, atk: .03, dec: 1.2 }, { type: 'sine', ratio: 3, gain: .06, atk: .04, dec: .9 }],
    pluck:   [{ type: 'sawtooth', ratio: 1, gain: .2, atk: .003, dec: .6, lp: 3200, lpTo: 700 }, { type: 'square', ratio: 1.005, gain: .09, atk: .003, dec: .45, lp: 2400, lpTo: 600 }],
  };

  function buildTrack(idx) {
    const d = M.tracks[((idx % M.tracks.length) + M.tracks.length) % M.tracks.length];
    return {
      d, name: d.name, key: d.key, keyPc: pcOf(d.key),
      style: STYLES[d.style] || STYLES.pop,
      chords: d.chords.map(parseChord),
    };
  }

  // ---------------------------------------------------------------- backing
  function kick(t) { tone(130, t, { type: 'sine', slideTo: 42, dur: 0.22, gain: 0.95, bus: bus.music }); }
  function clap(t) {
    noise(t, { type: 'bandpass', freq: 1700, dur: 0.14, gain: 0.35 });
    noise(t + 0.012, { type: 'bandpass', freq: 2300, dur: 0.1, gain: 0.2 });
  }
  function snare(t) {
    noise(t, { type: 'bandpass', freq: 2200, dur: 0.16, gain: 0.32 });
    tone(190, t, { type: 'triangle', slideTo: 130, dur: 0.1, gain: 0.3, bus: bus.music });
  }
  function hat(t, v) { noise(t, { type: 'highpass', freq: 7500, dur: 0.045, gain: v }); }

  function scheduleStep(step, t, tickOnly) {
    const st = T.style;
    const s = step % 8;
    if (tickOnly) { if (s % 2 === 0 && mute.music) tone(1100, t, { type: 'sine', dur: 0.03, gain: 0.05, bus: bus.sfx }); return; }   // song playing: only the quiet tick (when muted)
    const ch = T.chords[Math.floor(step / 8) % T.chords.length];
    if (st.kick[s]) kick(t);
    if (st.snare[s]) (st.clap ? clap(t) : snare(t));
    if (st.hat[s]) hat(t, st.hat[s]);
    if (s % 2 === 0 && mute.music) tone(1100, t, { type: 'sine', dur: 0.03, gain: 0.05, bus: bus.sfx });   // quiet metronome tick
    const b = st.bass[s];
    if (b) tone(mtof(ch.bass + b[0]), t, { type: st.bassType || 'sawtooth', dur: b[1] * spb, gain: 0.26, lp: 520, bus: bus.music });
    const sd = st.stabs[s];
    if (sd) ch.tones.forEach((tn) => tone(mtof(ch.voice + tn), t, { type: 'triangle', dur: sd * spb, gain: 0.08, bus: bus.music }));
    if (st.pad && s === 0) ch.tones.forEach((tn) => tone(mtof(ch.voice + tn), t, { type: 'sine', attack: 0.3, dur: 4 * spb, gain: 0.07, bus: bus.music }));
  }

  function pump() {
    if (!ctx || fallback) return;
    let guard = 0;                                   // never schedule a flood if the clock ever jumps
    while (guard++ < 32 && startAt + (nextStep * spb) / 2 < ctx.currentTime + 0.12) {
      scheduleStep(nextStep, startAt + (nextStep * spb) / 2, !!fileSrc);       // (a loaded song replaces the synth backing)
      nextStep++;
    }
  }

  // Loads the song for this tempo (decoded once, kept until another tempo is asked for: a decoded song is ~50 MB).
  A.prepare = async function (_level, bpm) {
    if (!A.init()) return;
    const spec = M.songs && M.songs[bpm];
    if (!spec || cache[spec.src]) return;
    try {
      const res = await fetch(spec.src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      Object.keys(cache).forEach((k) => delete cache[k]);
      cache[spec.src] = buf;
    } catch (e) {
      console.warn(`[audio] could not load ${spec.src} - using the synth backing instead.`, e);
    }
  };
  // The song starts at its first beat (offsetSec) on game beat 0. It is played at BPM / fileBpm speed so that its real
  // beats fall exactly on the game's beat grid, and loops over whole bars.
  function startFile(bpm) {
    fileSrc = null;
    const spec = M.songs && M.songs[bpm];
    const buf = spec && cache[spec.src];
    if (!buf) return;
    const fileSpb = 60 / (spec.fileBpm || bpm), off = spec.offsetSec || 0;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = bpm / (spec.fileBpm || bpm);
    src.loop = true;
    src.loopStart = off;
    src.loopEnd = off + Math.max(4, Math.floor((buf.duration - off) / fileSpb / 4) * 4) * fileSpb;
    src.connect(bus.music);
    src.start(startAt, off);
    fileSrc = src;
  }

  // ---------------------------------------------------------------- transport
  function begin(bpm, level) {
    T = buildTrack(level || 0);
    spb = 60 / bpm;
    fallback = !ctx;
    perfStart = performance.now();
    pausedMs = 0; pauseAt = 0;
    ctxStart = ctx ? ctx.currentTime : 0;
    startAt = ctxStart + 0.2;
    nextStep = 0;
    lastVoice = null;
    A.debug.log.length = 0;
    if (duck) duck.gain.value = 1;
  }

  A.start = function (bpm, level) {
    A.init();
    A.stop();
    begin(bpm, level);
    // The launcher already waited for the audio to start (A.ready). If it still is not running, do not freeze the
    // game for a moment: run on the system clock from the first frame (silent), and say why in a notice.
    if (ctx && ctx.state !== 'running') fallback = true;
    if (ctx) {
      startFile(bpm);
      timer = setInterval(pump, 25);
      pump();
    }
  };
  A.stop = function () {
    if (timer) clearInterval(timer);
    timer = null;
    if (fileSrc) { try { fileSrc.stop(); } catch (e) { /* already stopped */ } fileSrc = null; }
  };
  A.suspend = function () { pauseAt = performance.now(); if (ctx) ctx.suspend(); };
  A.resume = function () {
    if (pauseAt) { pausedMs += performance.now() - pauseAt; pauseAt = 0; }
    if (ctx) ctx.resume();
  };

  // What the player hears is later than the audio clock by the device's output latency plus the
  // master compressor's fixed 6 ms look-ahead (same delay for backing and melody, so they stay in sync).
  const COMP_DELAY = 0.006;
  const latency = () => (M.compensateOutputLatency ? Math.min(0.25, (ctx && ctx.outputLatency) || 0) : 0) + COMP_DELAY;

  // Seconds since the first beat, shifted by output latency so it matches what the player HEARS.
  A.time = function () {
    const wall = ((pauseAt || performance.now()) - perfStart - pausedMs) / 1000;   // seconds since start, pauses excluded
    if (!fallback && !pauseAt && wall > 2 && ctx.currentTime - ctxStart < 0.1) fallback = true;   // audio clock stalled
    if (fallback) return wall - 0.2;
    return ctx.currentTime - startAt - latency();
  };
  A.beatSeconds = () => spb;

  // ---------------------------------------------------------------- note layer
  function cutVoice(t) {
    if (lastVoice) {
      lastVoice.rel.gain.cancelScheduledValues(t);
      lastVoice.rel.gain.setTargetAtTime(0, t, 0.025);
      lastVoice = null;
    }
  }
  function duckNote(t, sec) {
    duck.gain.cancelScheduledValues(t);
    duck.gain.setTargetAtTime(0.06, t, 0.01);
    duck.gain.setTargetAtTime(1, t + sec, 0.12);
  }

  function playNote(midi, t, durSec, level, sparkle, inst) {
    const f = mtof(midi);
    const rel = ctx.createGain();
    rel.connect(duck);
    const cap = Math.max(0.4, durSec + 0.3);
    inst.forEach((p) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = p.type;
      osc.frequency.value = f * p.ratio;
      const dec = Math.min(p.dec, cap);
      env(g, t, p.atk, p.gain * level, dec);
      osc.connect(g);
      g.connect(rel);
      osc.start(t);
      osc.stop(t + p.atk + dec + 0.05);
    });
    if (sparkle) {                                                   // a perfect hit rings a little brighter
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = f * 2;
      env(g, t, 0.003, 0.14 * level, 0.35);
      o.connect(g); g.connect(rel);
      o.start(t); o.stop(t + 0.45);
    }
    return { rel };
  }

  // Right answer = ONE short note, played at once (the same note every time).
  A.correct = function (grade, _streak, now) {
    if (!ctx || fallback || !T) return;
    now = now === undefined ? ctx.currentTime : now;
    const t = now + 0.003;
    const c = M.correct;
    const level = { perfect: 1, good: 0.85, early: 0.65, late: 0.65 }[grade] || 0.85;
    cutVoice(t);
    lastVoice = playNote(c.midi, t, c.sec, level, grade === 'perfect', INST[c.inst] || INST.bell);
    A.debug.log.push({ kind: 'correct', midi: c.midi, now, at: t, grade });
    if (A.debug.log.length > 300) A.debug.log.shift();
  };

  // Wrong answer = a note a semitone below the correct one, pulled out of tune and sagging flat.
  A.wrong = function (now) {
    if (!ctx || fallback || !T) return;
    now = now === undefined ? ctx.currentTime : now;
    const midi = M.correct.midi - 1;
    const t = now + 0.003;
    cutVoice(t);
    duckNote(t, M.duckBeats.wrong * spb);
    const f = mtof(midi);
    const c = M.wrong.detuneCents * (Math.random() < 0.5 ? -1 : 1);
    const cents = (x) => Math.pow(2, x / 1200);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2200;
    const g = ctx.createGain();
    env(g, t, 0.01, M.wrong.gain * 0.5, 0.4);                       // two voices are summed, so halve each
    lp.connect(g);
    g.connect(bus.melody);                                          // bypasses the ducker on purpose
    [[ 'triangle', c ], [ 'sine', c + 28 ]].forEach(([type, offset]) => {   // two slightly different pitches beat against each other
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f * cents(offset), t);
      o.frequency.exponentialRampToValueAtTime(f * cents(offset - 60), t + 0.4);   // sags flat
      o.connect(lp);
      o.start(t);
      o.stop(t + 0.5);
    });
    A.debug.log.push({ kind: 'wrong', midi, cents: c, now, at: t });
  };

  // Problem slipped past unanswered: the ringing note drops out and a soft, un-pitched thud plays.
  // (It is a missed chance, not a wrong answer, so it has no pitch.)
  A.miss = function (now) {
    if (!ctx || fallback || !T) return;
    now = now === undefined ? ctx.currentTime : now;
    const t = now + 0.003;
    cutVoice(t);
    duckNote(t, M.duckBeats.miss * spb);
    tone(120, t, { type: 'sine', slideTo: 60, dur: 0.2, gain: 0.3 });
    noise(t, { type: 'lowpass', freq: 500, dur: 0.1, gain: 0.18, bus: bus.sfx });
    A.debug.log.push({ kind: 'miss', now, at: t });
  };

  // ---------------------------------------------------------------- main-menu BGM (a small synth loop, no file)
  // C - Am - F - G, 92 BPM: soft pad, bass, a gentle plucked arpeggio and a very light beat. It plays only in the menu,
  // on its own gain node (so it can be faded out) feeding the Musik bus.
  const MENU_BPM = 92, MENU_CHORDS = ['C', 'Am', 'F', 'G'];
  const MENU_ARP = [1, 1, 1, 0, 1, 1, 1, 1], MENU_ARP_IDX = [0, 1, 2, 1, 2, 1, 0, 1];
  let menuTimer = null, menuBus = null, menuStartAt = 0, menuNext = 0, menuChords = null;
  const menuEighth = 60 / MENU_BPM / 2;
  function menuStep(step, t) {
    const s = step % 8, ch = menuChords[Math.floor(step / 8) % menuChords.length], out = { bus: menuBus };
    if (s === 0) ch.tones.forEach((tn) => tone(mtof(ch.voice + tn), t, Object.assign({ type: 'sine', attack: 0.35, dur: 8 * menuEighth, gain: 0.05 }, out)));
    if (s === 0 || s === 4) {
      tone(mtof(ch.bass + (s ? 7 : 0)), t, Object.assign({ type: 'triangle', dur: 1.8 * menuEighth, gain: 0.2, lp: 700 }, out));
      tone(110, t, Object.assign({ type: 'sine', slideTo: 45, dur: 0.16, gain: 0.26 }, out));
    }
    if (MENU_ARP[s]) tone(mtof(ch.voice + 12 + ch.tones[MENU_ARP_IDX[s] % ch.tones.length]), t, Object.assign({ type: 'triangle', dur: 0.32, gain: 0.06, lp: 3000, lpTo: 900 }, out));
    if (s % 2 === 1) noise(t, { type: 'highpass', freq: 8000, dur: 0.03, gain: 0.018, bus: menuBus });
    if (s === 2 || s === 6) noise(t, { type: 'bandpass', freq: 2000, dur: 0.08, gain: 0.04, bus: menuBus });
  }
  function menuPump(until) {
    let guard = 0;
    while (guard++ < 64 && menuStartAt + menuNext * menuEighth < until) { menuStep(menuNext, menuStartAt + menuNext * menuEighth); menuNext++; }
  }
  function menuBegin() {
    menuChords = MENU_CHORDS.map(parseChord);
    menuBus = ctx.createGain();
    menuBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    menuBus.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.6);          // fade in
    menuBus.connect(bus.music);
    menuStartAt = ctx.currentTime + 0.1;
    menuNext = 0;
  }
  // true = (re)start the loop if the audio is running, false = fade it out. Safe to call repeatedly.
  A.menuMusic = function (on) {
    if (!on) {
      if (menuTimer) clearInterval(menuTimer);
      menuTimer = null;
      if (menuBus && ctx) {
        const g = menuBus;
        g.gain.cancelScheduledValues(ctx.currentTime);
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.12);
        setTimeout(() => { try { g.disconnect(); } catch (e) { /* gone */ } }, 900);
      }
      menuBus = null;
      return;
    }
    if (menuTimer || !ctx || ctx.state !== 'running') return;
    menuBegin();
    menuPump(ctx.currentTime + 0.2);
    menuTimer = setInterval(() => { if (ctx) menuPump(ctx.currentTime + 0.2); }, 50);
  };
  A.menuPlaying = () => !!menuTimer;

  // ---------------------------------------------------------------- jingles & UI
  // Menu button sounds: silent until the audio is running (a hover is not a user gesture, so it must not wake the audio).
  let uiForce = false;                                  // tests: an offline context never reports 'running'
  const uiOK = () => !!ctx && (uiForce || ctx.state === 'running');
  A.uiHover = function () { if (uiOK()) tone(1568 * (1 + Math.random() * 0.03), ctx.currentTime, { type: 'sine', dur: 0.05, gain: 0.05 }); };
  A.uiClick = function () {
    if (!uiOK()) return;
    const t = ctx.currentTime;
    tone(660, t, { type: 'triangle', slideTo: 990, dur: 0.09, gain: 0.14 });
    tone(1320, t + 0.045, { type: 'sine', dur: 0.1, gain: 0.07 });
  };
  A.uiStart = function () {                                                    // the big "Main!" button: a short rising run
    if (!uiOK()) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => tone(f, t + i * 0.07, { type: 'triangle', dur: 0.2, gain: 0.12 }));
  };

  function arp(semis, step, dur, gain, type) {
    if (!ctx) return;
    const root = 60 + (T ? T.keyPc : 0);
    const t = ctx.currentTime + 0.05;
    semis.forEach((s, i) => tone(mtof(root + 12 + s), t + i * step, { type, dur, gain, bus: bus.sfx }));
  }
  A.fanfare = function () { arp([0, 4, 7, 12, 16], 0.1, 0.6, 0.3, 'triangle'); };
  A.fail = function () { arp([7, 4, 1, -2], 0.16, 0.35, 0.12, 'sawtooth'); };
  A.click = function () { if (ctx) tone(880, ctx.currentTime, { type: 'sine', dur: 0.06, gain: 0.12 }); };

  // ---------------------------------------------------------------- test hooks (not used by the game)
  A._test = {
    useContext(c) { ctx = c; build(); },
    begin(bpm, level) { begin(bpm, level); },
    backing(untilSec) {                                            // schedule backing up to a time, offline
      while (startAt + (nextStep * spb) / 2 < untilSec) { scheduleStep(nextStep, startAt + (nextStep * spb) / 2); nextStep++; }
    },
    info: () => ({ spb, startAt, track: T }),
    menu(untilSec) { menuBegin(); menuStartAt = 0.1; menuNext = 0; menuPump(untilSec); },     // schedule the menu loop offline
    menuEighth: () => menuEighth,
    ui: () => { uiForce = true; return { hover: A.uiHover, click: A.uiClick, start: A.uiStart }; },
    usingFile: () => !!fileSrc,
    gains: () => ({ music: bus.music.gain.value, melody: bus.melody.gain.value, sfx: bus.sfx.gain.value }),
    parse: { parseChord, pcOf },
  };
})();
