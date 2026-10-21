/*
 * Menu, results screen, overlays, saving, and touch/gesture hygiene.
 */
(function () {
  const NA = window.NA, C = NA.CONFIG, A = NA.Audio, G = NA.Game;
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

  // ---- URL options (handy for testing / teachers) ---------------------------
  const q = new URLSearchParams(location.search);
  if (['3', '4', '5'].includes(q.get('lanes'))) C.laneOverride = +q.get('lanes');   // force lane count in every level

  // ---- Lucide icons (https://lucide.dev, ISC licence) - one outline style; heart/star/play/pause are filled by CSS ----
  const SLASH = '<path class="slash" d="m2 2 20 20"/>';                    // drawn over an icon when its channel is muted
  const ICONS = {
    'volume-2': '<path d="M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"/><path class="wave" d="M16 9a5 5 0 0 1 0 6"/><path class="wave" d="M19.364 18.364a9 9 0 0 0 0-12.728"/>' + SLASH,
    'music': '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>' + SLASH,
    'audio-lines': '<path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/>' + SLASH,
    'play': '<polygon points="6 3 20 12 6 21 6 3"/>',
    'pause': '<rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/>',
    'trophy': '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
    'house': '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    'chevrons-right': '<path d="m6 17 5-5-5-5"/><path d="m13 17 5-5-5-5"/>',
    'chevron-right': '<path d="m9 18 6-6-6-6"/>',
    'star': '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    'heart': '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  };
  NA.icon = function (name, size) {
    return `<svg class="ic ic-${name}" width="${size || 24}" height="${size || 24}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
  };
  $$('[data-icon]').forEach((n) => { n.innerHTML = NA.icon(n.dataset.icon, +n.dataset.size || 24); });

  // ---- Save data --------------------------------------------------------------
  const KEY = 'serangan-angka.v1';
  const save = { best: {}, level: 0, diff: 0, vol: {}, mute: {} };
  try { Object.assign(save, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* private mode */ }
  // Sound settings. The panel has two sliders: Musik, and Efek = the melody you play AND the sound effects together
  // (two audio buses, one control). Older saves stored melody / sfx separately: the sfx value is used for Efek.
  const CHANNELS = [
    { id: 'music', label: 'Musik', icon: 'music', buses: ['music'] },
    { id: 'fx',    label: 'Efek',  icon: 'volume-2', buses: ['melody', 'sfx'] },
  ];
  save.vol = save.vol || {};
  save.mute = save.mute || {};
  if (typeof save.vol.music !== 'number') save.vol.music = NA.MUSIC.volumeDefaults.music;
  if (typeof save.vol.fx !== 'number') save.vol.fx = typeof save.vol.sfx === 'number' ? save.vol.sfx : NA.MUSIC.volumeDefaults.sfx;
  if (typeof save.mute.music !== 'boolean') save.mute.music = false;
  if (typeof save.mute.fx !== 'boolean') save.mute.fx = !!save.mute.sfx;
  if (save.sfx === false) save.mute.fx = true;
  if (save.music === false) save.mute.music = true;
  delete save.sfx;
  delete save.music;
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };

  const highScore = () => Math.max(0, ...Object.values(save.best));
  if (!(save.level >= 0 && save.level < C.levels.length)) save.level = 0;
  save.diff = Math.min(save.diff, C.difficulties.length - 1);

  // Movement mode: URL > remembered menu choice > config default ('smooth')
  const MODES = ['smooth', 'step'];
  const urlMode = q.get('mode');
  if (MODES.includes(urlMode)) C.movementMode = urlMode;
  else if (MODES.includes(save.movement)) C.movementMode = save.movement;

  // ---- Screens ----------------------------------------------------------------
  function show(name) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
    document.body.classList.toggle('playing', name === 'game');          // hides the decorative background while playing
    $('overlay-pause').classList.remove('open');
    $('countdown').classList.remove('open');
    $('screen-game').classList.remove('paused');
    if (name === 'menu') { renderMenu(); startMenuMusic(); } else A.menuMusic(false);
  }

  // ---- Menu -------------------------------------------------------------------
  // The menu BGM starts as soon as the browser lets audio run (first click / key press) and stops when a game starts.
  let launching = false;
  function startMenuMusic() {
    if (launching) return;
    A.ready(1500).then((ok) => { if (ok && !launching && $('screen-menu').classList.contains('active')) A.menuMusic(true); });
  }
  // hover + click sounds for every button in the menu (hover only for a real pointer, not for touch)
  {
    const menu = $('screen-menu');
    let hovered = null;
    menu.addEventListener('pointerover', (e) => {
      const b = e.pointerType === 'touch' ? null : e.target.closest('button');
      if (b === hovered) return;
      hovered = b;
      if (b && !b.disabled) A.uiHover();
    });
    menu.addEventListener('pointerleave', () => { hovered = null; });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b || b.disabled) return;
      if (b.id === 'btn-play') A.uiStart(); else A.uiClick();
    });
  }

  function renderMenu() {
    $('hs-value').textContent = highScore().toLocaleString('en-US');
    renderLevels();
    renderDiffs();
    renderMotion();
    renderHint();
    syncSound();
  }

  function renderHint() {
    const keys = C.keys[NA.laneCount(save.level)];
    $('key-chips').innerHTML = keys.map((k) => `<kbd class="key-chip">${k.label}</kbd>`).join('');
  }

  function renderMotion() {
    $$('#motion .mode-btn').forEach((b) => {
      const on = b.dataset.mode === C.movementMode;
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', String(on));
    });
  }
  $$('#motion .mode-btn').forEach((b) => b.addEventListener('click', () => {
    C.movementMode = b.dataset.mode;
    save.movement = b.dataset.mode;
    persist();
    renderMotion();
  }));

  // Level cards: coloured "LEVEL n" badge + status dot + name + operator tile; the chosen card gets a "DIPILIH" tag.
  function renderLevels() {
    const box = $('levels');
    box.innerHTML = '';
    $('lv-count').textContent = `${C.levels.length} Level Terbuka`;
    C.levels.forEach((L, i) => {
      const on = i === save.level;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'level' + (on ? ' selected' : '');
      b.dataset.tone = i % 7;                                              // colour of the card (css: --lv)
      b.setAttribute('aria-pressed', String(on));
      b.innerHTML =
        (on ? '<span class="lv-picked">DIPILIH</span>' : '') +
        `<span class="lv-top"><span class="lv-num">LEVEL ${i + 1}</span><i class="lv-dot"></i></span>` +
        `<span class="lv-name">${L.name}</span>` +
        `<span class="lv-sym">${NA.fmt.html(L.glyph || L.sample)}</span>`;
      b.addEventListener('click', () => { save.level = i; persist(); renderLevels(); renderHint(); });
      box.appendChild(b);
    });
  }

  function renderDiffs() {
    const box = $('diffs');
    box.innerHTML = '';
    C.difficulties.forEach((d, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'diff-btn' + (i === save.diff ? ' selected' : '');
      b.setAttribute('aria-pressed', String(i === save.diff));
      b.textContent = d.label;
      b.addEventListener('click', () => { save.diff = i; persist(); renderDiffs(); A.prepare(save.level, NA.bpmFor(save.level, i)); });   // start loading that song already
      box.appendChild(b);
    });
  }

  // Sound panel: a mute button + volume slider for each of music / melody / effects.
  // The same panel is built in the menu pop-up and in the pause overlay and kept in sync.
  function buildSoundPanels() {
    $$('[data-sound-panel]').forEach((panel) => {
      panel.innerHTML = CHANNELS.map((c) => `
        <div class="snd-row" data-ch="${c.id}">
          <button type="button" class="snd-mute" aria-label="Bisukan ${c.label}">${NA.icon(c.icon, 20)}</button>
          <span class="snd-label">${c.label}</span>
          <input type="range" class="snd-range" min="0" max="100" step="5" aria-label="Volume ${c.label}">
          <output class="snd-val"></output>
        </div>`).join('');
      $$('.snd-row', panel).forEach((row) => {
        const ch = row.dataset.ch;
        const range = row.querySelector('.snd-range');
        row.querySelector('.snd-mute').addEventListener('click', () => {
          save.mute[ch] = !save.mute[ch];
          applyChannel(ch);
          persist();
          syncSound();
        });
        range.addEventListener('input', (e) => {
          save.vol[ch] = e.target.value / 100;
          if (save.mute[ch] && save.vol[ch] > 0) save.mute[ch] = false;                              // moving the slider un-mutes
          applyChannel(ch);
          persist();
          syncSound();
        });
        range.addEventListener('change', () => { if (ch === 'fx') { A.init(); A.click(); } });
      });
    });
    syncSound();
  }
  function syncSound() {
    $$('.snd-row').forEach((row) => {
      const ch = row.dataset.ch;
      const m = save.mute[ch];
      const mb = row.querySelector('.snd-mute');
      mb.classList.toggle('muted', m);
      mb.setAttribute('aria-pressed', String(!m));
      const r = row.querySelector('.snd-range');
      r.value = Math.round(save.vol[ch] * 100);
      r.style.setProperty('--fill', `${r.value}%`);
      row.querySelector('.snd-val').textContent = m ? 'mati' : r.value;
      row.classList.toggle('off', m);
    });
  }
  function applyChannel(id) {
    const c = CHANNELS.find((x) => x.id === id);
    c.buses.forEach((b) => { A.setVolume(b, save.vol[id]); A.setMute(b, save.mute[id]); });
  }
  CHANNELS.forEach((c) => applyChannel(c.id));
  buildSoundPanels();

  // menu pop-up
  const pop = $('snd-pop'), popBtn = $('btn-sound');
  const setPop = (open) => { pop.hidden = !open; popBtn.setAttribute('aria-expanded', String(open)); };
  popBtn.addEventListener('click', (e) => { e.stopPropagation(); setPop(pop.hidden); });
  document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target)) setPop(false); });
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape') setPop(false); });

  // Optional audio files (see js/music.js) are loaded first; with the built-in synth this returns at once.
  async function launch(level, diff) {
    if (launching) return;
    launching = true;
    A.menuMusic(false);
    try {
      A.init();                                       // inside the click, so the browser allows audio
      const btn = $('btn-play');
      const label = btn.innerHTML;
      btn.disabled = true;                            // while the audio device wakes up and the song loads
      btn.textContent = 'Memuat musik…';
      // Start the game only when the audio clock is really running, so beat and visuals begin together.
      await Promise.race([
        Promise.all([A.prepare(level, NA.bpmFor(level, diff)), A.ready(3000)]),
        new Promise((r) => setTimeout(r, 15000)),     // a slow connection: start without the song after 15 s
      ]);
      btn.innerHTML = label;
      btn.disabled = false;
      show('game');
      G.start(level, diff);
    } finally { launching = false; }
  }
  function startGame() { launch(save.level, save.diff); }
  $('btn-play').addEventListener('click', startGame);

  window.addEventListener('keydown', (e) => {
    if (!$('screen-menu').classList.contains('active')) return;
    if (e.code === 'Enter') { e.preventDefault(); startGame(); }
    if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
      const dir = e.code === 'ArrowRight' ? 1 : -1;
      const i = save.level + dir;
      if (i >= 0 && i < C.levels.length) { save.level = i; persist(); renderLevels(); renderHint(); }
    }
  });

  // ---- Pause overlay / countdown ---------------------------------------------
  $('btn-pause').addEventListener('click', (e) => { e.currentTarget.blur(); G.pause(); });
  $('pause-resume').addEventListener('click', () => G.resume());
  $('pause-restart').addEventListener('click', () => { $('overlay-pause').classList.remove('open'); $('screen-game').classList.remove('paused'); G.restart(); });
  $('pause-menu').addEventListener('click', () => { G.stop(); show('menu'); });

  // while paused / counting down the moving dashed lines stand still too (css: .paused)
  G.onPause = (paused) => { $('overlay-pause').classList.toggle('open', paused); $('screen-game').classList.toggle('paused', paused); };
  G.onCountdown = (n) => {
    const c = $('countdown');
    if (n === null) { c.classList.remove('open'); $('screen-game').classList.remove('paused'); return; }
    c.classList.add('open');
    $('screen-game').classList.add('paused');
    const num = $('countdown-num');
    num.textContent = n;
    num.classList.remove('tick'); void num.offsetWidth; num.classList.add('tick');
  };

  // ---- Results ------------------------------------------------------------------
  let last = null;
  G.onFinish = function (res) {
    last = res;
    const prev = save.best[res.levelIdx] || 0;
    if (res.score > prev) save.best[res.levelIdx] = res.score;
    persist();
    renderResults(res);
    show('results');
  };

  function renderResults(r) {
    const L = C.levels[r.levelIdx];
    $('res-stars').innerHTML = [1, 2, 3].map((n) => `<span class="star${n <= r.stars ? ' on' : ''}" style="--i:${n}">${NA.icon('star', 30)}</span>`).join('');
    $('res-title').textContent = r.gameOver ? 'Nyawa Habis' : 'Selesai';
    $('res-sub').innerHTML = `<span>Level ${r.levelIdx + 1} - ${L.name}</span><i>•</i><span>${r.bpm} BPM</span><i>•</i><span>Tahap ${r.tier}</span>`;
    $('res-score').textContent = r.score.toLocaleString('en-US');
    $('res-acc').textContent = `${Math.round(r.accuracy * 100)}%`;
    $('res-combo').textContent = `×${r.maxStreak}`;
    const total = Math.max(1, r.perfect + r.good + r.offBeat + r.miss);
    [['perfect', r.perfect], ['good', r.good], ['off', r.offBeat], ['miss', r.miss]].forEach(([k, v]) => {
      $(`res-${k}`).textContent = v;
      $(`bar-${k}`).style.width = `${Math.max(v ? 6 : 0, (v / total) * 100)}%`;
    });
    $('res-missbadge').textContent = `${r.miss} Soal Terlewat`;
    $('res-missbadge').hidden = r.miss === 0;
    // "6 + 2 = 8" -> question + (green) answer; "Kamu Menjawab {x}" -> label + red answer; "Telat" -> a chip on its own
    $('res-review').innerHTML = r.review.length
      ? r.review.map((x) => {
        const m = /^Kamu Menjawab (.*)$/.exec(x.reason);
        const why = m
          ? `<span class="rv-label">Kamu Menjawab</span><b class="rv-wrong">${NA.fmt.html(m[1])}</b>`
          : `<span class="rv-label">${NA.fmt.html(x.reason)}</span>`;
        const k = x.text.lastIndexOf(' = ');
        const q = k < 0
          ? NA.fmt.html(x.text)
          : `${NA.fmt.html(x.text.slice(0, k + 3))}<span class="rv-ans">${NA.fmt.html(x.text.slice(k + 3))}</span>`;
        return `<li><span class="rv-q">${q}</span><span class="rv-why">${why}</span></li>`;
      }).join('')
      : '<li class="rv-empty">Tidak ada yang salah. Keren!</li>';
  }

  $('res-again').addEventListener('click', () => launch(last.levelIdx, last.diffIdx));
  // "Lanjut Level" is always available (all levels are open); after the last level it wraps to level 1.
  $('res-next').addEventListener('click', () => {
    if (!last) return;
    save.level = (last.levelIdx + 1) % C.levels.length; persist();
    launch(save.level, last.diffIdx);
  });
  $('res-menu').addEventListener('click', () => { save.level = last.levelIdx; persist(); show('menu'); });

  // ---- touch hygiene --------------------------------------------------------------
  // no pinch-zoom (iOS ignores user-scalable=no), no long-press menu while playing
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault()));
  document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
  document.addEventListener('contextmenu', (e) => { if (document.body.classList.contains('playing')) e.preventDefault(); });
  // Mobile browsers only start audio from a user gesture: create + resume the AudioContext on the very first touch/key.
  // Firefox only counts click / keydown / touchend as a gesture (not pointerdown), so listen to all of them and keep
  // trying until the context is really running.
  const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
  const unlockAudio = () => {
    A.init();
    if ($('screen-menu').classList.contains('active')) startMenuMusic();
    if (A.isRunning()) UNLOCK_EVENTS.forEach((ev) => window.removeEventListener(ev, unlockAudio, true));
  };
  UNLOCK_EVENTS.forEach((ev) => window.addEventListener(ev, unlockAudio, true));

  // ---- show unexpected errors on screen instead of failing silently ---------------------
  function showError(msg) {
    const b = $('error-banner');
    b.hidden = false;
    b.textContent = `Terjadi kesalahan: ${msg}  (tekan F12 untuk detail)`;
  }
  window.addEventListener('error', (e) => showError(e.message));
  window.addEventListener('unhandledrejection', (e) => showError(String(e.reason && e.reason.message || e.reason)));

  // ---- go ---------------------------------------------------------------------------
  G.init();
  show('menu');
})();
