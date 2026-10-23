/*
 * Game loop: falling problems, hit judging, tiers, scoring, lives, pause.
 * All timing comes from NA.Audio.time() (the audio clock).
 */
(function () {
  const NA = window.NA, C = NA.CONFIG, A = NA.Audio;
  const G = (NA.Game = { onFinish: null, onPause: null, onCountdown: null });

  // Field metrics, MEASURED from the fluid layout (the field fills whatever height the screen leaves).
  let LINE_Y = 0;          // y of the target line inside the field
  let SPAWN_Y = 0;         // y at which a problem enters the field
  let NOTE_H = 56;         // layout height of a problem box

  const $ = (id) => document.getElementById(id);
  let S = null;            // state of the current run
  let raf = 0;
  let el = {};
  let keyMap = {};

  const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
  const mult = (streak) => Math.min(C.maxMultiplier, 1 + Math.floor(streak / C.comboStep));
  const songTime = () => A.time() + C.inputOffsetMs / 1000;
  const icon = (name, size) => (NA.icon ? NA.icon(name, size) : '');
  const need = (t) => (t.correct === undefined ? C.defaultCorrect : t.correct);   // correct answers this tier lasts
  const totalCorrect = () => C.tiers.reduce((s, t) => s + need(t), 0);
  const isHit = (k) => k === 'perfect' || k === 'good' || k === 'early' || k === 'late';

  NA.laneCount = (levelIdx) => C.laneOverride || C.levels[levelIdx].lanes;
  NA.bpmFor = (levelIdx, diffIdx) => C.difficulties[diffIdx].bpm;

  G.init = function () {
    el = {
      field: $('field'), notes: $('notes'), pads: $('pads'), guides: $('lane-guides'),
      judge: $('judge'), fx: $('fx'), lives: $('lives'), dots: $('combo-dots'),
      label: $('combo-label'), score: $('score'), bpm: $('bpm-text'),
      tier: $('tier-text'), tierBar: $('tier-bar'), toast: $('toast'), hitline: $('hitline'),
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    document.addEventListener('visibilitychange', () => { if (document.hidden) G.pause(); });
    // the layout is fluid: re-measure whenever the field changes size (rotation, address-bar show/hide, window resize)
    let pending = 0;
    const relayout = () => { cancelAnimationFrame(pending); pending = requestAnimationFrame(G.relayout); };
    if (window.ResizeObserver) new ResizeObserver(relayout).observe(el.field);
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', relayout);
    layoutMetrics();
  };

  // ---- fluid layout: measure the field, place the line, refit text -------------------
  function layoutMetrics() {
    const h = el.field.clientHeight;
    if (!h) return false;
    let probe = el.notes.querySelector('.probe');                  // an invisible problem box, to read its real height
    if (!probe) {
      probe = document.createElement('div');
      probe.className = 'note probe';
      probe.style.visibility = 'hidden';
      el.notes.appendChild(probe);
    }
    NOTE_H = probe.offsetHeight || 56;
    // the line sits at lineRatio of the height, but low enough that a tall (fraction) problem, enlarged when active, still fits
    LINE_Y = Math.min(Math.round(h * C.layout.lineRatio), Math.round(h - NOTE_H * 0.85 - 6));
    SPAWN_Y = -Math.round(NOTE_H * 0.9);
    el.field.style.setProperty('--line', LINE_Y + 'px');
    if (S) S.pxPerBeat = (LINE_Y - SPAWN_Y) / S.approach;
    return true;
  }
  // ---- accent notes on the lane lines: small, faint, random, drifting down along a wavy path ---------------
  // Moved by the game loop (not by CSS animations): nothing about a running note is ever changed in place, a note that
  // leaves the bottom is simply put back above the top with new random looks, so there are no jumps. They fall at about
  // the speed of the problems (+/- 12 %), sway left and right in a sine wave and tilt along it, and fade in / out at the edges.
  const GNOTES = 5, TAU = Math.PI * 2;
  const NOTE_SVG = [
    '<svg width="22" height="24" viewBox="0 0 24 26" fill="currentColor" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><ellipse cx="7" cy="21" rx="4" ry="2.9" transform="rotate(-23 7 21)" stroke="none"/><path d="M10.4 20V3Q20 7 17.6 12.5" fill="none" stroke-width="1.5"/></svg>',
    '<svg width="28" height="30" viewBox="0 0 28 30" fill="currentColor" stroke="currentColor" stroke-linecap="round" aria-hidden="true"><ellipse cx="7" cy="25" rx="4" ry="2.9" transform="rotate(-23 7 25)" stroke="none"/><ellipse cx="20" cy="21.2" rx="4" ry="2.9" transform="rotate(-23 20 21.2)" stroke="none"/><path d="M10.4 24V6M23.4 20.2V2.2" fill="none" stroke-width="1.5"/><path d="M10.4 6.6L23.4 2.6" fill="none" stroke-width="3.6"/></svg>',
  ];
  let gnotes = [], gnLast = 0;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  function gnReset(n, y) {
    n.y = y;                                                         // above the top: a new note starts out of sight
    n.mult = rnd(0.88, 1.12);                                        // speed relative to the problems
    n.x0 = rnd(-16, 16);                                             // which side of the line it sits on
    n.amp = rnd(5, 15);                                              // how far it swings
    n.wl = rnd(180, 360);                                            // wavelength in px (so the path is the same at any speed)
    n.ph = rnd(0, TAU);
    n.alpha = rnd(0.16, 0.36);
    n.scale = rnd(0.75, 1.3);
    n.el.innerHTML = NOTE_SVG[Math.random() < 0.45 ? 1 : 0];
  }
  function makeAccentNotes(container) {
    for (let k = 0; k < GNOTES; k++) {
      const el2 = document.createElement('span');
      el2.className = 'gnote';
      container.appendChild(el2);
      const n = { el: el2, y: null };
      gnReset(n, null);
      gnotes.push(n);
    }
  }
  function gnTick(dt) {
    if (!gnotes.length || !S) return;
    const H = el.field.clientHeight;
    if (!H) return;
    const v = S.pxPerBeat / S.spb;                                   // px per second of a falling problem
    for (const n of gnotes) {
      if (n.y === null) n.y = rnd(-20, H);                           // first time: scattered over the whole height
      n.y += v * n.mult * dt;
      if (n.y > H + 30) gnReset(n, -rnd(30, 140));                   // back above the top, looking different
      const s = Math.sin(n.ph + (n.y / n.wl) * TAU);
      const tilt = Math.cos(n.ph + (n.y / n.wl) * TAU) * 9;           // leans along the wave
      const fade = clamp01((n.y + 10) / 70) * clamp01((H - n.y) / 70);
      n.el.style.transform = `translate3d(${(n.x0 + n.amp * s).toFixed(1)}px, ${n.y.toFixed(1)}px, 0) rotate(${tilt.toFixed(1)}deg) scale(${n.scale.toFixed(2)})`;
      n.el.style.opacity = (n.alpha * fade).toFixed(3);
    }
  }
  G.relayout = function () {
    if (!layoutMetrics() || !S) return;
    S.notes.forEach((n) => { if (n.el && !n.removed) fitNote(n.el); });
    fitPads();
  };

  // ---- lanes: pads at the bottom + tall touch columns inside the field -----
  function buildLaneUI(n) {
    const keys = C.keys[n], colors = C.laneColors[n];
    keyMap = {};
    keys.forEach((k, i) => { keyMap[k.code] = i; });
    el.pads.innerHTML = '';
    el.guides.innerHTML = '';
    gnotes = [];
    el.pads.style.setProperty('--lanes', n);
    el.notes.style.setProperty('--lanes', n);
    el.guides.style.setProperty('--lanes', n);
    for (let i = 0; i < n; i++) {
      const pad = document.createElement('button');
      pad.type = 'button';
      pad.className = 'pad';
      pad.dataset.lane = i;
      pad.style.setProperty('--lc', colors[i]);
      pad.innerHTML = `<span class="pad-answer">&nbsp;</span><span class="pad-key">${keys[i].label}</span>`;
      el.pads.appendChild(pad);

      const g = document.createElement('div');
      g.className = 'lane-guide';
      g.style.setProperty('--lc', colors[i]);
      el.guides.appendChild(g);
      if (i > 0) { const box = document.createElement('span'); box.className = 'gnotes'; g.appendChild(box); makeAccentNotes(box); }     // accent notes on the line between lanes

      [pad, g].forEach((target) => {
        target.addEventListener('pointerdown', (e) => { e.preventDefault(); laneDown(i); });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => target.addEventListener(ev, () => laneUp(i)));
        target.addEventListener('contextmenu', (e) => e.preventDefault());
      });
    }
  }

  // ---- tiers -----------------------------------------------------------------
  function tierIndex(correct) {
    let acc = 0;
    for (let i = 0; i < C.tiers.length; i++) {
      acc += need(C.tiers[i]);
      if (correct < acc) return i;
    }
    return C.tiers.length - 1;
  }
  function digitTier(tIdx) {
    const t = C.tiers[tIdx];
    return t.mix ? t.mix[rand(0, t.mix.length - 1)] : tIdx;
  }

  // ---- run setup ---------------------------------------------------------------
  G.start = function (levelIdx, diffIdx) {
    A.init();
    const L = C.levels[levelIdx];
    const lanes = NA.laneCount(levelIdx);
    const bpm = NA.bpmFor(levelIdx, diffIdx);
    const spb = 60 / bpm;
    const stepMode = C.movementMode === 'step';
    const approach = stepMode ? Math.max(1, Math.round(C.approachBeats)) : C.approachBeats;
    buildLaneUI(lanes);
    layoutMetrics();
    S = {
      levelIdx, diffIdx, lanes, bpm, spb, stepMode, scoreMult: C.difficulties[diffIdx].scoreMult,
      approach, approachSec: approach * spb, pxPerBeat: (LINE_Y - SPAWN_Y) / approach,
      interval: L.noteEveryBeats,
      notes: [], cur: 0, nextBeat: C.leadBeats,
      correct: 0, tier: 0, total: totalCorrect(), lastText: '', padNote: null,
      score: 0, streak: 0, maxStreak: 0, lives: C.lives,
      perfect: 0, good: 0, early: 0, late: 0, miss: 0, review: [],
      paused: false, finishing: false, endTime: 0, gameOver: false, cdTimer: 0,
    };
    el.notes.innerHTML = '';
    el.fx.innerHTML = '';
    el.field.classList.remove('dead');
    el.judge.className = 'judge';
    el.toast.className = 'toast';
    buildHearts();
    spawnDue(0);
    updateHud();
    A.start(bpm, levelIdx);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  };

  G.restart = function () { if (S) G.start(S.levelIdx, S.diffIdx); };

  G.stop = function () {
    cancelAnimationFrame(raf);
    if (S) clearTimeout(S.cdTimer);
    A.stop();
    S = null;
  };

  G.debugState = () => S;   // read-only peek for tests
  G.isRunning = () => !!S && !S.finishing;
  G.isPaused = () => !!S && S.paused;

  // ---- spawning (problems are created just as they enter the top of the field) ----
  function spawnNext() {
    // A problem is created before the previous one has been answered, so count the problems
    // still on screen as if they will be answered correctly - otherwise the tier would lag by one.
    const tIdx = tierIndex(S.correct + (S.notes.length - S.cur));
    if (tIdx !== S.tier) {                                         // a new stage: show it and leave some breathing room first
      S.tier = tIdx;
      tierToast(tIdx);
      if (C.breather.enabled) S.nextBeat += C.breather.beats;
    }
    let p, tries = 0;
    do { p = NA.makeProblem(S.levelIdx, digitTier(tIdx), S.lanes); } while (++tries < 8 && p.text === S.lastText);
    S.lastText = p.text;
    const note = {
      i: S.notes.length, problem: p, judged: null, el: null, removed: false,
      lane: rand(0, S.lanes - 1),                                  // the problem falls down a random lane (the answer keys stay A / W / D)
      target: S.nextBeat * S.spb,
    };
    S.notes.push(note);

    S.nextBeat += S.interval;                                      // the next one arrives `interval` beats later
    refreshPads();
    updateHud();
  }

  function spawnDue(t) {
    while (!S.finishing && S.nextBeat * S.spb - S.approachSec <= t + 0.05) spawnNext();
  }

  // ---- main loop -----------------------------------------------------------------
  function frame() {
    raf = requestAnimationFrame(frame);
    if (!S || S.paused) return;
    const t = songTime();
    if (A.usingFallback() && !S.noticed) { S.noticed = true; notice(`Suara belum aktif (status audio: ${A.state()}). Game tetap jalan tanpa musik. Cek izin suara situs di browser (autoplay), lalu mulai ulang level.`); }
    processMisses(t);
    spawnDue(t);
    render(t);
    const now = performance.now();
    gnTick(Math.min(0.05, (now - gnLast) / 1000));                  // (a long gap, e.g. after a pause, counts as one short frame)
    gnLast = now;
    const bp = t / S.spb;
    el.hitline.style.setProperty('--beat', bp < 0 ? 0 : Math.max(0, 1 - (bp - Math.floor(bp)) * 3.5).toFixed(3));
    if (S.finishing && t >= S.endTime) finish();
  }

  function processMisses(t) {
    while (!S.finishing) {
      const n = S.notes[S.cur];
      if (n && t - n.target > C.windows.accept) judge(n, 'pass');
      else break;
    }
  }

  // y of the problem's centre. Smooth = continuous; step = one eased hop per beat ending ON the beat.
  function noteY(n, t) {
    const b = (n.target - t) / S.spb;                 // beats until it reaches the line
    if (!S.stepMode || b <= 0) return LINE_Y - b * S.pxPerBeat;
    if (b >= S.approach) return SPAWN_Y;
    const k = Math.floor(b);
    const u = b - k;                                  // 0 = on the beat, ->1 = just after the previous beat
    const f = C.step.moveFraction;
    let r = k + 1;                                    // resting position (steps above the line)
    if (u < f) {                                      // hopping: finishes exactly when u hits 0
      const m = 1 - u / f;
      r = k + 1 - (1 - Math.pow(1 - m, 3));
    }
    return LINE_Y - r * S.pxPerBeat;
  }

  function render(t) {
    let rank = 0;
    for (const n of S.notes) {
      if (n.removed) continue;
      const y = noteY(n, t);
      if (!n.judged) {
        if (!n.el) createNote(n);
        n.el.style.transform = `translate3d(0,${(y - NOTE_H / 2).toFixed(1)}px,0)`;
        n.el.style.opacity = S.finishing && S.gameOver ? 0.25 : (rank === 0 ? 1 : 0.5);
        n.el.classList.toggle('current', rank === 0);
        rank++;
      } else if (n.el && !isHit(n.judged)) {
        n.el.style.transform = `translate3d(0,${(y - NOTE_H / 2).toFixed(1)}px,0)`;
      }
    }
  }

  // Shrinks text that does not fit (long fraction problems, narrow phone lanes). It sets --fit, a 0..1 factor
  // applied to the CSS font size, so the result stays correct when the layout is resized.
  // `limitW` = the width the text must fit in (defaults to the box itself).
  function fitText(box, inner, minRatio, sidePad, limitW) {
    box.style.setProperty('--fit', 1);
    const w0 = box.style.fontWeight;
    box.style.fontWeight = '800';                       // measure with the widest (bold) weight
    const room = (limitW || box.clientWidth) - sidePad;
    const w = inner.offsetWidth;
    box.style.setProperty('--fit', w > room && w > 0 ? Math.max(minRatio, room / w).toFixed(3) : 1);
    box.style.fontWeight = w0;
  }
  // A problem has to fit inside its lane (so it sits centred between the lane lines, also in the first / last lane).
  function fitNote(d) {
    const box = d.firstChild, cs = getComputedStyle(box);
    const sides = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + 2 * parseFloat(cs.borderLeftWidth);
    fitText(box, box.firstChild, 0.45, sides, Math.max(60, el.field.clientWidth / S.lanes - 6));
  }
  function fitPads() {
    [...el.pads.children].forEach((pad) => {
      const a = pad.querySelector('.pad-answer');
      if (a && a.firstChild) fitText(a, a.firstChild, 0.5, 16, pad.clientWidth);   // the pad is the limit, not the box inside it
    });
  }

  function createNote(n) {
    const d = document.createElement('div');
    const text = n.problem.text;
    d.className = 'note' + (NA.fmt.hasFraction(text) ? ' tall' : '');
    d.style.setProperty('--lane', n.lane);         // stacked fractions need more height
    d.innerHTML = `<div class="note-body" aria-label="${NA.fmt.plain(text)}"><span class="nb">${NA.fmt.html(text)}</span></div>`;
    el.notes.appendChild(d);
    n.el = d;
    fitNote(d);
  }

  // ---- judging ---------------------------------------------------------------------
  const LABELS = { perfect: 'SEMPURNA!', good: 'BAGUS!', early: 'KURANG PAS!', late: 'KURANG PAS!', wrong: 'KEPELESET!', pass: 'KEPELESET!' };
  const TONES = { perfect: 'perfect', good: 'good', early: 'off', late: 'off', wrong: 'bad', pass: 'bad' };

  function judge(n, kind, picked) {
    const p = n.problem;
    n.judged = kind;
    S.cur++;
    const hit = isHit(kind);
    let gained = 0;
    if (hit) {
      gained = Math.round(C.points[kind] * mult(S.streak) * S.scoreMult);        // combo multiplier x difficulty multiplier
      S.score += gained;
      S.correct++;
      S[kind]++;
      const onBeat = kind === 'perfect' || kind === 'good';
      if (onBeat ? true : C.offBeat.advancesCombo) {
        S.streak++;
        S.maxStreak = Math.max(S.maxStreak, S.streak);
      } else if (C.offBeat.breaksCombo) {
        S.streak = 0;
      }
      A.correct(kind);   // the next melody note, snapped to the beat grid
    } else {
      S.streak = 0;
      S.lives--;
      S.miss++;
      if (kind === 'wrong') {
        A.wrong();
        S.review.push({ text: p.solution, reason: `Kamu Menjawab ${picked}` });
      } else {
        A.miss();
        S.review.push({ text: p.solution, reason: 'Telat' });
      }
      el.field.classList.remove('shake');
      void el.field.offsetWidth;
      el.field.classList.add('shake');
    }
    showJudge(LABELS[kind], TONES[kind], hit ? `+${gained}` : '');     // the rating first, the points a moment later
    if (n.el) {
      n.el.classList.remove('current');
      n.el.classList.add(hit ? 'hit' : 'miss', `k-${kind}`);
      n.el.style.opacity = '';
      setTimeout(() => { n.removed = true; if (n.el) n.el.remove(); }, hit ? 420 : 900);
    } else n.removed = true;

    updateHud();
    if (S.lives <= 0 || S.correct >= S.total) {
      S.finishing = true;
      S.gameOver = S.lives <= 0;
      S.endTime = songTime() + (S.gameOver ? 0.9 : 1.1);
      if (S.gameOver) el.field.classList.add('dead');
    }
    refreshPads();
  }

  function showJudge(text, tone, pts) {
    const j = el.judge;
    j.innerHTML = `<span class="j-label">${text}</span>` + (pts ? `<span class="j-pts">${pts}</span>` : '');      // css delays .j-pts
    j.className = `judge ${tone}`;
    void j.offsetWidth;
    j.classList.add('show');
  }

  function notice(msg) {
    const t = el.toast;
    t.innerHTML = `<span>${msg}</span>`;
    t.className = 'toast';
    void t.offsetWidth;
    t.classList.add('show', 'long');
  }

  function tierToast(tIdx) {
    if (tIdx === 0) return;
    const t = el.toast;
    const labels = C.levels[S.levelIdx].tierLabels;            // fraction / decimal levels describe their own tiers
    t.innerHTML = `<b>Tahap ${tIdx + 1}</b><span>${(labels && labels[tIdx]) || C.tiers[tIdx].label}</span>`;
    t.className = 'toast';
    void t.offsetWidth;
    t.classList.add('show');
  }

  // ---- input -------------------------------------------------------------------------
  function laneDown(lane) {
    if (el.pads.children[lane]) el.pads.children[lane].classList.add('down');
    if (el.guides.children[lane]) el.guides.children[lane].classList.add('down');
    G.press(lane);
  }
  function laneUp(lane) {
    if (el.pads.children[lane]) el.pads.children[lane].classList.remove('down');
    if (el.guides.children[lane]) el.guides.children[lane].classList.remove('down');
  }
  function onKeyDown(e) {
    if (!S || !$('screen-game').classList.contains('active')) return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      if (S.paused) { if (!S.cdTimer) G.resume(); } else G.pause();
      return;
    }
    if (e.code in keyMap) {
      e.preventDefault();
      if (e.repeat) return;
      laneDown(keyMap[e.code]);
    }
  }
  function onKeyUp(e) {
    if (S && e.code in keyMap) laneUp(keyMap[e.code]);
  }

  G.press = function (lane) {
    A.wake();
    if (!S || S.paused || S.finishing) return;
    const t = songTime();
    processMisses(t);
    if (S.finishing) return;
    const n = S.notes[S.cur];
    if (!n || t - n.target < -C.windows.accept) {      // nothing to answer yet: no penalty
      showJudge('Tunggu…', 'wait');
      return;
    }
    const dt = t - n.target;
    const pad = el.pads.children[lane];
    if (lane >= n.problem.options.length) {            // an empty lane (comparison problems have only 3 answers)
      flashPad(pad, 'bad');
      showJudge('Lane kosong', 'wait');
      return;
    }
    if (lane !== n.problem.correct) {
      flashPad(pad, 'bad');
      judge(n, 'wrong', n.problem.options[lane]);
      return;
    }
    flashPad(pad, 'ok');
    const a = Math.abs(dt);
    judge(n, a <= C.windows.perfect ? 'perfect' : a <= C.windows.good ? 'good' : dt < 0 ? 'early' : 'late');
  };

  function flashPad(pad, cls) {
    if (!pad) return;
    pad.classList.remove('ok', 'bad');
    void pad.offsetWidth;
    pad.classList.add(cls);
  }

  // ---- HUD -----------------------------------------------------------------------------
  // Pads always show the answers of the problem closest to the line; dim when nothing is waiting.
  function refreshPads() {
    const note = S.notes[S.cur];
    el.pads.classList.toggle('idle', !note);
    if (!note || note === S.padNote) return;
    S.padNote = note;
    [...el.pads.children].forEach((pad, i) => {
      const a = pad.querySelector('.pad-answer');
      const tok = note.problem.options[i];
      pad.classList.toggle('blank', tok === undefined);
      a.classList.toggle('sym', tok === '<' || tok === '=' || tok === '>');   // comparison signs are drawn larger
      a.innerHTML = tok === undefined ? '' : `<span class="pa">${NA.fmt.html(tok)}</span>`;
      if (tok !== undefined) pad.setAttribute('aria-label', NA.fmt.plain(tok));
      else pad.removeAttribute('aria-label');
      a.classList.remove('swap');
      void a.offsetWidth;
      a.classList.add('swap');
    });
    el.pads.classList.toggle('frac', note.problem.options.some((o) => NA.fmt.hasFraction(o)));   // stacked fractions need the whole card: no key badge
    fitPads();
  }

  function buildHearts() {
    el.dots.innerHTML = '<i></i>'.repeat(C.comboStep);
    el.lives.innerHTML = '';
    for (let i = 0; i < C.lives; i++) {
      const h = document.createElement('span');
      h.className = 'heart on';
      h.innerHTML = icon('heart', 28);
      el.lives.appendChild(h);
    }
  }

  function updateHud() {
    el.score.textContent = S.score.toLocaleString('en-US');
    const m = mult(S.streak);
    el.label.innerHTML = `COMBO <b>X${m}</b>`;
    const filled = m >= C.maxMultiplier ? C.comboStep : S.streak % C.comboStep;
    [...el.dots.children].forEach((d, i) => d.classList.toggle('on', i < filled));
    [...el.lives.children].forEach((h, i) => {
      const alive = i < S.lives;
      if (h.classList.contains('on') && !alive) h.classList.add('lost');
      h.classList.toggle('on', alive);
    });
    const ti = tierIndex(S.correct);
    const before = C.tiers.slice(0, ti).reduce((s, t) => s + need(t), 0);
    const inTier = Math.min(need(C.tiers[ti]), S.correct - before);
    el.tier.textContent = `Tahap ${ti + 1}/${C.tiers.length}`;
    el.bpm.textContent = `${S.bpm} BPM`;
    el.tierBar.style.width = `${(inTier / need(C.tiers[ti])) * 100}%`;
  }

  // ---- pause ---------------------------------------------------------------------------
  G.pause = function () {
    if (!S || S.paused) return;
    S.paused = true;
    A.suspend();
    if (G.onPause) G.onPause(true);
  };

  G.resume = function () {
    if (!S || !S.paused || S.cdTimer) return;
    let n = 3;
    const step = () => {
      if (!S) return;
      if (n === 0) {
        S.cdTimer = 0;
        S.paused = false;
        A.resume();
        if (G.onCountdown) G.onCountdown(null);
        return;
      }
      if (G.onCountdown) G.onCountdown(n);
      n--;
      S.cdTimer = setTimeout(step, 650);
    };
    if (G.onPause) G.onPause(false);
    step();
  };

  // ---- finish --------------------------------------------------------------------------
  function finish() {
    cancelAnimationFrame(raf);
    A.stop();
    const w = C.accuracyWeights;
    const answered = S.perfect + S.good + S.early + S.late + S.miss;
    const accuracy = answered
      ? (S.perfect * w.perfect + S.good * w.good + S.early * w.early + S.late * w.late) / answered
      : 0;
    // stars = stages completed (also when the lives ran out): a stage is done when all its correct answers are in
    let stagesDone = 0, acc = 0;
    for (const t of C.tiers) { acc += need(t); if (S.correct >= acc) stagesDone++; else break; }
    const stars = stagesDone >= C.stars.three ? 3 : stagesDone >= C.stars.two ? 2 : stagesDone >= C.stars.one ? 1 : 0;
    const res = {
      levelIdx: S.levelIdx, diffIdx: S.diffIdx, bpm: S.bpm, tier: tierIndex(S.correct) + 1,
      score: S.score, accuracy, maxStreak: S.maxStreak,
      perfect: S.perfect, good: S.good, offBeat: S.early + S.late, miss: S.miss,
      review: S.review, stars, stagesDone, gameOver: S.gameOver, correct: S.correct,
    };
    if (S.gameOver) A.fail(); else A.fanfare();
    S.finishing = true;
    S = null;
    if (G.onFinish) G.onFinish(res);
  }
})();
