/*
 * Web Audio engine. Three separate layers, each with its own volume + mute:
 *   music  - backing (drums, bass, harmony), always playing, scheduled ahead on the audio clock
 *   melody - the tune the PLAYER plays: each correct answer = next melody note (snapped to the beat
 *            grid); each wrong answer = an out-of-key note that does not advance the tune
 *   sfx    - menu click and the end-of-level jingles
 * Data (keys, chords, melodies) lives in js/music.js.
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
  let melodyIdx = 0, lastVoice = null, fileSrc = null;
  let fallback = false, perfStart = 0, ctxStart = 0, pausedMs = 0, pauseAt = 0;
  const cache = {};                                 // audio-file url -> AudioBuffer
  A.debug = { log: [] };                            // last melody events (used by tests)

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
    duck = ctx.createGain();                        // sits in front of the melody bus: used to mute the tune briefly
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
  function noteMidi(s) {
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
    if (!m) throw new Error(`NA.MUSIC: bad note "${s}"`);
    return 12 * (+m[3] + 1) + PC[m[1]] + acc(m[2]);
  }
  function parseMelody(str, defBeats) {
    return str.trim().split(/\s+/).map((tok) => {
      const [n, d] = tok.split(':');
      return { midi: noteMidi(n), beats: d ? parseFloat(d) : defBeats };
    });
  }
  const QUAL = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], dim: [0, 3, 6] };
  function parseChord(name) {
    const m = /^([A-G][#b]?)(m|7|maj7|dim)?$/.exec(name);
    if (!m) throw new Error(`NA.MUSIC: bad chord "${name}"`);
    const pc = pcOf(m[1]);
    return { pc, tones: QUAL[m[2] || ''], bass: 40 + ((pc - 4 + 12) % 12), voice: 60 + (((pc + 6) % 12) - 6) };
  }
  const SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };

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

  // Melody instruments: layered partials. ratio = frequency multiple, dec = ring time in seconds.
  const INST = {
    bell:    [{ type: 'sine', ratio: 1, gain: .5, atk: .003, dec: 1.4 }, { type: 'sine', ratio: 2.76, gain: .14, atk: .002, dec: .5 }, { type: 'sine', ratio: 5.4, gain: .05, atk: .002, dec: .25 }],
    marimba: [{ type: 'sine', ratio: 1, gain: .55, atk: .002, dec: .7 }, { type: 'sine', ratio: 4, gain: .18, atk: .001, dec: .12 }, { type: 'triangle', ratio: .5, gain: .12, atk: .002, dec: .4 }],
    glass:   [{ type: 'triangle', ratio: 1, gain: .4, atk: .02, dec: 1.6 }, { type: 'sine', ratio: 2, gain: .2, atk: .03, dec: 1.2 }, { type: 'sine', ratio: 3, gain: .06, atk: .04, dec: .9 }],
    pluck:   [{ type: 'sawtooth', ratio: 1, gain: .2, atk: .003, dec: .6, lp: 3200, lpTo: 700 }, { type: 'square', ratio: 1.005, gain: .09, atk: .003, dec: .45, lp: 2400, lpTo: 600 }],
  };

  function buildTrack(idx) {
    const d = M.tracks[((idx % M.tracks.length) + M.tracks.length) % M.tracks.length];
    const keyPc = pcOf(d.key);
    return {
      d, name: d.name, key: d.key,
      style: STYLES[d.style] || STYLES.pop,
      inst: INST[d.lead] || INST.bell,
      chords: d.chords.map(parseChord),
      melody: parseMelody(d.melody, d.noteBeats || 2),
      keyPcs: new Set(SCALES[d.mode || 'major'].map((i) => (keyPc + i) % 12)),
      keyPc,
      files: d.files || {},
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

  function scheduleStep(step, t) {
    const st = T.style;
    const s = step % 8;
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
    if (!ctx || fallback || fileSrc) return;        // (a real audio file replaces the synth backing)
    let guard = 0;                                   // never schedule a flood if the clock ever jumps
    while (guard++ < 32 && startAt + (nextStep * spb) / 2 < ctx.currentTime + 0.12) {
      scheduleStep(nextStep, startAt + (nextStep * spb) / 2);
      nextStep++;
    }
  }

  // Optional: real audio backing (e.g. generated with ElevenLabs), keyed by exact BPM in music.js.
  A.prepare = async function (level, bpm) {
    if (!A.init()) return;
    const d = M.tracks[level];
    const spec = d && d.files && d.files[bpm];
    if (!spec || cache[spec.src]) return;
    try {
      const res = await fetch(spec.src);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      cache[spec.src] = await ctx.decodeAudioData(await res.arrayBuffer());
    } catch (e) {
      console.warn(`[audio] could not load ${spec.src} - using the synth backing instead.`, e);
    }
  };
  function startFile(bpm) {
    fileSrc = null;
    const spec = T.files[bpm];
    const buf = spec && cache[spec.src];
    if (!buf) return;
    const src = ctx.createBufferSource();
    const off = spec.offsetSec || 0;
    src.buffer = buf;
    src.loop = true;
    src.loopStart = off;
    src.loopEnd = off + spec.loopBeats * spb;
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
    melodyIdx = 0;
    lastVoice = null;
    A.debug.log.length = 0;
    if (duck) duck.gain.value = 1;
  }

  A.start = function (bpm, level) {
    A.init();
    A.stop();
    begin(bpm, level);
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
    if (!fallback && !pauseAt && wall > 0.6 && ctx.currentTime - ctxStart < 0.1) fallback = true;   // audio clock stalled
    if (fallback) return wall - 0.2;
    return ctx.currentTime - startAt - latency();
  };
  A.beatSeconds = () => spb;

  // ---------------------------------------------------------------- melody layer
  // First grid point at or after (now - lateTolerance), in audio-clock time. Never earlier than "now".
  function snap(now) {
    const q = M.quantize;
    const grid = q.gridBeats * spb;
    const heard = now - startAt - latency();                       // where the player is on the beat grid
    const k = Math.max(0, Math.ceil((heard - q.lateToleranceMs / 1000) / grid - 1e-9));
    return { t: Math.max(startAt + k * grid, now + 0.003), k };
  }

  function cutVoice(t) {
    if (lastVoice) {
      lastVoice.rel.gain.cancelScheduledValues(t);
      lastVoice.rel.gain.setTargetAtTime(0, t, 0.025);
      lastVoice = null;
    }
  }
  function duckMelody(t, sec) {
    duck.gain.cancelScheduledValues(t);
    duck.gain.setTargetAtTime(0.06, t, 0.01);
    duck.gain.setTargetAtTime(1, t + sec, 0.12);
  }

  function playLead(midi, t, durSec, level, sparkle) {
    const f = mtof(midi);
    const rel = ctx.createGain();
    rel.connect(duck);
    const cap = Math.max(0.4, durSec + 0.3);
    T.inst.forEach((p) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = p.type;
      osc.frequency.value = f * p.ratio;
      const dec = Math.min(p.dec, cap);
      env(g, t, p.atk, p.gain * level, dec);
      let node = osc;
      if (p.lp) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.setValueAtTime(p.lp, t);
        lp.frequency.exponentialRampToValueAtTime(p.lpTo, t + dec);
        osc.connect(lp);
        node = lp;
      }
      node.connect(g);
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

  // Right answer = the next note of this level's melody, snapped to the beat grid.
  A.correct = function (grade, _streak, now) {
    if (!ctx || fallback || !T) return;
    now = now === undefined ? ctx.currentTime : now;
    const n = T.melody[melodyIdx % T.melody.length];
    melodyIdx++;
    const s = snap(now);
    cutVoice(s.t);
    const level = { perfect: 1, good: 0.85, early: 0.65, late: 0.65 }[grade] || 0.85;
    lastVoice = playLead(n.midi, s.t, n.beats * spb, level, grade === 'perfect');
    A.debug.log.push({ kind: 'melody', idx: melodyIdx - 1, midi: n.midi, now, at: s.t, grid: s.k, grade });
    if (A.debug.log.length > 300) A.debug.log.shift();
  };

  // Wrong answer = a note a semitone outside the key (and pulled out of tune); the melody does not advance.
  A.wrong = function (now) {
    if (!ctx || fallback || !T) return;
    now = now === undefined ? ctx.currentTime : now;
    const next = T.melody[melodyIdx % T.melody.length].midi;       // the note they should have played
    const out = [next + 1, next - 1].filter((m) => !T.keyPcs.has(((m % 12) + 12) % 12));
    const midi = out.length ? out[Math.random() < 0.5 ? 0 : out.length - 1] : next + 1;
    const t = M.wrong.immediate ? now + 0.003 : snap(now).t;
    cutVoice(t);
    duckMelody(t, M.duckBeats.wrong * spb);
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

  // Problem slipped past unanswered: the melody drops out for a moment and a soft, un-pitched thud plays.
  // (It is a missed chance, not a wrong note, so it does not clash with the key and does not advance the tune.)
  A.miss = function (now) {
    if (!ctx || fallback || !T) return;
    now = now === undefined ? ctx.currentTime : now;
    const t = now + 0.003;
    cutVoice(t);
    duckMelody(t, M.duckBeats.miss * spb);
    tone(120, t, { type: 'sine', slideTo: 60, dur: 0.2, gain: 0.3 });
    noise(t, { type: 'lowpass', freq: 500, dur: 0.1, gain: 0.18, bus: bus.sfx });
    A.debug.log.push({ kind: 'miss', now, at: t });
  };

  // ---------------------------------------------------------------- jingles & UI
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
    usingFile: () => !!fileSrc,
    gains: () => ({ music: bus.music.gain.value, melody: bus.melody.gain.value, sfx: bus.sfx.gain.value }),
    parse: { noteMidi, parseMelody, parseChord, pcOf },
  };
})();
