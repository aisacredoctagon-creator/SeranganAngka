/*
 * Serangan Angka - game configuration.
 * Every number you are likely to tune during playtesting lives in this one object.
 * URL shortcuts for quick tests:  ?mode=step   ?mode=smooth   ?lanes=4   ?unlock=all
 */
window.NA = window.NA || {};

NA.CONFIG = {
  // ===================== 1. SPACING & FALL TIME ============================
  approachBeats: 4,         // beats a problem takes to fall from the top to the target line (3-4 feels right)
  leadBeats: 4,             // beat on which the very first problem reaches the line
  // How often a problem reaches the line is set per level (levels[].noteEveryBeats below).
  breather: {               // rest after a run of problems: nothing falls for a few beats
    enabled: true,
    everyMin: 5, everyMax: 8,     // a rest comes after this many problems (random between)
    beatsMin: 2, beatsMax: 4,     // ...and lasts this many empty beats (random between)
  },

  // ===================== 2. TIMING FORGIVENESS =============================
  windows: {                // seconds either side of the beat
    perfect: 0.10,          // +-100 ms
    good: 0.25,             // +-250 ms
    accept: 0.40,           // +-400 ms: a correct answer in here still counts (as Early / Late)
  },
  inputOffsetMs: 0,         // manual latency calibration (+ = judge later)
  points: { perfect: 100, good: 60, early: 30, late: 30 },
  offBeat: {                // Early / Late = correct answer outside the Good window
    breaksCombo: false,     // never breaks the combo...
    advancesCombo: false,   // ...and (by default) does not grow it either
  },
  // How much each result counts toward the "Akurasi" % and the star rating
  accuracyWeights: { perfect: 1, good: 0.75, early: 0.4, late: 0.4, miss: 0 },

  // ===================== 3. DIFFICULTY TIERS ===============================
  // Tiers advance by the NUMBER OF CORRECT ANSWERS in the current run - never by score.
  // (Wrong answers and missed problems do not count; Early/Late correct answers do.)
  // digits  = [digits of the bigger number, digits of the smaller number]
  // correct = correct answers needed in this tier before moving on to the next one.
  //           Leave it out to use `defaultCorrect`.
  // The LAST tier's count is how many correct answers finish the level.
  defaultCorrect: 10,
  tiers: [
    { digits: [1, 1],                       label: '1 angka & 1 angka' },       // default: 10 correct
    { digits: [2, 1], correct: 10,          label: '2 angka & 1 angka' },
    { digits: [2, 2], correct: 15,          label: '2 angka & 2 angka' },
    { digits: [3, 2], correct: 10,          label: '3 angka & 2 angka' },
    { digits: [3, 3], correct: 5,           label: '3 angka & 3 angka' },
    { mix: [0, 1, 2, 3, 4],                 label: 'Campuran tahap 1-5' },      // default: 10 correct
  ],
  // Gap between answer choices (choices are a tight cluster: x, x+step, x+2*step, sorted
  // low -> high, with the right answer at a random place). One value per digit tier (1-5);
  // smaller = choices closer together = harder.
  distractorStep: [3, 2, 2, 1, 1],

  // ===================== 4. MOVEMENT MODE ==================================
  movementMode: 'smooth',   // 'smooth' = continuous fall | 'step' = one eased step per beat
  step: {
    moveFraction: 0.35,     // step mode: the move takes this part of a beat and ends ON the beat
  },
  // (also switchable on the menu screen; the menu choice is remembered)

  // ===================== SCORING / PROGRESSION =============================
  lives: 5,
  comboStep: 5,             // perfect/good answers in a row needed to raise the multiplier
  maxMultiplier: 4,
  stars: { two: 0.6, three: 0.85 },   // weighted accuracy needed (finishing = 1 star)
  unlockScore: 100,         // score needed in level N to unlock level N+1
  unlockAll: false,         // true = every level open (handy for teachers/testing)

  // ===================== LAYOUT ============================================
  layout: {
    lineRatio: 0.86,        // the target line sits at this fraction of the field height (the layout is fluid)
  },

  // ===================== CONTROLS & LOOK ===================================
  keys: {
    3: [
      { code: 'KeyF', label: 'F' }, { code: 'Space', label: 'Spasi' }, { code: 'KeyJ', label: 'J' },
    ],
    4: [
      { code: 'KeyD', label: 'D' }, { code: 'KeyF', label: 'F' },
      { code: 'KeyJ', label: 'J' }, { code: 'KeyK', label: 'K' },
    ],
    5: [
      { code: 'KeyD', label: 'D' }, { code: 'KeyF', label: 'F' },
      { code: 'Space', label: 'Spasi' },
      { code: 'KeyJ', label: 'J' }, { code: 'KeyK', label: 'K' },
    ],
  },
  laneColors: {
    3: ['#FF4D8D', '#12B886', '#2D9CFF'],
    4: ['#FF4D8D', '#FF9F1C', '#12B886', '#2D9CFF'],
    5: ['#FF4D8D', '#FF9F1C', '#A78BFA', '#12B886', '#2D9CFF'],
  },

  // ===================== TEMPO ==============================================
  // bpm = [stage 0, stage 1, stage 2]; each level picks a stage via levels[].bpmStage.
  difficulties: [
    { id: 'easy',   label: 'Mudah',    bpm: [60, 70, 80] },
    { id: 'medium', label: 'Menengah', bpm: [80, 90, 100] },
    { id: 'hard',   label: 'Susah',    bpm: [100, 110, 120] },
  ],

  // ===================== LEVELS ============================================
  // lanes          answer choices on screen (3 or 4)
  // bpmStage       0/1/2 -> which BPM in difficulties[].bpm (rises from level 4)
  // noteEveryBeats a problem reaches the line every N beats (4 -> 3 -> 2 in later levels)
  // cap            [max digits big number, max digits small number] for mul/div
  //                (so 3-digit x 3-digit multiplication never happens)
  // tierLabels     optional text shown when a tier starts (default: the digit labels in `tiers`)
  levels: [
    { name: 'Penjumlahan', sample: '7 + 5',     type: 'add',  lanes: 3, bpmStage: 0, noteEveryBeats: 4 },
    { name: 'Perkalian',   sample: '3 × 4',     type: 'mul',  lanes: 3, bpmStage: 0, noteEveryBeats: 4, cap: [2, 2] },
    { name: 'Pengurangan', sample: '8 - 4',     type: 'sub',  lanes: 3, bpmStage: 0, noteEveryBeats: 3 },
    { name: 'Pembagian',   sample: '4 ÷ 2',     type: 'div',  lanes: 3, bpmStage: 1, noteEveryBeats: 3, cap: [2, 1] },
    { name: 'Campur',      sample: '+ × - ÷',   type: 'mix',  lanes: 3, bpmStage: 1, noteEveryBeats: 3, mixOf: [0, 1, 2, 3] },
    // Pecahan / Desimal use the SAME fields as every other level (lanes, bpmStage, noteEveryBeats, tiers by correct
    // answers, melody track in music.js). They only ask the four basic operations (+ - x /); the difficulty comes
    // from the numbers. They get 4 beats per problem because "3/4 x 2/3" or "4.5 / 0.5" needs more thinking time
    // than "7 + 5".
    //
    // fracTiers[t]: dens (denominators), related (unlike denominators where one divides the other, e.g. 1/2 + 1/4),
    //   noImproper (same-denominator sums stay <= 1), types = weights of the problem kinds. Available kinds:
    //   addSame subSame addUnlike subUnlike mul div   (fractions.js also has simplify, compare, equiv, mixedToImproper,
    //   improperToMixed, toDecimal, toPercent - not used by default; add them here to switch them on again).
    { name: 'Pecahan',     sample: '{1/2} + {1/3}', type: 'frac', lanes: 4, bpmStage: 2, noteEveryBeats: 4,
      tierLabels: ['Penyebut sama, kecil', 'Penyebut sama + perkalian', 'Penyebut berbeda (kelipatan)',
                   'Semua operasi', 'Penyebut besar', 'Campuran tahap 1-5'],
      fracTiers: [
        { dens: [2, 3, 4, 5], noImproper: true,
          types: { addSame: 3, subSame: 2 } },
        { dens: [2, 3, 4, 5, 6, 8],
          types: { addSame: 2, subSame: 2, mul: 2 } },
        { dens: [2, 3, 4, 5, 6, 8], related: true,
          types: { addUnlike: 3, subUnlike: 2, mul: 2, div: 1 } },
        { dens: [2, 3, 4, 5, 6, 8, 9, 10],
          types: { addUnlike: 2, subUnlike: 2, mul: 2, div: 2 } },
        { dens: [2, 3, 4, 5, 6, 7, 8, 9, 10, 12],
          types: { addUnlike: 2, subUnlike: 2, mul: 2, div: 2 } },
      ] },

    // decTiers[t]: ints = digits of the whole part [a, b] (1 digit may be 0), places = decimals [a, b], types = weights:
    //   add sub             a + b, a - b
    //   mulWhole divWhole   decimal x whole number (2-9), decimal / whole number (comes out exact)
    //   mulDec divDec       decimal x 0.2-0.9, decimal / 0.2-0.9 (comes out exact)
    // Wrong choices include the classic slip of misplacing the decimal point (x10, /10).
    { name: 'Desimal',     sample: '0.32 + 0.67', type: 'dec', lanes: 4, bpmStage: 2, noteEveryBeats: 4,
      tierLabels: ['Tambah & kurang, 1 desimal', 'Kali bilangan bulat', 'Dua desimal, bagi bilangan bulat',
                   'Kali & bagi desimal', 'Bilangan lebih besar', 'Campuran tahap 1-5'],
      decTiers: [
        { ints: [1, 1], places: [1, 1], types: { add: 3, sub: 2 } },
        { ints: [2, 1], places: [1, 1], types: { add: 2, sub: 2, mulWhole: 2 } },
        { ints: [1, 1], places: [2, 2], types: { add: 2, sub: 2, mulWhole: 2, divWhole: 2 } },
        { ints: [1, 1], places: [1, 1], types: { add: 1, sub: 1, mulWhole: 1, mulDec: 2, divWhole: 1, divDec: 2 } },
        { ints: [2, 2], places: [1, 2], types: { add: 2, sub: 2, mulDec: 2, divDec: 2, divWhole: 1 } },
      ] },
  ],
};
